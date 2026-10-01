// Pays the deployed Checker for one pre-trade check from the Binance Agentic Wallet over ERC-8183.
// Usage: npm run buy-check -w @firstshare/runner -- NVDA 50
//        npm run buy-check -w @firstshare/runner -- --resume <jobId>
import { buyCheck, resumeCheck } from "./checker.ts";

const args = process.argv.slice(2);
const started = Date.now();
const log = (line: string) => console.log(`[${((Date.now() - started) / 1000).toFixed(1)}s] ${line}`);
const paid =
  args[0] === "--resume"
    ? await resumeCheck(Number(args[1]), log)
    : await buyCheck({ ticker: (args[0] ?? "NVDA").toUpperCase(), amountUsd: Number(args[1] ?? "10") }, log);
console.log(JSON.stringify({ ...paid, priceAtomic: paid.priceAtomic.toString() }, null, 2));
