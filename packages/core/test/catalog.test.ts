import { describe, expect, it } from "vitest";
import { mergeCatalog, searchCatalog } from "../src/catalog.ts";
import type { PublicRwaListing, RwaToken } from "../src/binance/types.ts";

const status = { openState: true, marketStatus: null, reasonCode: "TRADING", reasonMsg: null, nextOpenTime: null, nextCloseTime: null };

function apiToken(p: Partial<RwaToken> & Pick<RwaToken, "platformId" | "tokenSymbol" | "tokenContractAddress" | "underlyingTicker" | "underlyingName">): RwaToken {
  return {
    binanceChainId: "56",
    assetType: 1,
    tokenName: p.tokenSymbol,
    tokenLogoUrl: null,
    decimals: "18",
    underlyingNameZh: null,
    tokenToShareRatio: "1",
    tags: null,
    statusInfo: status,
    tokenPrice: "1",
    referencePrice: "1",
    volume24H: "0",
    marketCap: "0",
    peRatioTTM: null,
    ...p,
  };
}

const listing = (symbol: string, ticker: string, contractAddress: string, multiplier = "1"): PublicRwaListing => ({
  chainId: "56",
  contractAddress,
  symbol,
  ticker,
  type: 3,
  multiplier,
});

describe("mergeCatalog", () => {
  const api = [
    apiToken({ platformId: "ondo", tokenSymbol: "NVDAon", tokenContractAddress: "0xA9EE", underlyingTicker: "NVDA", underlyingName: "Nvidia Corp", tokenToShareRatio: "1.0012" }),
    apiToken({ platformId: "bstock", tokenSymbol: "NVDAB", tokenContractAddress: "0x02FC", underlyingTicker: "NVDA", underlyingName: "Nvidia Corp" }),
    apiToken({ platformId: "ondo", tokenSymbol: "AAPLon", tokenContractAddress: "0xAA01", underlyingTicker: "AAPL", underlyingName: "Apple Inc." }),
    apiToken({ platformId: "ondo", tokenSymbol: "NVDAon", tokenContractAddress: "0xeth", underlyingTicker: "NVDA", underlyingName: "Nvidia Corp", binanceChainId: "1" }),
  ];
  const publicLists = {
    bstock: [listing("NVDAB", "NVDA", "0x02fc"), listing("AAPLB", "AAPL", "0xAB02")],
  };
  const stocks = mergeCatalog(api, publicLists);

  it("groups issuers under one ticker with bStock first", () => {
    const nvda = stocks.find((s) => s.ticker === "NVDA")!;
    expect(nvda.name).toBe("Nvidia Corp");
    expect(nvda.tokens.map((t) => t.symbol)).toEqual(["NVDAB", "NVDAon"]);
    expect(nvda.tokens[1]!.sharesPerToken).toBeCloseTo(1.0012);
  });

  it("fills bStocks the keyed API leaves out", () => {
    const aapl = stocks.find((s) => s.ticker === "AAPL")!;
    expect(aapl.tokens.map((t) => [t.symbol, t.source])).toEqual([["AAPLB", "public"], ["AAPLon", "api"]]);
  });

  it("does not duplicate a token present in both lists, whatever the address case", () => {
    const nvda = stocks.find((s) => s.ticker === "NVDA")!;
    expect(nvda.tokens.filter((t) => t.symbol === "NVDAB")).toHaveLength(1);
    expect(nvda.tokens.find((t) => t.symbol === "NVDAB")!.source).toBe("api");
  });

  it("ignores other chains", () => {
    expect(stocks.flatMap((s) => s.tokens).some((t) => t.address === "0xeth")).toBe(false);
  });

  it("finds stocks by ticker, company name and token symbol", () => {
    expect(searchCatalog(stocks, "nvda")[0]!.ticker).toBe("NVDA");
    expect(searchCatalog(stocks, "apple")[0]!.ticker).toBe("AAPL");
    expect(searchCatalog(stocks, "nvdab")[0]!.ticker).toBe("NVDA");
    expect(searchCatalog(stocks, "zzz")).toEqual([]);
  });

  it("maps everyday names to the fund people mean", () => {
    const withSpy = mergeCatalog(
      [
        apiToken({ platformId: "ondo", tokenSymbol: "SPGIon", tokenContractAddress: "0x5961", underlyingTicker: "SPGI", underlyingName: "S&P Global Inc." }),
        apiToken({ platformId: "ondo", tokenSymbol: "SPYon", tokenContractAddress: "0x5970", underlyingTicker: "SPY", underlyingName: "SPDR S&P 500 ETF Trust" }),
      ],
      {},
    );
    expect(searchCatalog(withSpy, "S&P")[0]!.ticker).toBe("SPY");
    expect(searchCatalog(withSpy, "s&p 500")[0]!.ticker).toBe("SPY");
  });
});
