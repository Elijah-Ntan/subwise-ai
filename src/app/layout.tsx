import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "SubWise — Make room for what matters",
  description:
    "Understand your money, explore your options, and build a plan you can come back to.",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
