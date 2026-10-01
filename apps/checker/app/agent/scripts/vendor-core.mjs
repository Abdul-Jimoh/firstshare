// AgentCore ships only app/agent, so @firstshare/core is copied in rather than linked.
import { cpSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const from = fileURLToPath(new URL("../../../../../packages/core/src", import.meta.url));
const to = fileURLToPath(new URL("../src/core", import.meta.url));
rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });
