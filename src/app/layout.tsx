import type { Metadata, Viewport } from "next";

import "@fontsource-variable/archivo";
import "@fontsource-variable/ibm-plex-sans";
import "@fontsource/ibm-plex-mono/500.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Keepscape — Walk into a true story",
  description:
    "Turn family photos and an original spoken memory into a source-grounded place you can explore together.",
  applicationName: "Keepscape",
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#f1eadc",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
