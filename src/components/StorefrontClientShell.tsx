"use client";
import CartDrawer from "@/components/CartDrawer";
import NewsletterPopup from "@/components/NewsletterPopup";
import AffiliateTracker from "@/components/AffiliateTracker";
import AttributionTracker from "@/components/AttributionTracker";
import { Suspense } from "react";

export default function StorefrontClientShell() {
  return (
    <>
      <CartDrawer />
      <NewsletterPopup />
      <Suspense fallback={null}><AffiliateTracker /></Suspense>
      <Suspense fallback={null}><AttributionTracker /></Suspense>
    </>
  );
}
