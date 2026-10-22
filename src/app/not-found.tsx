import type { Metadata } from "next";
import Link from "next/link";
import StorefrontLayout from "@/components/StorefrontLayout";

// Replaces the framework default, which emitted a second <title> (M2 SEO-014).
// Next.js adds the noindex robots tag to 404 responses itself.
export const metadata: Metadata = {
  title: "Page Not Found",
};

export default function NotFound() {
  return (
    <StorefrontLayout>
      <div className="max-w-2xl mx-auto px-4 py-24 text-center">
        <p className="text-gold-500 text-sm font-semibold tracking-widest uppercase">404</p>
        <h1 className="text-3xl lg:text-4xl font-bold text-secondary-900 mt-3">Page not found</h1>
        <p className="text-secondary-500 mt-4">The page you&apos;re looking for doesn&apos;t exist or is no longer available.</p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/shop" className="btn-primary px-8 py-3">Shop all products</Link>
          <Link href="/" className="btn-outline px-8 py-3">Back to home</Link>
        </div>
      </div>
    </StorefrontLayout>
  );
}
