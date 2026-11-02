import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Searchlight",
  description: "Find and approach UK SME owners who might sell.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
