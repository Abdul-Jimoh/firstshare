import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-24 text-center">
      <h1 className="text-4xl font-medium tracking-tight">We couldn&apos;t find that.</h1>
      <p className="mt-2 text-muted">It may not be available as a tokenized stock yet.</p>
      <Link href="/stocks" className="mt-8 inline-block rounded-full bg-ink px-6 py-3 text-sm font-medium text-surface">
        Explore companies
      </Link>
    </div>
  );
}
