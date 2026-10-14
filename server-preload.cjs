// Preloaded with `node -r ./server-preload.cjs` BEFORE anything else (including Next.js).
// Next.js 14 builds its per-request tracker from `globalThis.AsyncLocalStorage` when
// present, and falls back to a fake that throws
// "Invariant: AsyncLocalStorage accessed in runtime where it is not available"
// on every page render when it isn't. Some Node setups don't expose the global,
// so we install the real one from async_hooks up front. Harmless no-op otherwise.
try {
  if (typeof globalThis.AsyncLocalStorage === "undefined") {
    const { AsyncLocalStorage } = require("node:async_hooks");
    globalThis.AsyncLocalStorage = AsyncLocalStorage;
    console.log("… installed real AsyncLocalStorage global for Next.js");
  }
} catch (err) {
  console.error("… could not install AsyncLocalStorage global:", err);
}
