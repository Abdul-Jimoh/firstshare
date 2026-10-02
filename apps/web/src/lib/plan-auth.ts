import type { Plan, PlanMode } from "@firstshare/core";

export type PlanAction = { kind: "start"; plan: Plan; mode: PlanMode } | { kind: "pause" | "resume" | "delete"; id: string };

const VERB = { start: "Start", pause: "Pause", resume: "Resume", delete: "Delete" } as const;

async function fingerprint(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

// Built the same way in the browser (to sign) and on the server (to verify), so the wallet's signature
// covers exactly this plan, this action and this moment.
export async function actionMessage(action: PlanAction, owner: string, issuedAt: string): Promise<string> {
  const what =
    action.kind === "start"
      ? [`Plan: ${action.plan.name}`, `Mode: ${action.mode === "paper" ? "practice (no real money)" : action.mode}`, `Fingerprint: ${await fingerprint(action.plan)}`]
      : [`Plan ID: ${action.id}`];
  return [`Firstshare: ${VERB[action.kind]} a plan`, "", ...what, `Wallet: ${owner.toLowerCase()}`, `Issued: ${issuedAt}`].join("\n");
}
