const organizations = [
  ["lgi", "Yayasan Lingkar Gagasan Indonesia (LGI)"],
  ["igama", "Yayasan IGAMA"],
  ["wamarapa", "Wamarapa"],
  ["fatayat_nu", "SSR Fatayat NU Jawa Timur (PENASUN)"],
] as const;

export const organizationOptions = organizations;

export function normalizeOrganization(value?: string) {
  const normalized = (value || "").toLowerCase();
  if (normalized.includes("igama")) return "igama";
  if (normalized.includes("wamarapa")) return "wamarapa";
  if (normalized.includes("fatayat") || normalized.includes("penasun")) return "fatayat_nu";
  if (normalized.includes("lgi") || normalized.includes("lingkar gagasan")) return "lgi";
  return "";
}
