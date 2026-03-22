import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "LevelUp Pro",
  description: "Prepare for interviews, certifications, and professional development.",
  icons: {
    icon: "/levelup-pro-mark.svg",
    shortcut: "/levelup-pro-mark.svg",
    apple: "/levelup-pro-mark.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Script
          src={`https://www.paypal.com/sdk/js?client-id=${process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || "AW852uoaKcXaJIzmwHyLKhfjwNvPtdiEttGQbJPkEov1Ig_T_Y2V0uhUWghVlxIyeuyhHpkuG_KBSZCI"}&vault=true&intent=subscription`}
          strategy="afterInteractive"
          data-sdk-integration-source="button-factory"
        />
        {children}
      </body>
    </html>
  );
}
