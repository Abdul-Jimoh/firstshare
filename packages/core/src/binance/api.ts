import type { W3Client } from "./client.ts";
import type { PlatformId, PublicRwaListing, QuoteRoute, RwaPlatform, RwaPrice, RwaToken, RwaUnderlyingProfile } from "./types.ts";

export const BSC = "56";
export const USDT_BSC = "0x55d398326f99059fF775485246999027B3197955";

const PUBLIC_RWA_LIST_URL = "https://www.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/rwa/stock/detail/list/ai";
const PUBLIC_TYPE: Record<PlatformId, number> = { ondo: 1, bstock: 3 };

export function rwaPlatforms(client: W3Client) {
  return client.get<RwaPlatform[]>("/api/v1/dex/market/rwa/platforms");
}

export function rwaTokens(client: W3Client, platformId?: PlatformId) {
  return client.get<RwaToken[]>("/api/v1/dex/market/rwa/tokens", { binanceChainId: BSC, platformId });
}

export async function rwaPrices(client: W3Client, addresses: string[]): Promise<RwaPrice[]> {
  const out: RwaPrice[] = [];
  for (let i = 0; i < addresses.length; i += 20) {
    const batch = addresses.slice(i, i + 20);
    out.push(
      ...(await client.get<RwaPrice[]>("/api/v1/dex/market/rwa/price", {
        binanceChainId: BSC,
        tokenContractAddresses: batch.join(","),
      })),
    );
  }
  return out;
}

export function rwaUnderlyingProfile(client: W3Client, tokenContractAddress: string) {
  return client.get<RwaUnderlyingProfile>("/api/v1/dex/market/rwa/underlying-profile", { binanceChainId: BSC, tokenContractAddress });
}

export interface QuoteParams {
  fromTokenAddress: string;
  toTokenAddress: string;
  amount: bigint;
  userWalletAddress: string;
}

export function quote(client: W3Client, p: QuoteParams) {
  return client.get<QuoteRoute[]>("/api/v1/dex/aggregator/quote", {
    binanceChainId: BSC,
    fromTokenAddress: p.fromTokenAddress,
    toTokenAddress: p.toTokenAddress,
    amount: p.amount.toString(),
    userWalletAddress: p.userWalletAddress,
  });
}

export type CandleBar = "1d" | "1w" | "1h";

export interface Candle {
  t: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

// Rows come back ascending as [open, high, low, close, volume, timeMs, confirmed]; limit tops out at 300.
export async function candles(client: W3Client, tokenContractAddress: string, bar: CandleBar = "1d", limit = 300): Promise<Candle[]> {
  const rows = await client.get<number[][]>("/api/v1/dex/market/candles", { binanceChainId: BSC, tokenContractAddress, bar, limit: String(limit) });
  return rows.map(([open, high, low, close, , t]) => ({ t: t!, open: open!, high: high!, low: low!, close: close! }));
}

export async function publicRwaListings(platformId: PlatformId, fetchImpl: typeof fetch = fetch): Promise<PublicRwaListing[]> {
  const res = await fetchImpl(`${PUBLIC_RWA_LIST_URL}?type=${PUBLIC_TYPE[platformId]}`, {
    headers: { "Accept-Encoding": "identity" },
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json()) as { success?: boolean; data?: PublicRwaListing[] };
  if (!json.success || !Array.isArray(json.data)) throw new Error(`public RWA list failed for ${platformId}`);
  return json.data;
}

// The Web3 API returns report links on onchainos.bnbstatic.com, which answers 403; the same files are served from bin.bnbstatic.com.
export function reportUrl(url: string): string {
  return url.replace(/^https?:\/\/onchainos\.bnbstatic\.com/, "https://bin.bnbstatic.com");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function reportDate(url: string): string | null {
  const m = url.match(/(\d{4})-(\d{2})(?:-(\d{2}))?\.pdf$/);
  if (!m) return null;
  const month = MONTHS[Number(m[2]) - 1];
  return m[3] ? `${Number(m[3])} ${month}` : `${month} ${m[1]}`;
}
