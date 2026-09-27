import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { W3Client, W3Error, encodeQuery, preHash } from "../src/binance/client.ts";

const fixedNow = () => new Date("2026-05-11T10:08:57.715Z");

function fakeFetch(body: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe("signing", () => {
  it("builds the pre-hash exactly as the docs example", () => {
    expect(preHash("2026-05-11T10:08:57.715Z", "get", "/build/api/v1/dex/market/price?chainId=1&symbol=ETH%20USDT", "")).toBe(
      "2026-05-11T10:08:57.715ZGET/build/api/v1/dex/market/price?chainId=1&symbol=ETH%20USDT",
    );
  });

  it("encodes spaces as %20 and drops empty params", () => {
    expect(encodeQuery({ symbol: "ETH USDT", a: undefined, b: null, c: 0 })).toBe("symbol=ETH%20USDT&c=0");
  });

  it("signs the /build path with the query string", async () => {
    const { impl, calls } = fakeFetch({ code: 0, msg: "success", data: [] });
    const client = new W3Client({ apiKey: "k", secretKey: "s", fetch: impl, now: fixedNow });
    await client.get("/api/v1/dex/market/rwa/tokens", { binanceChainId: "56" });

    const { url, init } = calls[0]!;
    const headers = init.headers as Record<string, string>;
    const path = "/build/api/v1/dex/market/rwa/tokens?binanceChainId=56";
    expect(url).toBe(`https://web3.binance.com${path}`);
    expect(headers["X-OC-SIGN"]).toBe(createHmac("sha256", "s").update(`2026-05-11T10:08:57.715ZGET${path}`).digest("base64"));
    expect(headers["X-OC-RECV-WINDOW"]).toBe("15000");
  });

  it("signs the exact JSON body on POST", async () => {
    const { impl, calls } = fakeFetch({ code: 0, data: {} });
    const client = new W3Client({ apiKey: "k", secretKey: "s", fetch: impl, now: fixedNow });
    await client.post("/api/v1/dex/market/price", [{ chainId: "56" }]);
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(calls[0]!.init.body).toBe('[{"chainId":"56"}]');
    expect(headers["X-OC-SIGN"]).toBe(
      createHmac("sha256", "s").update('2026-05-11T10:08:57.715ZPOST/build/api/v1/dex/market/price[{"chainId":"56"}]').digest("base64"),
    );
  });
});

describe("errors", () => {
  it("treats a region block inside HTTP 200 as an error", async () => {
    const { impl } = fakeFetch({ code: 40304, msg: "Service not available due to compliance restriction", success: false });
    const client = new W3Client({ apiKey: "k", secretKey: "s", fetch: impl });
    const err = await client.get("/api/v1/dex/market/rwa/platforms").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(W3Error);
    expect((err as W3Error).isRegionBlocked).toBe(true);
    expect((err as W3Error).httpStatus).toBe(200);
  });

  it("refuses to start without credentials", () => {
    expect(() => new W3Client({ apiKey: "", secretKey: "" })).toThrow();
  });
});
