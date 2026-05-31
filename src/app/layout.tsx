import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Emmytech Ambassador Program",
  description: "Promote Emmytech. Earn rewards. Climb the ranks.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}