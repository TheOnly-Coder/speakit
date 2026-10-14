import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BackgroundLayer } from "@/components/BackgroundLayer";
import { PwaRegister } from "@/components/PwaRegister";

export const dynamic = "force-dynamic"; // Speakit is fully authenticated + realtime: never statically prerender

const APP_NAME = "Speakit";
const APP_DESC = "Speakit is a Discord-like community chat app: servers, channels, DMs, and voice.";

export const metadata: Metadata = {
  title: {
    default: "Speakit — Group Chat & Voice",
    template: "%s · Speakit",
  },
  description: APP_DESC,
  applicationName: APP_NAME,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: APP_NAME,
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#1e1f22" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        {/* Early connections shave ~100-300ms off first paint on repeat visits */}
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://fonts.gstatic.com" />
      </head>
      <body className="h-dvh overflow-hidden">
        <PwaRegister />
        <BackgroundLayer />
        <div className="relative z-10 h-full">{children}</div>
      </body>
    </html>
  );
}
