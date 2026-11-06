export const siteConfig = {
  name: "Maximus Collectibles",
  productName: "Maximus Members",
  description:
    "The Maximus Collectibles members club — loyalty tiers, store check-ins and release raffles.",
  appEnv: process.env.NEXT_PUBLIC_APP_ENV ?? "development",
} as const;
