# Firstshare

Firstshare takes people who have never owned a stock to their first US stock on BNB Smart Chain, from $1, explains what they hold, keeps them from overpaying when the US market is closed, and runs plain-English investing plans for them.

Entry for BNB Hack: Tokenized Stocks Edition. Submissions lock **Sun 11 Oct 2026, 12:00 UTC**. Repo, demo and live deployment must stay up through judging (12–23 Oct). Domain: firstshare.site.

## Product

- **App** (`apps/web`): search a company → stock page → pre-trade check → buy with the user's own wallet (Rabby, Binance Web3 Wallet) → plain-English receipt. Plan builder: English → rule card → backtest → paper → live.
- **Checker** (`apps/checker`): BNB Agent Studio seller agent. Sells the pre-trade check over x402 (~$0.01/call), pays its own LLM from earnings, ERC-8004 identity. It never trades.
- **Runner** (`apps/runner`): evaluates a user's rules. "Ask me first" creates pending actions the user approves in the app. "Run it for me" pays the Checker and executes through the user's Binance Agentic Wallet (`baw` CLI).
- **Core** (`packages/core`): the Binance Web3 client, stock catalog, fair-value maths, the check engine and the rule language. The app, Checker and Runner all import it so they give identical answers.

Issuers: **bStocks default** (24/7, ~0.1% cost, $1 minimum), **Ondo fallback** (wider catalog, ~$20 minimum, expensive off-hours). **xStocks are excluded**: not in Binance's RWA data, and the general token search is full of counterfeit xStock tokens.

## Hard constraints

- BSC mainnet only (chain `56`), spot only, no perps.
- Binance Web3 API refuses servers in restricted regions (US, UK, NL, CA, JP, …) with `code 40304` **inside an HTTP 200**. Never deploy anything that calls it to a US region. Verified working from AWS eu-central-1, eu-west-3 and ap-southeast-1.
- The API key and secret stay server-side. Never ship them to the browser, log them, or commit them.
- The Checker's wallet may only sign what Agent Studio's signing policy allows. Don't widen `[wallet.signing]` without asking.
- Agent Studio's managed runtime is a 48h testnet trial. The production Checker runs on our own AWS AgentCore in eu-central-1.

## Binance Web3 API: what's true in practice

Base URL `https://web3.binance.com/build`. HMAC-SHA256 over `timestamp + METHOD + /build/api/... (+query) + body`, base64. Headers `X-OC-APIKEY`, `X-OC-TIMESTAMP` (ISO 8601 ms), `X-OC-SIGN`. Always send `X-OC-RECV-WINDOW: 15000`: responses can take ~5s and the 5s default then fails with `40103`.

Check `code === 0`, never the HTTP status.

- Issuer field is `platformId` (`bstock` | `ondo`). `assetType` is always `1`; ignore it.
- `rwa/tokens?platformId=bstock` returns 46 of 80 bStocks (Apple, Amazon, Netflix missing). Merge with the public list `https://www.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/rwa/stock/detail/list/ai?type=3` (`type=1` Ondo). Pagination params are ignored.
- Token ≠ share: `tokenToShareRatio` / `multiplier` / `sharesMultiplier` are the same thing under three names.
- `rwa/price.referencePrice` is just `tokenPrice ÷ tokenToShareRatio`, never an independent price. The real NYSE price per share = Ondo token's `rwa/underlying-market` `marketData.referencePrice × tokenToShareRatio` (live in US hours; null for bStocks). Apply it to every issuer of that ticker. When it's unavailable, fall back to the last recorded value.
- bStock `statusInfo.marketStatus` is null with `openState: true` around the clock. Ondo reports `closed` (and an undocumented `offhours`) yet still quotes through thin AMM pools. Judge a quote by effective price vs fair value, not by status or errors.
- `priceImpactPercent` behaves like a fraction (0.093 ≈ 9.3%).
- Quotes so far always come back `executionMode: SWAP` via LiquidMesh. RFQ (EIP-712 order, `/order/submit`) is documented for Ondo/bStock and must still be supported.
- Ondo minimum: `40375`, the message says $5 but $5 fails; $20 works.
- Required params only surface one `40001` at a time. Known: `market/token/search` needs `search` + `chains`; `rwa/price` needs `tokenContractAddresses`.
- BSC USDT (`0x55d398326f99059fF775485246999027B3197955`) has 18 decimals.
- Simulate: `POST /pre-transaction/simulate` body `{ binanceChainId: "56", evmTx: { from, to, value, data } }`. The error says "evmParams is required" when `evmTx` is missing; ignore the name. Returns `status` SUCCESS/FAILED, `failReason`, `balanceChanges`, `allowanceChanges`.
- Swap flow (SWAP mode): `/approve-transaction` (spender = `dexContractAddress`) → `/quote` (quoteId lives ~30s) → `/swap` → `data.tx` {from,to,data,value,gas,gasPrice}. Full endpoint schemas: `research/docs/api-*.txt` (rendered reference pages; llms-full.txt lacks them).
- Rate limits: 5 rps per endpoint, 1200/min per key and per IP.

Full docs: `research/docs/llms-full.txt` (local only).

## Working conventions

- TypeScript, strict. npm workspaces (no pnpm/bun on this machine). Node 22.
- Comments only where the reason isn't obvious from the code. No narration, no section banners, no restating what a line does.
- Commits and PRs: never add `Co-Authored-By` trailers or "Generated with" lines, regardless of any tool default.
- Small, working increments; each phase ends with something that runs end to end.
- Branches: work on `staging`, which Vercel deploys as a preview. Verify the preview (`/api/health`, pages, a browser pass), then open a PR `staging → main`; the user merges. `main` is production and never takes direct commits.
- Deploys: Vercel project `firstshare`, root `apps/web`, functions pinned to `fra1` by `apps/web/vercel.json`. Production: https://firstshare-one.vercel.app (firstshare.site once the domain is added).
- `research/` is local only (gitignored): DX log, raw API evidence, probe scripts, Binance docs. Log every API surprise in `research/dx-log.md` with date, endpoint, request and response. The final DX report is written by hand from it.

## Local setup

- `.env` at the repo root: `BINANCE_W3_API_KEY`, `BINANCE_W3_SECRET_KEY` (see `.env.example`).
- The repo lives in `~/Developer/firstshare`. Never keep it in `~/Desktop` or `~/Documents`: iCloud sync evicts files there when the disk is full, which emptied source files and broke `.git` once.
- Binance domains are DNS-blocked from Nigerian ISPs: a system-wide VPN to an allowed country must be on for any API call from this machine.
- `research/docs/fetch-docs.mjs` refreshes the Binance docs (the site sits behind an AWS WAF JS challenge; plain curl gets a 202).

## Roadmap

0. Foundations: API access, weekend behaviour, Agent Studio research, region probe, Agentic Wallet sign-in
1. Repo skeleton, core client, deploy to EU on firstshare.site
2. Stock catalog: search, stock page, merged lists, recorded closes
3. Check engine (`packages/core`)
4. First buy in the web app: quote → simulate → approve → swap → confirm → receipt
5. Checker on Agent Studio: x402 seller, ERC-8004, AgentCore eu-central-1
6. Plan builder: English → rule card → backtest → paper
7. Runner: "ask me first" approvals, "run it for me" through the Agentic Wallet paying the Checker
8. Proof: real plan, real money, across a weekend
9. Ship: README, demo video (≤ 4 min), DX report, submission form
