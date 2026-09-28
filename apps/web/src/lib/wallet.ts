import { createConfig, http } from "wagmi";
import { bsc } from "wagmi/chains";
import { injected } from "wagmi/connectors";

export const walletConfig = createConfig({
  chains: [bsc],
  connectors: [injected()],
  transports: { [bsc.id]: http("https://bsc-dataseed.bnbchain.org") },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof walletConfig;
  }
}

export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
