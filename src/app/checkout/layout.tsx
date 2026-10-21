import type { Metadata } from "next";
import StorefrontLayout from "@/components/StorefrontLayout";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return <StorefrontLayout>{children}</StorefrontLayout>;
}
