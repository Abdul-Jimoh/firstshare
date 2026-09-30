import { createConfig, http } from "wagmi";
import { bsc } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

export const walletConfig = createConfig({
  chains: [bsc],
  connectors: [
    injected(),
    ...(projectId
      ? [
          walletConnect({
            projectId,
            showQrModal: true,
            metadata: {
              name: "Firstshare",
              description: "Your first US stock, from $1.",
              url: "https://www.firstshare.site",
              icons: ["https://www.firstshare.site/icon.svg"],
            },
          }),
        ]
      : []),
  ],
  transports: { [bsc.id]: http("https://bsc-dataseed.bnbchain.org") },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof walletConfig;
  }
}

export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
