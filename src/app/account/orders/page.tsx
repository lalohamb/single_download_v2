import type { Metadata } from "next";
import { OrdersClient } from "@/app/account/components/OrdersClient";

export const metadata: Metadata = {
  title: "My Orders",
  description: "Review and track your orders.",
  robots: { index: false, follow: false },
};

export default function AccountOrdersPage() {
  return <OrdersClient />;
}

