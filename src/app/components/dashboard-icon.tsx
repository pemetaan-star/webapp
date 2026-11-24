import type { ReactNode } from "react";

export type DashboardIconName =
  | "database"
  | "activity"
  | "clock"
  | "heartPulse"
  | "status"
  | "shieldCheck"
  | "map"
  | "mapPin"
  | "people"
  | "building"
  | "tag"
  | "district"
  | "neighborhood"
  | "clipboardCheck"
  | "list"
  | "chart"
  | "check";

const iconShapes: Record<DashboardIconName, ReactNode> = {
  database: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>,
  activity: <><path d="M3 12h4l3-8 4 16 3-8h4" /><circle cx="21" cy="12" r="1" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  heartPulse: <><path d="M20.8 4.8a5.5 5.5 0 0 0-7.8 0L12 5.9l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.4a5.5 5.5 0 0 0 0-7.8Z" /><path d="M5 12h3l2-3 3.5 6 2-3H19" /></>,
  status: <><circle cx="12" cy="12" r="9" /><path d="M8 12h8M12 8v8" /></>,
  shieldCheck: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></>,
  map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z" /><path d="M9 3v15m6-12v15" /></>,
  mapPin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
  people: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-1a6 6 0 0 1 12 0v1H3Zm13-9a3 3 0 1 0-1-5.8M18 14a5 5 0 0 1 3 4.6V20h-3" /></>,
  building: <><path d="M4 21V4l8-2 8 2v17M2 21h20M8 7h1m6 0h1M8 11h1m6 0h1M8 15h1m6 0h1m-5 6v-4h3v4" /></>,
  tag: <><path d="M20 13 13 20 3 10V4h6l11 9Z" /><circle cx="7.5" cy="7.5" r="1" /></>,
  district: <><path d="m3 6 5-3 8 3 5-3v15l-5 3-8-3-5 3V6Z" /><path d="m8 3 0 15m8-12v15M4 10h4m8 2h4" /></>,
  neighborhood: <><path d="m3 11 9-8 9 8v10h-6v-6H9v6H3V11Z" /><path d="M7 11h.01M17 11h.01" /></>,
  clipboardCheck: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4.5h6a1.5 1.5 0 0 0-3-1 1.5 1.5 0 0 0-3 1ZM8 13l2.5 2.5L16 10" /></>,
  list: <><path d="M9 6h12M9 12h12M9 18h12" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></>,
  chart: <><path d="M4 20V10m5 10V4m5 16v-7m5 7V7M2 20h20" /></>,
  check: <><path d="m5 12 4 4L19 6" /></>,
};

export function DashboardIcon({ name, className }: { name: DashboardIconName; className?: string }) {
  return <svg
    aria-hidden="true"
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    focusable="false"
  >
    {iconShapes[name]}
  </svg>;
}
