import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LevelUp Pro",
  description: "Prepare for interviews, certifications, and professional development.",
  icons: {
    icon: "/levelup-pro-logo.svg",
    shortcut: "/levelup-pro-logo.svg",
    apple: "/levelup-pro-logo.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
