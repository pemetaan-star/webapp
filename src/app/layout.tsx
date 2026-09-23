import type { Metadata } from "next";
import { DM_Sans, Space_Grotesk } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"] });
const spaceGrotesk = Space_Grotesk({ variable: "--font-space-grotesk", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Dashboard Pemetaan Hotspot Malang 2026",
  description: "Monitoring dan quality control pemetaan hotspot Kota Malang.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return <html lang="id" className={`${dmSans.variable} ${spaceGrotesk.variable}`}><body>{children}</body></html>;
}
