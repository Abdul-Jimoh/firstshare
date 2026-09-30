"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useConfig, useConnect, useConnection, useConnectors, useDisconnect } from "wagmi";
import { formatShares, formatUsd } from "@/lib/format";
import { shortAddress } from "@/lib/wallet";
import { gsap, reducedMotion, useGSAP } from "./motion/gsap";
import { StockLogo } from "./stock";

export function Modal({
  open,
  onClose,
  title,
  children,
  center = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  center?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useGSAP(
    () => {
      if (!open || reducedMotion()) return;
      gsap.fromTo(panel.current, { y: 24, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.45, ease: "power3.out" });
    },
    { dependencies: [open] },
  );

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/25 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-lenis-prevent
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl border-[1.5px] border-ink bg-surface p-6 sm:max-w-md sm:rounded-2xl sm:p-8 sm:shadow-offset"
      >
        <div className="relative flex items-center justify-between gap-4">
          <h2 className={`text-xl font-semibold tracking-tight ${center ? "w-full text-center" : ""}`}>{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className={`flex size-9 shrink-0 items-center justify-center rounded-full bg-card text-ink transition hover:bg-card-hover ${center ? "absolute right-0" : ""}`}
          >
            <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden>
              <path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="mt-6">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

function useRecentConnector() {
  const config = useConfig();
  const [recent, setRecent] = useState<string | null>(null);
  useEffect(() => {
    Promise.resolve(config.storage?.getItem("recentConnectorId")).then((id) => setRecent(typeof id === "string" ? id : null));
  }, [config]);
  return recent;
}

const INSTALL = [
  { name: "Binance Wallet", href: "https://www.binance.com/en/web3wallet" },
  { name: "Rabby", href: "https://rabby.io" },
  { name: "MetaMask", href: "https://metamask.io/download" },
];

function WalletConnectIcon() {
  return (
    <span className="flex size-9 items-center justify-center rounded-lg bg-[#3b99fc] text-white">
      <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
        <path
          d="M6.1 8.4a8.4 8.4 0 0 1 11.8 0l.4.4a.4.4 0 0 1 0 .6l-1.3 1.3a.2.2 0 0 1-.3 0l-.6-.5a5.9 5.9 0 0 0-8.2 0l-.6.6a.2.2 0 0 1-.3 0L5.7 9.5a.4.4 0 0 1 0-.6l.4-.5Zm14.5 2.7 1.2 1.2a.4.4 0 0 1 0 .6l-5.4 5.3a.4.4 0 0 1-.6 0l-3.8-3.8a.1.1 0 0 0-.2 0l-3.8 3.8a.4.4 0 0 1-.6 0L2.1 12.9a.4.4 0 0 1 0-.6l1.2-1.2a.4.4 0 0 1 .6 0l3.8 3.8a.1.1 0 0 0 .2 0l3.8-3.8a.4.4 0 0 1 .6 0l3.8 3.8a.1.1 0 0 0 .2 0l3.8-3.8a.4.4 0 0 1 .5 0Z"
          fill="currentColor"
        />
      </svg>
    </span>
  );
}

export function WalletList({ onConnected }: { onConnected?: () => void }) {
  const connectors = useConnectors();
  const { connect, isPending, variables, error } = useConnect();
  const recent = useRecentConnector();

  const installed = connectors.filter((c) => c.id !== "injected" && c.id !== "walletConnect");
  const walletConnect = connectors.find((c) => c.id === "walletConnect");

  const row = (c: (typeof connectors)[number], label?: string, hint?: string) => {
    const pending = isPending && variables?.connector === c;
    const sub = pending ? "Check your wallet…" : recent === c.id ? "Recent" : hint;
    return (
      <button
        key={c.uid}
        onClick={() => connect({ connector: c }, { onSuccess: () => onConnected?.() })}
        disabled={isPending}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-card disabled:opacity-60"
      >
        {c.icon ? <img src={c.icon} alt="" className="size-9 rounded-lg" /> : <WalletConnectIcon />}
        <span className="flex-1">
          <span className="block font-semibold">{label ?? c.name}</span>
          {sub && <span className="block text-xs text-muted">{sub}</span>}
        </span>
      </button>
    );
  };

  return (
    <div>
      {installed.length > 0 && (
        <>
          <p className="mb-1 px-3 text-sm font-semibold">Installed</p>
          {installed.map((c) => row(c))}
        </>
      )}
      <p className={`mb-1 px-3 text-sm font-semibold ${installed.length ? "mt-5 text-muted" : ""}`}>
        {installed.length ? "Other ways" : "Connect"}
      </p>
      {walletConnect && row(walletConnect, "WalletConnect", "Binance Wallet, Trust or MetaMask on your phone")}
      {!installed.length &&
        INSTALL.map((w) => (
          <a
            key={w.name}
            href={w.href}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between rounded-xl px-3 py-2.5 transition hover:bg-card"
          >
            <span className="font-semibold">{w.name}</span>
            <span className="text-xs text-muted">Install ↗</span>
          </a>
        ))}
      {error && <p className="mt-3 px-3 text-sm text-loss">{error.message.split("\n")[0]}</p>}
      <div className="-mx-6 mt-6 flex items-center justify-between border-t-[1.5px] border-ink px-6 pt-5 text-sm sm:-mx-8 sm:px-8">
        <span className="text-muted">New to wallets?</span>
        <a
          href="https://www.binance.com/en/academy/articles/what-is-a-crypto-wallet"
          target="_blank"
          rel="noreferrer"
          className="font-semibold"
        >
          Learn more
        </a>
      </div>
    </div>
  );
}

interface Portfolio {
  usdt: number;
  bnb: number;
  bnbUsd: number;
  holdings: { ticker: string; name: string; logoUrl: string | null; symbol: string; shares: number; valueUsd: number }[];
}

function Avatar({ address, size = 88 }: { address: string; size?: number }) {
  const hue = parseInt(address.slice(2, 8), 16) % 360;
  return (
    <span
      aria-hidden
      className="block rounded-full border-[1.5px] border-ink"
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 30% 30%, hsl(${hue} 70% 80%), hsl(${(hue + 40) % 360} 55% 58%))`,
      }}
    />
  );
}

function AccountPanel({ address, onDisconnect }: { address: string; onDisconnect: () => void }) {
  const [data, setData] = useState<Portfolio | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/portfolio?wallet=${address}`)
      .then((r) => r.json())
      .then((d) => alive && setData(d.error ? null : d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [address]);

  const total = data ? data.holdings.reduce((s, h) => s + h.valueUsd, 0) : null;

  return (
    <div>
      <div className="flex flex-col items-center text-center">
        <Avatar address={address} />
        <p className="mt-4 font-mono text-lg font-semibold">{shortAddress(address)}</p>
        <p className="text-sm text-muted">{data ? `${formatUsd(data.usdt)} USDT · ${data.bnb.toFixed(4)} BNB` : "Loading balances…"}</p>
      </div>

      <div className="mt-6">
        <div className="flex items-baseline justify-between px-1">
          <p className="text-sm font-semibold">Your stocks</p>
          {total !== null && <p className="text-sm text-muted">{formatUsd(total)}</p>}
        </div>
        {data && data.holdings.length === 0 && (
          <p className="mt-3 px-1 text-sm text-muted">Nothing yet. Your first share is a search away.</p>
        )}
        <ul className="mt-2 divide-y divide-line">
          {data?.holdings.map((h) => (
            <li key={h.symbol}>
              <a href={`/stocks/${h.ticker}`} className="flex items-center gap-3 rounded-xl px-1 py-3 transition hover:bg-card">
                <StockLogo stock={h} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{h.name}</span>
                  <span className="block font-mono text-xs text-muted">
                    {formatShares(h.shares)} share{h.shares >= 2 ? "s" : ""} · {h.symbol}
                  </span>
                </span>
                <span className="font-medium">{formatUsd(h.valueUsd)}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <button
          onClick={() => {
            navigator.clipboard.writeText(address);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="rounded-xl border-[1.5px] border-ink bg-surface py-3 text-sm font-semibold transition hover:bg-card"
        >
          {copied ? "Copied" : "Copy address"}
        </button>
        <button
          onClick={onDisconnect}
          className="rounded-xl border-[1.5px] border-ink bg-surface py-3 text-sm font-semibold transition hover:bg-card"
        >
          Disconnect
        </button>
      </div>
    </div>
  );
}

export function WalletButton({ className = "" }: { className?: string }) {
  const { address, isConnected } = useConnection();
  const { disconnect } = useDisconnect();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const connected = mounted && isConnected && address;

  return (
    <>
      {connected ? (
        <button
          onClick={() => setOpen(true)}
          className={`flex items-center justify-center gap-2 rounded-full border-[1.5px] border-ink bg-surface px-4 py-2.5 text-sm font-semibold transition hover:bg-card ${className}`}
        >
          <span className="size-2 rounded-full bg-gain" />
          <span className="font-mono">{shortAddress(address)}</span>
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className={`rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-surface transition hover:bg-ink/85 ${className}`}
        >
          Connect wallet
        </button>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={connected ? "Your wallet" : "Connect a wallet"} center>
        {connected ? (
          <AccountPanel
            address={address}
            onDisconnect={() => {
              disconnect();
              setOpen(false);
            }}
          />
        ) : (
          <WalletList onConnected={() => setOpen(false)} />
        )}
      </Modal>
    </>
  );
}
