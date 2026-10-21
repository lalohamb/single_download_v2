import type { Metadata } from "next";
import { AccountAuthForm } from "@/app/account/components/AccountAuthForm";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to your customer account.",
  robots: { index: false, follow: false },
};

export default function AccountLoginPage() {
  return <AccountAuthForm mode="login" />;
}

