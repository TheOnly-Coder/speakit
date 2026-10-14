import type { Metadata } from "next";
import "./globals.css";

export const dynamic = "force-dynamic"; // Speakit is fully authenticated + realtime: never statically prerender

export const metadata: Metadata = {
  title: "Speakit — Group Chat & Voice",
  description: "Speakit is a Discord-like community chat app: servers, channels, DMs, and voice.",
  icons: [{ rel: "icon", url: "/favicon.svg" }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="h-screen overflow-hidden">{children}</body>
    </html>
  );
}
