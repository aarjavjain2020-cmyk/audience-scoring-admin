import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Audience scoring · Admin",
  description: "Manage the current song and audience scoring.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
