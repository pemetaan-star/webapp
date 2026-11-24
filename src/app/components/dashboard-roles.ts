export function normalizeRole(role?: string) {
  return (role || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function displayRole(role?: string) {
  switch (normalizeRole(role)) {
    case "admin": return "Administrator";
    case "dataanalis":
    case "dataanalyst": return "Data Analis";
    case "koordinator":
    case "kordinator": return "Koordinator";
    case "supervisor": return "Supervisor (perlu migrasi)";
    case "enumerator": return "Enumerator";
    default: return "Pengguna";
  }
}
