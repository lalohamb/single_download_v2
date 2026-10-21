"use client";
import Link from "next/link";
import { XCircle, ShoppingBag, ArrowLeft } from "lucide-react";

export default function CheckoutCancelPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <div className="w-20 h-20 rounded-full bg-secondary-50 flex items-center justify-center mx-auto mb-6">
        <XCircle size={48} className="text-secondary-400" />
      </div>
      <h1 className="text-3xl font-bold text-secondary-900">Order Cancelled</h1>
      <p className="text-secondary-600 mt-4 text-lg">
        Your order was not completed. No payment was taken.
      </p>
      <div className="flex flex-wrap gap-4 justify-center mt-8">
        <Link href="/checkout" className="btn-primary flex items-center gap-2">
          <ArrowLeft size={18} /> Back to Checkout
        </Link>
        <Link href="/shop" className="btn-outline flex items-center gap-2">
          <ShoppingBag size={18} /> Continue Shopping
        </Link>
      </div>
    </div>
  );
}
