import type { SupabaseClient } from "@supabase/supabase-js";

// Adjust affiliate commissions after a refund. Keep in sync with
// adjustCommissionsForRefund in supabase/functions/stripe-webhook/index.ts,
// which handles refunds made directly in the Stripe dashboard.
//
// Commission is recomputed from the original base (order_subtotal) and the
// affiliate's rate, scaled by the unrefunded share of the charge, so repeated
// partial refunds and duplicate events give the same result. A full refund
// voids the commission. Commissions already paid out are left unchanged.
export async function adjustCommissionsForRefund(
  supabase: SupabaseClient,
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
