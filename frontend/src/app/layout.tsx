import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Business AI Game (BAG)",
  description: "Agentic Prisoner's Dilemma - Crimson Dynamics vs Verdant Systems",
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
