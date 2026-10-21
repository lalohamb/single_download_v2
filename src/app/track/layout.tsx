import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Track Order",
  description: "Track the status of your Body & Sleeves order.",
  robots: { index: false, follow: false },
};

export default function TrackLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
