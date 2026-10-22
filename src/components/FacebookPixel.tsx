"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";

declare global {
  interface Window {
    fbq: ((...args: unknown[]) => void) & { loaded?: boolean };
    _fbq: unknown;
  }
}

export function fbq(...args: unknown[]) {
  if (typeof window !== "undefined" && typeof window.fbq === "function") {
    window.fbq(...args);
  }
}

export default function FacebookPixel({ pixelId }: { pixelId: string }) {
  const pathname = usePathname();
  const isFirst = useRef(true);
  const lastPathname = useRef("");

  useEffect(() => {
    if (isFirst.current) { isFirst.current = false; return; }
    if (lastPathname.current === pathname) return;
    lastPathname.current = pathname;
    fbq("track", "PageView");
  }, [pathname]);

  // Interpolated into an inline script — refuse anything that isn't a numeric pixel ID
  if (!pixelId || !/^\d{5,20}$/.test(pixelId)) return null;

  return (
    <>
      <Script id="fb-pixel" strategy="afterInteractive" dangerouslySetInnerHTML={{
        __html: `
          !function(f,b,e,v,n,t,s)
          {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window, document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', '${pixelId}');
          fbq('track', 'PageView');
        `,
      }} />
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element -- required noscript fallback for Meta Pixel */}
        <img height="1" width="1" style={{ display: "none" }}
          src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`} alt="" />
      </noscript>
    </>
  );
}
