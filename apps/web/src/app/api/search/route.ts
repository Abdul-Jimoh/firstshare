import { findStocks } from "@/lib/data";
import { summarize } from "@/lib/stock";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.slice(0, 60) ?? "";
  if (!q.trim()) return Response.json({ q, results: [] });
  try {
    return Response.json({ q, results: (await findStocks(q, 8)).map(summarize) });
  } catch {
    return Response.json({ q, results: [], error: "Market data is unavailable right now." }, { status: 503 });
  }
}
