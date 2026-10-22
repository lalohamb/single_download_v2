import type { Metadata } from "next";
import StorefrontLayout from "@/components/StorefrontLayout";
import AffiliateDashboardClient from "./AffiliateDashboardClient";

export const metadata: Metadata = {
  title: "Affiliate Dashboard",
  robots: { index: false, follow: false },
};

export default function AffiliateDashboardPage() {
  return (
    <StorefrontLayout>
      <AffiliateDashboardClient />
    </StorefrontLayout>
  );
}
