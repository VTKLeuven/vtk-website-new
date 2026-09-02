export default function StorageLoading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Measuring storage usage">
      <div>
        <div className="h-10 w-48 animate-pulse rounded-lg bg-zinc-200" />
        <div className="mt-3 h-4 max-w-2xl animate-pulse rounded bg-zinc-100" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-36 animate-pulse rounded-2xl border border-zinc-200 bg-white" />
        ))}
      </div>
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="h-64 animate-pulse rounded-2xl border border-zinc-200 bg-white" />
      ))}
      <span className="sr-only">Measuring storage usage…</span>
    </div>
  );
}
