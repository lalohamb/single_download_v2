import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import Stripe from "npm:stripe@17.3.1";

// This function is called server-to-server by Stripe only.
// No CORS headers are needed or set.
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function safeParse<T>(raw: string | undefined | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

// The address the customer entered on Stripe's checkout page is the one they
// confirmed; it replaces the pre-checkout form address. API 2025-03+ moved it
// to collected_information.shipping_details.
function stripeShipping(session: Stripe.Checkout.Session): { name: string; address: Record<string, string> } | null {
  const s = session as unknown as {
    collected_information?: { shipping_details?: { name?: string; address?: Stripe.Address } };
    shipping_details?: { name?: string; address?: Stripe.Address };
  };
  const details = s.collected_information?.shipping_details ?? s.shipping_details;
  const a = details?.address;
  if (!a?.line1) return null;
  return {
    name: details?.name || "",
    address: {
      line1: a.line1,
      ...(a.line2 ? { line2: a.line2 } : {}),
      city: a.city || "",
      state: a.state || "",
      zip: a.postal_code || "",
      country: a.country || "US",
    },
  };
}

// Same logic as src/lib/affiliate-refunds.ts (used by the admin refund route).
// Full refund voids unpaid commissions; partial refunds scale them from the
// original base, so repeated or duplicate events give the same result.
async function adjustCommissionsForRefund(
  supabase: any,
  paymentIntentId: string,
  chargeAmount: number,
  amountRefunded: number,
): Promise<{ adjusted: number; paidOut: number }> {
  const { data: order } = await supabase.from("orders").select("id").eq("stripe_payment_intent_id", paymentIntentId).maybeSingle();
  if (!order) return { adjusted: 0, paidOut: 0 };

  const { data: conversions } = await supabase
    .from("affiliate_conversions")
    .select("id, affiliate_id, order_subtotal, status")
    .eq("order_id", order.id);
  if (!conversions?.length) return { adjusted: 0, paidOut: 0 };

  const remaining = chargeAmount > 0 ? Math.max(0, (chargeAmount - amountRefunded) / chargeAmount) : 0;
  let adjusted = 0;
  let paidOut = 0;
  for (const conv of conversions) {
    if (conv.status === "paid") { paidOut++; continue; }
    if (conv.status !== "pending" && conv.status !== "approved") continue;
    if (remaining === 0) {
      await supabase.from("affiliate_conversions").update({ status: "voided" }).eq("id", conv.id);
    } else {
      const { data: affiliate } = await supabase.from("affiliates").select("commission_rate").eq("id", conv.affiliate_id).maybeSingle();
      const rate = Number(affiliate?.commission_rate ?? 0);
      const commission = Math.round(Number(conv.order_subtotal) * rate * remaining * 100) / 100;
      await supabase.from("affiliate_conversions").update({ commission_amount: commission }).eq("id", conv.id);
    }
    adjusted++;
  }
  if (paidOut > 0) console.warn(`Refund on ${paymentIntentId}: ${paidOut} commission(s) already paid out; not adjusted`);
  return { adjusted, paidOut };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

    if (!stripeSecretKey) {
      return json({ error: "Stripe not configured" }, 500);
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2026-08-26.dahlia",
    });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (!webhookSecret) return json({ error: "Webhook secret not configured" }, 500);

    const body = await req.text();
    const signature = req.headers.get("stripe-signature");
    if (!signature) return json({ error: "Missing stripe-signature header" }, 400);

    const event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const paymentIntentId = session.payment_intent as string;

        // Re-fetch session with promotion_code expanded to get the actual code string
        const expandedSession = await stripe.checkout.sessions.retrieve(session.id, {
          expand: ["discounts.promotion_code"],
        });
        const discountAmount = (expandedSession.total_details?.amount_discount ?? 0) / 100;
        const firstDiscount = expandedSession.discounts?.[0] as Stripe.Discount & { promotion_code?: Stripe.PromotionCode } | undefined;
        const discountCode =
          (firstDiscount?.promotion_code && typeof firstDiscount.promotion_code === "object" ? firstDiscount.promotion_code.code : null)
          || firstDiscount?.coupon?.name
          || firstDiscount?.coupon?.id
          || null;

        const shipping = stripeShipping(expandedSession);

        // Claim the order: only a pending row moves to paid, so a Stripe retry
        // or a concurrent duplicate delivery updates nothing and is skipped.
        const { data: updatedOrder } = await supabase
          .from("orders")
          .update({
            status: "paid",
            stripe_payment_intent_id: paymentIntentId,
            livemode: event.livemode,
            ...(shipping ? { shipping_address: shipping.address, ...(shipping.name ? { shipping_name: shipping.name } : {}) } : {}),
            updated_at: new Date().toISOString(),
            total: (expandedSession.amount_total ?? 0) / 100,
            ...(discountAmount > 0 ? { discount_amount: discountAmount } : {}),
            ...(discountCode ? { discount_code: discountCode } : {}),
          })
          .eq("stripe_session_id", session.id)
          .eq("status", "pending")
          .select("id, subtotal, affiliate_code, items, shipping_address, shipping_name")
          .maybeSingle();

        if (!updatedOrder) {
          const { data: existing } = await supabase.from("orders").select("status").eq("stripe_session_id", session.id).maybeSingle();
          if (existing) {
            console.log(`Duplicate checkout.session.completed for ${session.id} (order already ${existing.status}); skipping`);
            return json({ received: true, duplicate: true });
          }
          console.error(`No order row for session ${session.id}; continuing with session metadata only`);
        }

        // Customer-facing order number: same as the success page, account pages
        // and guest tracking lookup (last 8 of the order id), not the session id.
        const orderRef = (updatedOrder?.id ?? session.id).slice(-8).toUpperCase();

        // Send Purchase event to Meta CAPI
        const fbAccessToken = Deno.env.get("FACEBOOK_ACCESS_TOKEN");
        const fbPixelId = Deno.env.get("FACEBOOK_PIXEL_ID");
        if (fbAccessToken && fbPixelId && updatedOrder) {
          const eventTime = Math.floor(Date.now() / 1000);
          // Meta CAPI requires SHA-256 hashed, lowercase email
          let hashedEmail: string[] = [];
          if (session.metadata?.email) {
            const encoded = new TextEncoder().encode(session.metadata.email.toLowerCase().trim());
            const hashBuf = await crypto.subtle.digest("SHA-256", encoded);
            hashedEmail = [Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, "0")).join("")];
          }
          await fetch(`https://graph.facebook.com/v18.0/${fbPixelId}/events`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              data: [{
                event_name: "Purchase",
                event_time: eventTime,
                event_id: `purchase_${updatedOrder.id}`,
                action_source: "website",
                user_data: {
                  em: hashedEmail,
                },
                custom_data: {
                  value: ((session.amount_total ?? 0) / 100).toFixed(2),
                  currency: "USD",
                  order_id: updatedOrder.id,
                },
              }],
              access_token: fbAccessToken,
            }),
          }).catch((e: Error) => console.error("Meta CAPI error:", String(e?.message ?? e).replace(/[\r\n]/g, " ")));
        }

        // Record affiliate conversion. Commission is on what the customer actually
        // paid for products: after discounts, excluding shipping and tax.
        const affiliateCode = updatedOrder?.affiliate_code || session.metadata?.affiliate_code;
        const totals = expandedSession.total_details;
        const commissionBase = Math.max(0, ((expandedSession.amount_total ?? 0) - (totals?.amount_shipping ?? 0) - (totals?.amount_tax ?? 0)) / 100);
        if (affiliateCode && updatedOrder && commissionBase > 0) {
          const { data: affiliate } = await supabase
            .from("affiliates")
            .select("id, commission_rate, email")
            .eq("code", affiliateCode)
            .eq("status", "active")
            .maybeSingle();

          if (affiliate) {
            const commission = Math.round(commissionBase * affiliate.commission_rate * 100) / 100;
            await supabase.from("affiliate_conversions").insert({
              affiliate_id: affiliate.id,
              order_id: updatedOrder.id,
              order_subtotal: commissionBase,
              commission_amount: commission,
              status: "pending",
            });

            // Notify affiliate of new conversion
            const resendKey = Deno.env.get("RESEND_API_KEY");
            const siteUrl = Deno.env.get("SITE_URL") || "https://your-store.example";
            const { data: affSettings } = await supabase.from("settings").select("store_name, email_from").limit(1).maybeSingle();
            const affFromAddr = affSettings?.email_from || Deno.env.get("EMAIL_FROM") || "no-reply@your-store.example";
            const affStoreName = affSettings?.store_name || "Your Store";
            if (resendKey && affiliate.email) {
              await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                  from: `${affStoreName} <${affFromAddr}>`,
                  to: affiliate.email,
                  subject: `You earned ${commission.toFixed(2)} — new sale through your link! 🎉`,
                  html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px">
                    <h2 style="color:#111">New Sale!</h2>
                    <p>Someone just purchased through your referral link.</p>
                    <table style="width:100%;border-collapse:collapse;margin:24px 0">
                      <tr><td style="padding:8px 0;color:#666">Order Value</td><td style="padding:8px 0;font-weight:600;text-align:right">$${commissionBase.toFixed(2)}</td></tr>
                      <tr><td style="padding:8px 0;color:#666">Your Commission</td><td style="padding:8px 0;font-weight:700;color:#16a34a;text-align:right">$${commission.toFixed(2)}</td></tr>
                      <tr><td style="padding:8px 0;color:#666">Status</td><td style="padding:8px 0;text-align:right">Pending (14-day review)</td></tr>
                    </table>
                    <p><a href="${siteUrl}/affiliates/dashboard" style="background:#d4af37;color:#111;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">View Dashboard →</a></p>
                    <p style="color:#666;font-size:13px;margin-top:32px">— The Body &amp; Sleeves Team</p>
                  </div>`,
                }),
              }).catch((e: Error) => console.error("Affiliate notification error:", String(e?.message ?? e).replace(/[\r\n]/g, " ")));
            }
          }
        }

        // Add customer to MailerLite — only if they opted in at checkout
        const mailerLiteKey = Deno.env.get("MAILER_LITE_API_KEY");
        if (mailerLiteKey && session.metadata?.email && session.metadata?.marketing_opt_in === "true") {
          const mlName = session.metadata.shipping_name?.split(" ")[0] || "";
          const { data: mlSettings } = await supabase.from("settings").select("newsletter_group_id").limit(1).maybeSingle();
          const groupId = mlSettings?.newsletter_group_id;
          const mlUrl = groupId
            ? `https://connect.mailerlite.com/api/subscribers`
            : `https://connect.mailerlite.com/api/subscribers`;
          const mlPayload: Record<string, unknown> = { email: session.metadata.email, fields: { name: mlName } };
          if (groupId) mlPayload.groups = [groupId];
          await fetch(mlUrl, {
            method: "POST",
            headers: { "Authorization": `Bearer ${mailerLiteKey}`, "Content-Type": "application/json" },
            body: JSON.stringify(mlPayload),
          }).catch((e: Error) => console.error("MailerLite sync error:", String(e?.message ?? e).replace(/[\r\n]/g, " ")));
        }

        // Send order confirmation email via Resend
        const resendKey = Deno.env.get("RESEND_API_KEY");
        const { data: emailSettings } = await supabase.from("settings").select("store_name, email_from, email_support").limit(1).maybeSingle();
        const fromAddr = emailSettings?.email_from || Deno.env.get("EMAIL_FROM") || "orders@your-store.example";
        const supportAddr = emailSettings?.email_support || emailSettings?.email_from || Deno.env.get("EMAIL_FROM") || "hello@your-store.example";
        const storeName = emailSettings?.store_name || "Your Store";
        if (resendKey && session.metadata?.email) {
          const customerEmail = session.metadata.email;
          // A failed email must not stop fulfillment below: a retry of this event
          // is skipped as a duplicate once the order is marked paid.
          try {
          // Full items (with image_url) come from the order row.
          const orderItems = updatedOrder?.items ?? safeParse<any[]>(session.metadata?.items, []);
          const itemsHtml = orderItems.map((item: any) =>
            `<tr>
              <td style="padding:12px 0;vertical-align:top">
                ${ item.image_url ? `<img src="${item.image_url}" alt="${item.title}" width="100" height="100" style="border-radius:8px;object-fit:cover;display:block;margin-right:16px;float:left" />` : "" }
                <span style="display:block;padding-left:${item.image_url ? "116px" : "0"}">
                  <strong>${item.title}</strong><br/>
                  <span style="color:#666;font-size:13px">${item.variant_label} &times; ${item.quantity}</span>
                  ${item.personalization_text ? `<span style="color:#7c3aed;font-size:12px;display:block;margin-top:2px">✏️ ${item.personalization_text}</span>` : ""}
                </span>
              </td>
              <td style="padding:12px 0;vertical-align:top;text-align:right;white-space:nowrap">$${(item.price * item.quantity).toFixed(2)}</td>
            </tr>`
          ).join("");
          const resendRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: `${storeName} <${fromAddr}>`,
              to: customerEmail,
              subject: `Order Confirmed – #${orderRef}`,
              html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
                <h2>Thanks for your order, ${session.metadata.shipping_name?.split(" ")[0]}!</h2>
                <p>Your order <strong>#${orderRef}</strong> has been confirmed and is being processed.</p>
                <table style="width:100%;border-collapse:collapse">${itemsHtml}</table>
                <hr/>
                <p><strong>Total: $${((session.amount_total ?? 0) / 100).toFixed(2)}</strong></p>
                <p>We'll send you another email when your order ships.</p>
                <p></p>
                <p>If you have any questions, feel free to reply to this email </p>
                <p>or contact us at <a href="mailto:${supportAddr}?subject=Regarding%20Order%20%23${orderRef}">${supportAddr}</a></p>
                <p>Thanks for supporting our small business!</p>
                <p>— ${storeName}</p>
              </div>`,
            }),
          });
          if (!resendRes.ok) {
            const resendErr = await resendRes.text();
            console.error("Resend error:", resendRes.status, resendErr.replace(/[\r\n]/g, " "));
          }
          } catch (emailErr) {
            console.error("Order confirmation email failed:", String((emailErr as Error)?.message ?? emailErr).replace(/[\r\n]/g, " "));
          }
        }

        // Optionally forward to Printify for fulfillment
        // Record the fulfillment outcome on the order so failures are visible in
        // admin (Orders → Fulfillment) instead of only in function logs.
        const recordFulfillment = async (status: string, extra: Record<string, unknown> = {}) => {
          await supabase
            .from("orders")
            .update({ fulfillment_status: status, updated_at: new Date().toISOString(), ...extra })
            .eq("stripe_session_id", session.id);
        };
        const failFulfillment = async (reason: string) => {
          console.error(`Printify submission failed for ${session.id}: ${reason}`.replace(/[\r\n]/g, " "));
          await recordFulfillment(`printify_failed: ${reason}`.slice(0, 200));
        };

        const printifyToken = Deno.env.get("PRINTIFY_API_TOKEN");
        const { data: settingsData } = await supabase.from("settings").select("printify_shop_id").limit(1).maybeSingle();
        const printifyShopId = settingsData?.printify_shop_id || Deno.env.get("PRINTIFY_SHOP_ID");

        // Test-mode payments must not create real (billable) Printify orders.
        // Set PRINTIFY_SUBMIT_TEST_ORDERS=true to submit them anyway.
        if (!event.livemode && Deno.env.get("PRINTIFY_SUBMIT_TEST_ORDERS") !== "true") {
          console.log(`Test-mode payment ${session.id}: not submitted to Printify`);
          await recordFulfillment("test_mode_not_submitted");
        } else if (!printifyToken || !printifyShopId) {
          await failFulfillment("Printify is not configured (token or shop id missing)");
        } else {
          try {
            // Full item list from the order row; the metadata copy is only a
            // fallback for orders created before this change.
            const rows: any[] = updatedOrder?.items ?? safeParse<any[]>(session.metadata?.items, []);
            const lineItems = rows.map((item: any) => ({
              product_id: item.printify_id || undefined,
              variant_id: parseInt(item.variant_id) || undefined,
              quantity: item.quantity,
              ...(item.personalization_text || item.pt ? { print_details: [{ print_on_side: "front", text: item.personalization_text || item.pt }] } : {}),
            }));
            const missing = lineItems.filter((li) => !li.product_id || !li.variant_id).length;

            const address: Record<string, string> = shipping?.address ?? updatedOrder?.shipping_address ?? safeParse(session.metadata?.shipping_address, {});
            const fullName = shipping?.name || updatedOrder?.shipping_name || session.metadata?.shipping_name || "";

            if (lineItems.length === 0) {
              await failFulfillment("no line items found for this order");
            } else if (missing > 0) {
              await failFulfillment(`${missing} item(s) have no Printify product/variant id`);
            } else {
              const printifyOrder = {
                external_id: session.id,
                label: `BS-${orderRef}`,
                line_items: lineItems,
                shipping_method: 1,
                send_shipping_notification: false,
                address_to: {
                  first_name: fullName.split(" ")[0] || "",
                  last_name: fullName.split(" ").slice(1).join(" ") || "",
                  email: session.metadata?.email || session.customer_details?.email || "",
                  phone: session.customer_details?.phone || session.metadata?.phone || "0000000000",
                  country: address.country || "US",
                  region: address.state || "",
                  city: address.city || "",
                  address1: address.line1 || "",
                  address2: address.line2 || "",
                  zip: address.zip || "",
                },
              };

              const printifyRes = await fetch(
                `https://api.printify.com/v1/shops/${printifyShopId}/orders.json`,
                {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${printifyToken}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify(printifyOrder),
                }
              );

              if (printifyRes.ok) {
                const printifyOrderData = await printifyRes.json();
                await recordFulfillment(printifyOrderData.status || "pending", { printify_order_id: String(printifyOrderData.id) });
              } else {
                const detail = (await printifyRes.text()).slice(0, 120);
                await failFulfillment(`HTTP ${printifyRes.status} ${detail}`);
              }
            }
          } catch (printifyErr) {
            await failFulfillment(String((printifyErr as Error)?.message ?? printifyErr));
          }
        }
        break;
      }

      case "charge.refunded": {
        // Refunds made in the Stripe dashboard (admin-page refunds also adjust
        // directly; the calculation is idempotent, so both running is safe).
        const charge = event.data.object as Stripe.Charge;
        const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
        if (paymentIntentId) {
          await adjustCommissionsForRefund(supabase, paymentIntentId, charge.amount, charge.amount_refunded);
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await supabase
          .from("orders")
          .update({
            status: "cancelled",
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_payment_intent_id", paymentIntent.id);
        break;
      }

      default:
        break;
    }

    return json({ received: true });
  } catch (err) {
    return json({ error: err.message || "Webhook handler error" }, 500);
  }
});
