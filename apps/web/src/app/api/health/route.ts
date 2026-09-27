import { clientFromEnv, rwaPlatforms, W3Error } from "@firstshare/core";

export async function GET() {
  const region = process.env.VERCEL_REGION ?? "local";
  const started = Date.now();
  try {
    const platforms = await rwaPlatforms(clientFromEnv());
    return Response.json({ ok: true, region, binance: { ms: Date.now() - started, platforms: platforms.map((p) => p.platformId) } });
  } catch (e) {
    const code = e instanceof W3Error ? e.code : null;
    return Response.json(
      {
        ok: false,
        region,
        binance: { code, regionBlocked: e instanceof W3Error && e.isRegionBlocked, error: e instanceof Error ? e.message : String(e) },
      },
      { status: 503 },
    );
  }
}
