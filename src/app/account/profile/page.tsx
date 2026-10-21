import type { Metadata } from "next";
import { ProfileClient } from "@/app/account/components/ProfileClient";

export const metadata: Metadata = {
  title: "Account Profile",
  description: "Manage your customer profile.",
  robots: { index: false, follow: false },
};

export default function AccountProfilePage() {
  return <ProfileClient />;
}

