import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI AssemblyLine",
  description: "Script-to-storyboard and AI video production workflow.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
