import type { Metadata } from "next";
import { notFound } from "next/navigation";
import StorefrontLayout from "@/components/StorefrontLayout";
import AffiliateSignupForm from "./AffiliateSignupForm";
import { isAffiliateProgramEnabled } from "@/lib/affiliate-program";

export const metadata: Metadata = {
  title: "Become an Affiliate",
  description: "Apply to the Body & Sleeves affiliate program and earn a 10% commission on every sale you refer.",
  alternates: { canonical: "/affiliates/signup" },
};

export default async function AffiliateSignupPage() {
  if (!(await isAffiliateProgramEnabled())) notFound();

  return (
    <StorefrontLayout>
      <AffiliateSignupForm />
    </StorefrontLayout>
  );
}
