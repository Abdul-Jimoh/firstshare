"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="py-24 text-center">
      <h1 className="text-4xl font-medium tracking-tight">Market data didn&apos;t load.</h1>
      <p className="mt-2 text-muted">This is usually brief. Try again in a moment.</p>
      <button onClick={reset} className="mt-8 rounded-full bg-ink px-6 py-3 text-sm font-medium text-white">
        Try again
      </button>
    </div>
  );
}
