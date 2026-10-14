import { createBrowserClient } from "@supabase/ssr";

/** Supabase client for browser components (uses the publishable key — safe for client use). */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
