import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GST Sales Portal",
  description: "Daily sales capture for merchants and HSN mapping for the CA firm",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
