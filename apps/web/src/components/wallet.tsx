"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useConnect, useConnection, useConnectors, useDisconnect } from "wagmi";
import { shortAddress } from "@/lib/wallet";
import { gsap, reducedMotion, useGSAP } from "./motion/gsap";

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-lenis-prevent
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90dvh] w-full overflow-y-auto rounded-t-card bg-surface p-6 shadow-panel sm:max-w-md sm:rounded-card sm:p-8"
      >
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-medium tracking-tight">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex size-9 items-center justify-center rounded-full text-muted transition hover:bg-bg hover:text-ink"
          >
            <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
              <path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="mt-6">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function WalletList({ onConnected }: { onConnected?: () => void }) {
  const connectors = useConnectors();
  const { connect, isPending, variables, error } = useConnect();
  const named = connectors.filter((c) => c.id !== "injected");
  const list = named.length ? named : connectors.filter(() => typeof window !== "undefined" && "ethereum" in window);

  if (!list.length) {
    return (
      <div className="text-sm text-muted">
        <p>No wallet found in this browser. Install one, then come back:</p>
        <ul className="mt-4 space-y-2">
          {[
            ["Binance Wallet", "https://www.binance.com/en/web3wallet"],
            ["Rabby", "https://rabby.io"],
            ["MetaMask", "https://metamask.io/download"],
          ].map(([name, href]) => (
            <li key={name}>
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="text-ink underline decoration-line underline-offset-4 hover:decoration-ink"
              >
                {name} ↗
              </a>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {list.map((c) => {
        const pending = isPending && variables?.connector === c;
        return (
          <button
            key={c.uid}
            onClick={() => connect({ connector: c }, { onSuccess: () => onConnected?.() })}
            disabled={isPending}
            className="flex w-full items-center gap-3 rounded-2xl border border-line px-4 py-3 text-left transition hover:border-ink/30 hover:bg-bg disabled:opacity-60"
          >
            {c.icon ? <img src={c.icon} alt="" className="size-8 rounded-lg" /> : <span className="size-8 rounded-lg bg-bg" />}
            <span className="flex-1 font-medium">{c.name}</span>
            <span className="text-sm text-muted">{pending ? "Check your wallet…" : "Connect"}</span>
          </button>
        );
      })}
      {error && <p className="pt-2 text-sm text-loss">{error.message.split("\n")[0]}</p>}
    </div>
  );
}

export function WalletButton({ className = "" }: { className?: string }) {
  const { address, isConnected } = useConnection();
  const { disconnect } = useDisconnect();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (mounted && isConnected && address) {
    return (
      <button
        onClick={() => disconnect()}
        title="Disconnect"
        className={`group flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2.5 text-sm font-medium transition hover:border-ink/30 ${className}`}
      >
        <span className="size-2 rounded-full bg-gain" />
        <span className="font-mono group-hover:hidden">{shortAddress(address)}</span>
        <span className="hidden group-hover:inline">Disconnect</span>
      </button>
    );
  }
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white transition hover:bg-ink/85 ${className}`}
      >
        Connect wallet
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Connect a wallet">
        <WalletList onConnected={() => setOpen(false)} />
        <p className="mt-6 text-xs text-muted">Firstshare never holds your money. Your wallet asks you before anything is sent.</p>
      </Modal>
    </>
  );
}
