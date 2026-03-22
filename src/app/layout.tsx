import type { Metadata } from "next";
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
        {children}
      </body>
    </html>
  );
}
