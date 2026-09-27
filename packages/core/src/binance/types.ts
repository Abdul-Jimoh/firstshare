export type ChainId = "56" | "1" | "CT_501";
export type PlatformId = "bstock" | "ondo";

export interface MarketStatusInfo {
  openState: boolean | null;
  marketStatus: string | null;
  reasonCode: string | null;
  reasonMsg: string | null;
  nextOpenTime: number | null;
  nextCloseTime: number | null;
}

export interface RwaToken {
  binanceChainId: ChainId;
  tokenContractAddress: string;
  platformId: PlatformId;
  assetType: number;
  tokenName: string;
  tokenSymbol: string;
  tokenLogoUrl: string | null;
  decimals: string;
  underlyingTicker: string;
  underlyingName: string;
  underlyingNameZh: string | null;
  tokenToShareRatio: string;
  tags: string[] | null;
  statusInfo: MarketStatusInfo;
  tokenPrice: string;
  referencePrice: string;
  volume24H: string;
  marketCap: string;
  peRatioTTM: string | null;
}

export interface RwaPlatform {
  platformId: PlatformId;
  tickerCount: number;
  chainDistribution: { binanceChainId: ChainId; tokenCount: number }[];
  website: string;
  logoUrl: string;
}

export interface RwaPrice {
  binanceChainId: ChainId;
  tokenContractAddress: string;
  platformId: PlatformId;
  tokenPrice: string;
  referencePrice: string;
  tokenPriceUpdatedAt: number;
}

export interface QuoteToken {
  tokenContractAddress: string;
  tokenSymbol: string;
  tokenUnitPrice: string;
  decimal: string;
  isHoneyPot: boolean;
  taxRate: string;
}

export interface QuoteRoute {
  quoteId: string;
  vendorName: string;
  executionMode: "SWAP" | "RFQ";
  binanceChainId: string;
  fromTokenAmount: string;
  toTokenAmount: string;
  tradeFee: string;
  estimateGasFee: string;
  priceImpactPercent: string;
  fromToken: QuoteToken;
  toToken: QuoteToken;
  approveTarget: string | null;
  isBest: boolean;
}

export interface PublicRwaListing {
  chainId: string;
  contractAddress: string;
  symbol: string;
  ticker: string;
  type: number;
  multiplier: string;
}

export interface RwaProtection {
  supported: boolean;
  description: string | null;
  url: string | null;
}

export interface RwaUnderlyingProfile {
  binanceChainId: ChainId;
  tokenContractAddress: string;
  platformId: PlatformId;
  underlyingTicker: string;
  underlyingFullName: string;
  tokenToShareRatio: string;
  protections: Partial<Record<"collateralReport" | "dailyAttestationReport" | "monthlyAttestationReport", RwaProtection>>;
  companyInfo: {
    ceo: string | null;
    website: string | null;
    industry: string | null;
    conceptsEn: string[];
    description: string | null;
  } | null;
}
