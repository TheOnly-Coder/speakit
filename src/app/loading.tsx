/** Instant paint skeleton while the authenticated app shell loads. */
export default function Loading() {
  return (
    <div className="speakit-shell-in flex h-screen overflow-hidden bg-speakit-bg">
      <div className="flex w-[72px] flex-col items-center gap-2 bg-speakit-rail py-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-12 w-12 animate-pulse rounded-full bg-white/10" />
        ))}
      </div>
      <div className="w-60 animate-pulse bg-speakit-sidebar p-3">
        <div className="mb-3 h-6 rounded bg-white/10" />
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-7 rounded bg-white/5" />
          ))}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="h-12 animate-pulse border-b border-black/30 bg-white/5" />
        <div className="flex-1 space-y-3 p-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3">
              <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-white/10" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-32 animate-pulse rounded bg-white/10" />
                <div className="h-3 w-3/4 animate-pulse rounded bg-white/5" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
