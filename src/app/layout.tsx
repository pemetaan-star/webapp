import type { Metadata } from "next";
import { DM_Sans, Space_Grotesk } from "next/font/google";
import { AppOpeningSplash } from "@/app/components/app-opening-splash";
import { InstallAppNotice } from "@/app/components/install-app-notice";
import "./globals.css";

const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"] });
const spaceGrotesk = Space_Grotesk({ variable: "--font-space-grotesk", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Dashboard Pemetaan Hotspot Malang 2026",
  description: "Monitoring dan quality control pemetaan hotspot Kota Malang.",
  icons: {
    icon: "/lingga-indonesia-icon.svg",
    apple: "/icons/lingga-180.png",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return <html lang="id" className={`${dmSans.variable} ${spaceGrotesk.variable}`}><body>{children}<AppOpeningSplash /><InstallAppNotice /></body></html>;
}
