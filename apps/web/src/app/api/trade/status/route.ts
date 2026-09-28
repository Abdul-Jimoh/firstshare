import { tradeStatus } from "@/lib/trade";

export async function GET(request: Request) {
  const hash = new URL(request.url).searchParams.get("hash") ?? "";
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) return Response.json({ error: "Invalid transaction hash." }, { status: 400 });
  try {
    return Response.json(await tradeStatus(hash));
  } catch {
    return Response.json({ status: "unknown", feeBnb: null, transfers: [] });
  }
}
