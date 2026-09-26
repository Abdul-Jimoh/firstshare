import { createHmac, randomUUID } from "node:crypto";

export const W3_BASE_URL = "https://web3.binance.com";
const PATH_PREFIX = "/build";

export interface W3Credentials {
  apiKey: string;
  secretKey: string;
}

export interface W3ClientOptions extends W3Credentials {
  baseUrl?: string;
  recvWindowMs?: number;
  timeoutMs?: number;
  fetch?: typeof fetch;
  now?: () => Date;
}

type QueryValue = string | number | boolean | undefined | null;

export class W3Error extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly path: string,
    readonly httpStatus: number,
  ) {
    super(`${code} ${message} (${path})`);
    this.name = "W3Error";
  }

  get isRegionBlocked() {
    return this.code >= 40301 && this.code <= 40304;
  }

  get isRateLimited() {
    return this.code === 42900 || this.httpStatus === 429;
  }
}

export function encodeQuery(query: Record<string, QueryValue> = {}): string {
  return Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
}

export function preHash(timestamp: string, method: string, requestPath: string, body: string): string {
  return timestamp + method.toUpperCase() + requestPath + body;
}

export function sign(secretKey: string, payload: string): string {
  return createHmac("sha256", secretKey).update(payload, "utf8").digest("base64");
}

export class W3Client {
  private readonly baseUrl: string;
  private readonly recvWindowMs: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;

  constructor(private readonly options: W3ClientOptions) {
    if (!options.apiKey || !options.secretKey) throw new Error("Binance Web3 API key and secret are required");
    this.baseUrl = options.baseUrl ?? W3_BASE_URL;
    // The 5s default is shorter than some responses take, which surfaces as 40103.
    this.recvWindowMs = options.recvWindowMs ?? 15_000;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.fetchImpl = options.fetch ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  get<T>(path: string, query?: Record<string, QueryValue>): Promise<T> {
    return this.request<T>("GET", path, query);
  }

  post<T>(path: string, body: unknown, query?: Record<string, QueryValue>): Promise<T> {
    return this.request<T>("POST", path, query, body);
  }

  async request<T>(method: "GET" | "POST", path: string, query?: Record<string, QueryValue>, body?: unknown): Promise<T> {
    const qs = encodeQuery(query);
    const requestPath = PATH_PREFIX + path + (qs ? `?${qs}` : "");
    const bodyText = body === undefined ? "" : JSON.stringify(body);
    const timestamp = this.now().toISOString();

    const res = await this.fetchImpl(this.baseUrl + requestPath, {
      method,
      headers: {
        "X-OC-APIKEY": this.options.apiKey,
        "X-OC-TIMESTAMP": timestamp,
        "X-OC-SIGN": sign(this.options.secretKey, preHash(timestamp, method, requestPath, bodyText)),
        "X-OC-RECV-WINDOW": String(this.recvWindowMs),
        "X-OC-NONCE": randomUUID(),
        ...(bodyText ? { "Content-Type": "application/json" } : {}),
      },
      ...(bodyText ? { body: bodyText } : {}),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    const text = await res.text();
    let json: { code?: number; msg?: string; data?: T };
    try {
      json = JSON.parse(text);
    } catch {
      throw new W3Error(res.status, `non-JSON response: ${text.slice(0, 120)}`, path, res.status);
    }
    // Errors, including region blocks, arrive as HTTP 200 with a non-zero code.
    if (json.code !== 0) throw new W3Error(json.code ?? res.status, json.msg ?? "unknown error", path, res.status);
    return json.data as T;
  }
}

export function clientFromEnv(env: NodeJS.ProcessEnv = process.env): W3Client {
  return new W3Client({
    apiKey: env.BINANCE_W3_API_KEY ?? "",
    secretKey: env.BINANCE_W3_SECRET_KEY ?? "",
  });
}
