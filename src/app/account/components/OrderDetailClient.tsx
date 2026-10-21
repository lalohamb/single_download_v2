"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Package, Truck } from "lucide-react";
import { AccountShell, AuthRequired } from "@/app/account/components/AccountShell";
import AppImage from "@/components/AppImage";
import { getOrderStage, ORDER_STEPS } from "@/lib/account-data";
import { useCustomerAuth } from "@/lib/customer-auth";
import { formatPrice, supabase } from "@/lib/supabase";
import type { Order } from "@/types";

export function OrderDetailClient({ orderId }: { orderId: string }) {
  const { user, loading } = useCustomerAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [printify, setPrintify] = useState<{
    shipments?: { carrier: string; number: string; url: string; delivered_at: string | null }[];
    line_items?: { status: string; quantity: number; metadata: { title: string; variant_label: string } }[];
    created_at?: string;
    updated_at?: string;
  } | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!user?.email) return;
    const email = user.email;
    supabase.from("orders").select("*").eq("id", orderId).eq("email", email).maybeSingle().then(async ({ data }) => {
      if (!data || data.status === "pending") { setNotFound(true); return; }
      setOrder(data as Order);
      if (data.printify_order_id) {
        try {
          // printify-proxy is admin/server only; the track route checks the order
          // belongs to this email and returns just the tracking fields.
          const params = new URLSearchParams({ order: String(data.id).slice(-8).toUpperCase(), email });
          const res = await fetch(`/api/orders/track?${params}`);
          if (res.ok) setPrintify((await res.json()).printify);
        } catch { /* non-fatal */ }
      }
    });
  }, [orderId, user?.email]);

  if (loading) return <AccountShell><div className="bg-white rounded-lg border border-secondary-100 p-8 text-secondary-500">Loading order...</div></AccountShell>;
  if (!user) return <AccountShell><AuthRequired title="Sign in to track this order" /></AccountShell>;
  if (notFound) {
    return (
      <AccountShell>
        <div className="bg-white border border-secondary-100 rounded-lg shadow-sm p-8 text-center">
          <Package size={42} className="mx-auto text-secondary-200 mb-3" />
          <h1 className="text-2xl font-bold text-secondary-900">Order not found</h1>
          <p className="text-secondary-500 mt-2">This order is not linked to {user.email}.</p>
          <Link href="/account/orders" className="btn-primary mt-6">Back to orders</Link>
        </div>
      </AccountShell>
    );
  }
  if (!order) return <AccountShell><div className="bg-white rounded-lg border border-secondary-100 p-8 text-secondary-500">Loading order...</div></AccountShell>;

  const stage = getOrderStage(order);
  const address = order.shipping_address;
  const isCancelled = order.status === "cancelled";
  const awaitingApproval = stage === 2;

  return (
    <AccountShell>
      <div className="space-y-6">
        <Link href="/account/orders" className="inline-flex items-center gap-1 text-sm text-secondary-500 hover:text-secondary-900">
          <ArrowLeft size={16} />
          Back to orders
        </Link>

        <section className="bg-white border border-secondary-100 rounded-lg shadow-sm p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <p className="text-sm text-secondary-500">Order #{order.id.slice(-8).toUpperCase()}</p>
              <h1 className="text-3xl font-bold text-secondary-900 mt-1 capitalize">{
                order.fulfillment_status === "shipped" || order.tracking_number ? "Shipped" :
                order.fulfillment_status === "in-production" ? "In Production" :
                order.status === "fulfilled" ? "Fulfilled" :
                order.status === "paid" ? "Order Confirmed" :
                order.status === "cancelled" ? "Cancelled" :
                order.status.replace(/-/g, " ")
              }</h1>
              <p className="text-secondary-500 mt-2">{new Date(order.created_at).toLocaleString()}</p>
            </div>
            <div className="text-left md:text-right space-y-1">
              <div className="flex md:flex-col gap-4 md:gap-1 text-sm text-secondary-500">
                <div className="flex justify-between gap-8"><span>Subtotal</span><span>{formatPrice(order.subtotal)}</span></div>
                <div className="flex justify-between gap-8"><span>Shipping</span><span>{order.shipping_cost === 0 ? "Free" : formatPrice(order.shipping_cost)}</span></div>
                {Number(order.discount_amount) > 0 && (
                  <div className="flex justify-between gap-8 text-success-600">
                    <span>Discount{order.discount_code ? ` (${order.discount_code})` : ""}</span>
                    <span>-{formatPrice(Number(order.discount_amount))}</span>
                  </div>
                )}
              </div>
              <p className="text-2xl font-bold text-secondary-900 pt-1 border-t border-secondary-100">{formatPrice(order.total)}</p>
              <p className="text-xs text-secondary-400">Total paid</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-7 gap-2 mt-6">
            {isCancelled ? (
              <div className="col-span-2 md:col-span-7 rounded-lg border border-error-200 bg-error-50 text-error-700 px-3 py-2 text-xs font-medium">
                This order has been cancelled.
              </div>
            ) : (() => {
              const visibleSteps = [1, 2, 4, 5, 6];
              const currentStep = [...visibleSteps].reverse().find((s) => stage >= s) ?? -1;
              return ORDER_STEPS.filter((_, i) => visibleSteps.includes(i)).map((step, i) => (
                <div key={step} className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                  visibleSteps[i] === currentStep
                    ? "border-success-200 bg-success-50 text-success-700"
                    : "border-secondary-100 bg-secondary-50 text-secondary-400"
                }`}>
                  {step}
                </div>
              ));
            })()}
          </div>
          {awaitingApproval && (
            <p className="text-xs text-secondary-500 mt-3 bg-secondary-50 border border-secondary-100 rounded-lg px-4 py-3">
              ⏳ Your payment was received. Orders are reviewed before being sent to production — this usually takes 1–2 business days. You&apos;ll receive a shipping email once your order is on its way.
            </p>
          )}
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2 bg-white border border-secondary-100 rounded-lg shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-secondary-100">
              <h2 className="text-xl font-bold text-secondary-900">Items</h2>
            </div>
            <div className="divide-y divide-secondary-100">
              {order.items.map((item) => (
                <div key={`${item.product_id}-${item.variant_id}`} className="flex gap-4 p-5">
                  <AppImage src={item.image_url || "/product-placeholder.svg"} alt={item.title} width={72} height={72} className="w-20 h-20 rounded-lg object-cover bg-secondary-100 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-secondary-900">{item.title}</p>
                    <p className="text-sm text-secondary-500">{item.variant_label} · Qty {item.quantity}</p>
                    {item.personalization_text && <p className="text-sm text-primary-600 mt-1">{item.personalization_text}</p>}
                  </div>
                  <p className="font-semibold text-secondary-900">{formatPrice(item.price * item.quantity)}</p>
                </div>
              ))}
            </div>
          </section>

          <aside className="space-y-6">
            <section className="bg-white border border-secondary-100 rounded-lg shadow-sm p-5">
              <div className="flex items-center gap-2 mb-3">
                <Truck size={20} className="text-primary-500" />
                <h2 className="font-bold text-secondary-900">Tracking</h2>
              </div>
              {order.tracking_number ? (
                <div className="space-y-2">
                  <p className="text-sm text-secondary-500">Tracking number</p>
                  <p className="font-medium text-secondary-900 break-all">{order.tracking_number}</p>
                  {order.tracking_url && (
                    <a href={order.tracking_url} target="_blank" rel="noopener noreferrer" className="btn-outline w-full mt-3 text-sm">
                      Open tracking <ExternalLink size={15} className="ml-2" />
                    </a>
                  )}
                </div>
              ) : (
                <p className="text-sm text-secondary-500">Tracking will appear here once the order ships.</p>
              )}
            </section>

            {/* Printify Shipments */}
            {printify?.shipments && printify.shipments.length > 0 && (
              <section className="bg-white border border-secondary-100 rounded-lg shadow-sm p-5 space-y-3">
                <h2 className="font-bold text-secondary-900">Shipments</h2>
                {printify.shipments.map((s, i) => (
                  <div key={i} className="border border-secondary-100 rounded-lg p-3 space-y-1">
                    <p className="text-sm font-semibold text-secondary-900">{s.carrier}</p>
                    <p className="font-mono text-sm text-secondary-700">{s.number}</p>
                    {s.delivered_at && <p className="text-xs text-success-600">Delivered {new Date(s.delivered_at).toLocaleDateString()}</p>}
                    {s.url && (
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="btn-outline w-full mt-2 text-sm">
                        Track with {s.carrier} <ExternalLink size={14} className="ml-1" />
                      </a>
                    )}
                  </div>
                ))}
              </section>
            )}

            {/* Printify Line Items */}
            {printify?.line_items && printify.line_items.length > 0 && (
              <section className="bg-white border border-secondary-100 rounded-lg shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-secondary-100">
                  <h2 className="font-bold text-secondary-900">Fulfillment Details</h2>
                </div>
                <div className="divide-y divide-secondary-50">
                  {printify.line_items.map((item, i) => (
                    <div key={i} className="flex items-center justify-between px-5 py-3">
                      <div>
                        <p className="text-sm font-medium text-secondary-900">{item.metadata?.title}</p>
                        <p className="text-xs text-secondary-500">{item.metadata?.variant_label} · Qty {item.quantity}</p>
                      </div>
                      <span className="text-xs px-2 py-1 rounded-full bg-success-50 border border-success-200 text-success-700 capitalize">{item.status}</span>
                    </div>
                  ))}
                </div>
                {(printify.created_at || printify.updated_at) && (
                  <div className="px-5 py-3 border-t border-secondary-100 space-y-1 text-xs text-secondary-400">
                    {printify.created_at && <p>Date: {new Date(printify.created_at).toLocaleString()}</p>}
                    {printify.updated_at && <p>Last updated: {new Date(printify.updated_at).toLocaleString()}</p>}
                  </div>
                )}
              </section>
            )}

            <section className="bg-white border border-secondary-100 rounded-lg shadow-sm p-5">
              <h2 className="font-bold text-secondary-900 mb-3">Ship to</h2>
              <p className="font-medium text-secondary-900">{order.shipping_name}</p>
              <p className="text-sm text-secondary-500 mt-1">{address.line1}</p>
              {address.line2 && <p className="text-sm text-secondary-500">{address.line2}</p>}
              <p className="text-sm text-secondary-500">{address.city}, {address.state} {address.zip}</p>
              <p className="text-sm text-secondary-500">{address.country}</p>
            </section>

            <section className="bg-secondary-900 text-white rounded-lg p-5">
              <h2 className="font-bold">Need help?</h2>
              <p className="text-sm text-white/70 mt-2">Contact support with your order number for returns, size questions, or delivery issues.</p>
              <Link href="/refund-policy" className="btn-gold w-full mt-4 text-sm">View policy</Link>
            </section>
          </aside>
        </div>
      </div>
    </AccountShell>
  );
}
