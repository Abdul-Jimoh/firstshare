// Pays the deployed Checker for one pre-trade check from the Binance Agentic Wallet over ERC-8183.
// Usage: npm run buy-check -w @firstshare/runner -- NVDA 50
import { buyCheck } from "./checker.ts";

const [ticker = "NVDA", amount = "10"] = process.argv.slice(2);
const started = Date.now();
const paid = await buyCheck({ ticker: ticker.toUpperCase(), amountUsd: Number(amount) }, (line) =>
  console.log(`[${((Date.now() - started) / 1000).toFixed(1)}s] ${line}`),
);
console.log(JSON.stringify({ ...paid, priceAtomic: paid.priceAtomic.toString() }, null, 2));
