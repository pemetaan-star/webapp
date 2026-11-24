"use client";

import { useEffect, useMemo, useRef } from "react";
import type { LayerGroup, Map as LeafletMap } from "leaflet";
import { PanelHeading } from "@/app/components/dashboard";

type OverviewRow = {
  id: string;
  name: string;
  area: string;
  status: "Aktif" | "Baru" | "Tidak aktif" | "Perlu verifikasi";
  qc: "Valid" | "Pending" | "Perlu perbaikan";
  coordinates?: string;
};

function markerShape(isNewHotspot: boolean) {
  return isNewHotspot
    ? `<path d="m15 9.1 1.65 3.35 3.7.54-2.67 2.6.63 3.68L15 17.53l-3.31 1.74.63-3.68-2.67-2.6 3.7-.54L15 9.1Z" fill="#fff"/>`
    : `<circle cx="15" cy="14.5" r="4.5" fill="#fff" fill-opacity=".95"/>`;
}

function MapMarkerSymbol({ isNewHotspot }: { isNewHotspot: boolean }) {
  return <svg className={isNewHotspot ? "map-marker-symbol map-marker-new" : "map-marker-symbol map-marker-existing"} viewBox="0 0 30 38" aria-hidden="true">
    <path className="map-marker-pin" d="M15 1.5C7.82 1.5 2 7.32 2 14.5c0 9.1 13 22 13 22s13-12.9 13-22c0-7.18-5.82-13-13-13Z" />
    {isNewHotspot ? <path className="map-marker-center" d="m15 7.5 2.2 4.45 4.9.71-3.55 3.46.84 4.88L15 18.7l-4.39 2.3.84-4.88-3.55-3.46 4.9-.71L15 7.5Z" /> : <circle className="map-marker-center" cx="15" cy="14.5" r="4.5" />}
  </svg>;
}

export function DashboardOverview({ rows }: { rows: OverviewRow[] }) {
  const coordinateCount = rows.filter((row) => {
    const [latitude, longitude] = (row.coordinates || "").split(/[\s,]+/).map(Number);
    return Number.isFinite(latitude) && Number.isFinite(longitude);
  }).length;

  return <section className="real-overview" aria-label="Peta sebaran hotspot"><article className="panel map-panel">
    <PanelHeading icon="map" title="Peta Persebaran Hotspot" subtitle={`Peta menampilkan ${rows.length} catatan yang dimuat; ${coordinateCount} memiliki koordinat. Daftar teks tersedia sebagai alternatif.`} tag="DATA LAPANGAN" />
    <div className="hotspot-map-legend" aria-label="Legenda peta">
      <span><MapMarkerSymbol isNewHotspot />Hotspot baru (bintang)</span>
      <span><MapMarkerSymbol isNewHotspot={false} />Hotspot lama (titik)</span>
    </div>
    <RealLeafletMap rows={rows} />
  </article></section>;
}

function RealLeafletMap({ rows }: { rows: OverviewRow[] }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const points = useMemo(() => rows.map((row) => {
    const [lat, lng] = (row.coordinates || "").split(/[\s,]+/).map(Number);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { row, lat, lng } : null;
  }).filter((point): point is { row: OverviewRow; lat: number; lng: number } => point !== null), [rows]);

  useEffect(() => {
    let active = true;
    const container = mapRef.current;
    import("leaflet").then((leaflet) => {
      if (!active || !container || !container.isConnected || instanceRef.current) return;
      try {
        const currentMap = leaflet.map(container, { zoomControl: true }).setView([-7.9666, 112.6326], 12);
        instanceRef.current = currentMap;
        layerRef.current = leaflet.layerGroup().addTo(currentMap);
        leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap" }).addTo(currentMap);
      } catch {
        instanceRef.current = null;
        layerRef.current = null;
        if (container.isConnected) container.replaceChildren();
      }
    });
    return () => {
      active = false;
      const currentMap = instanceRef.current;
      if (currentMap && currentMap.getContainer() === container) {
        instanceRef.current = null;
        layerRef.current = null;
        try {
          currentMap.remove();
        } catch {
          if (container?.isConnected) container.replaceChildren();
        }
      }
    };
  }, []);

  useEffect(() => {
    let active = true;
    import("leaflet").then((leaflet) => {
      const currentMap = instanceRef.current;
      const layer = layerRef.current;
      if (!active || !currentMap || !layer) return;
      try {
        layer.clearLayers();
        points.forEach(({ row, lat, lng }, index) => {
          const popup = document.createElement("div");
          const name = document.createElement("strong");
          name.textContent = row.name;
          popup.append(name, document.createElement("br"), document.createTextNode(row.area), document.createElement("br"), document.createTextNode(`Kategori: ${row.status === "Baru" ? "Hotspot baru" : "Hotspot lama"}`), document.createElement("br"), document.createTextNode(`Status pemeriksaan: ${row.qc}`));
          const isNewHotspot = row.status === "Baru";
          const color = isNewHotspot ? "#ec765d" : "#0f9f94";
          const shadowColor = isNewHotspot ? "#a83d32" : "#08645e";
          const gradientId = `hotspot-pin-gradient-${index}`;
          const icon = leaflet.divIcon({
            className: "hotspot-marker-icon",
            html: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="29" viewBox="0 0 30 38" aria-hidden="true"><defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${color}"/><stop offset=".58" stop-color="${color}"/><stop offset="1" stop-color="${shadowColor}"/></linearGradient></defs><path d="M15 1.5C7.82 1.5 2 7.32 2 14.5c0 9.1 13 22 13 22s13-12.9 13-22c0-7.18-5.82-13-13-13Z" fill="url(#${gradientId})" stroke="#fff" stroke-width="2"/><path d="M8 8.5c1.8-2.6 4.3-3.8 7-3.8" fill="none" stroke="#fff" stroke-linecap="round" stroke-opacity=".65" stroke-width="2"/>${markerShape(isNewHotspot)}</svg>`,
            iconSize: [22, 29],
            iconAnchor: [11, 28],
            popupAnchor: [0, -26],
          });
          leaflet.marker([lat, lng], { icon, title: isNewHotspot ? "Hotspot baru" : "Hotspot lama" }).bindPopup(popup).addTo(layer);
        });
        if (points.length === 1) currentMap.setView([points[0].lat, points[0].lng], 14);
        if (points.length > 1) currentMap.fitBounds(points.map((point) => [point.lat, point.lng] as [number, number]), { padding: [24, 24], maxZoom: 15 });
      } catch {
        if (currentMap.getContainer().isConnected) layer.clearLayers();
      }
    });
    return () => { active = false; };
  }, [points]);

  return <>
    <div className="leaflet-map-wrap"><div ref={mapRef} className="leaflet-map" />{points.length === 0 && <div className="real-empty">Belum ada koordinat GPS pada data.</div>}</div>
    <details className="map-text-alternative">
      <summary>Daftar teks lokasi pada peta ({points.length})</summary>
      {points.length > 0 ? <ul>{points.map(({ row }) => <li key={row.id}>
        <strong>{row.name}</strong>
        <span>{row.area} · {row.status === "Baru" ? "Hotspot baru" : "Hotspot lama"} · {row.qc} · Koordinat {row.coordinates}</span>
      </li>)}</ul> : <p>Belum ada lokasi berkoordinat untuk ditampilkan.</p>}
    </details>
  </>;
}
