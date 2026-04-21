import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OID Universe",
  description: "Federated OID subtree manager",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
