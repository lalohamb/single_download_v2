import type { Metadata } from "next";
import { PreferencesClient } from "@/app/account/components/PreferencesClient";

export const metadata: Metadata = {
  title: "Account Preferences",
  description: "Manage sizing, personalization, and notification preferences.",
  robots: { index: false, follow: false },
};

export default function AccountPreferencesPage() {
  return <PreferencesClient />;
}

