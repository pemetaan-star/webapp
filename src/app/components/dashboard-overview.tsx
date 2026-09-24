"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";
import { PanelHeading, Risk } from "@/app/components/dashboard";

type OverviewRow = {
  id: string;
  name: string;
  area: string;
  status: "Aktif" | "Baru" | "Tidak aktif" | "Perlu verifikasi";
  qc: "Valid" | "Pending" | "Perlu perbaikan";
  coordinates?: string;
};

export function DashboardOverview({ rows, canLoadMore = true }: { rows: OverviewRow[]; canLoadMore?: boolean }) {
  const areaCounts = rows.reduce<Record<string, number>>((counts, row) => {
    const area = row.area.split("/")[0].trim() || "Lainnya";
    counts[area] = (counts[area] || 0) + 1;
    return counts;
  }, {});
  const areas = Object.entries(areaCounts).sort((first, second) => second[1] - first[1]);
  const maxArea = areas[0]?.[1] || 1;
  const risks = [
    ["HOTSPOT BARU", rows.filter((row) => row.status === "Baru").length, "teal"],
    ["TIDAK AKTIF", rows.filter((row) => row.status === "Tidak aktif").length, "coral"],
    ["PENDING QC", rows.filter((row) => row.qc === "Pending").length, "amber"],
    ["PERLU PERBAIKAN", rows.filter((row) => row.qc === "Perlu perbaikan").length, "blue"],
  ] as const;
  const coordinateCount = rows.filter((row) => {
    const [latitude, longitude] = (row.coordinates || "").split(/[\s,]+/).map(Number);
    return Number.isFinite(latitude) && Number.isFinite(longitude);
  }).length;

  return <section className="real-overview"><div className="real-overview-grid"><article className="panel map-panel"><PanelHeading icon="⌖" title="Peta Persebaran Hotspot" subtitle={`${coordinateCount} dari ${rows.length} data memiliki koordinat`} tag="REAL DATA" /><RealLeafletMap rows={rows} /></article><article className="panel distribution-panel"><PanelHeading icon="◔" title="Distribusi Kecamatan" subtitle="Dihitung dari data Firestore" /><div className="real-bars">{areas.length === 0 ? <div className="real-empty">Belum ada data wilayah.</div> : areas.slice(0, 6).map(([area, count], index) => <div className="real-bar-row" key={area}><div><span>{area}</span><strong>{count}</strong></div><i className={`real-bar real-bar-${index % 4}`} style={{ width: `${Math.max(8, (count / maxArea) * 100)}%` }} /></div>)}</div></article></div><article className="panel real-risk-panel"><PanelHeading icon="!" title="Risiko Otomatis" subtitle="Ringkasan status yang dihitung dari data aktual" tag="REAL DATA" /><div className="risk-grid">{risks.map(([label, value, tone]) => <Risk key={label} label={label} value={String(value)} tone={tone} />)}</div></article>{canLoadMore && rows.length >= 25 && <button type="button" className="button button-secondary" onClick={() => window.dispatchEvent(new Event("load-more-submissions"))}>Muat data berikutnya</button>}</section>;
}

function RealLeafletMap({ rows }: { rows: OverviewRow[] }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<LeafletMap | null>(null);
  const points = useMemo(() => rows.map((row) => {
    const [lat, lng] = (row.coordinates || "").split(/[\s,]+/).map(Number);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { row, lat, lng } : null;
  }).filter((point): point is { row: OverviewRow; lat: number; lng: number } => point !== null), [rows]);

  useEffect(() => {
    let active = true;
    const container = mapRef.current;
    import("leaflet").then((leaflet) => {
      if (!active || !container || !container.isConnected || instanceRef.current || points.length === 0) return;
      const currentMap = leaflet.map(container, { zoomControl: true }).setView([-7.9666, 112.6326], 12);
      instanceRef.current = currentMap;
      leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap" }).addTo(currentMap);
      points.forEach(({ row, lat, lng }) => {
        const popup = document.createElement("div");
        const name = document.createElement("strong");
        name.textContent = row.name;
        popup.append(name, document.createElement("br"), document.createTextNode(row.area), document.createElement("br"), document.createTextNode(`Status QC: ${row.qc}`));
        leaflet.circleMarker([lat, lng], { radius: 8, color: "#ffffff", weight: 3, fillColor: row.qc === "Valid" ? "#0f9f94" : row.qc === "Perlu perbaikan" ? "#ec765d" : "#e5ad44", fillOpacity: 1 }).addTo(currentMap).bindPopup(popup);
      });
      if (points.length === 1) currentMap.setView([points[0].lat, points[0].lng], 14);
      if (points.length > 1) currentMap.fitBounds(points.map((point) => [point.lat, point.lng] as [number, number]), { padding: [24, 24], maxZoom: 15 });
    });
    return () => {
      active = false;
      const currentMap = instanceRef.current;
      if (currentMap && currentMap.getContainer() === container) {
        instanceRef.current = null;
        currentMap.remove();
      }
    };
  }, [points]);

  return <div className="leaflet-map-wrap"><div ref={mapRef} className="leaflet-map" />{points.length === 0 && <div className="real-empty">Belum ada koordinat GPS pada data Firestore.</div>}</div>;
}
