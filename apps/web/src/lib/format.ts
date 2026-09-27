const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return usd.format(value);
}

export function sharesForDollars(dollars: number, price: number | null) {
  if (!price) return null;
  return dollars / price;
}

export function formatShares(shares: number | null): string {
  if (shares === null) return "—";
  if (shares >= 1) return shares.toFixed(2);
  return shares.toPrecision(2);
}
