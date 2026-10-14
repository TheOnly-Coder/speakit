import type { Metadata } from "next";
import Link from "next/link";
import { BotDocs } from "@/components/BotDocs";

export const metadata: Metadata = {
  title: "Bot API Docs",
  description: "Build SpeakIt chat bots: in-site JavaScript API, slash commands, share codes, and the HTTP Bot API.",
};

export default function BotDocsPage() {
  return (
    <div className="h-dvh overflow-y-auto bg-[#1e1f22]">
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-10">
        <div className="mb-4 flex items-center gap-3">
          <Link
            href="/"
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-speakit-blurple text-lg font-black text-white"
            title="Back to SpeakIt"
          >
            S
          </Link>
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-black text-white">SpeakIt Bot Platform</div>
            <div className="text-xs text-speakit-muted">
              Make an account, open User Settings → Bots, and build. <Link href="/login" className="text-[#b5bdff] underline">Log in →</Link>
            </div>
          </div>
        </div>
        <BotDocs />
        <div className="mt-4 text-center text-xs text-speakit-muted">
          SpeakIt — servers, channels, DMs, voice, and programmable bots.
        </div>
      </div>
    </div>
  );
}
