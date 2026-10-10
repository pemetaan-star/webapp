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

export function DashboardOverview({ rows, totalRows = rows.length }: { rows: OverviewRow[]; totalRows?: number }) {
  const coordinateCount = rows.filter((row) => {
    const [latitude, longitude] = (row.coordinates || "").split(/[\s,]+/).map(Number);
    return Number.isFinite(latitude) && Number.isFinite(longitude);
  }).length;

  const loadedScope = totalRows > rows.length ? `${rows.length} dari ${totalRows} data termuat` : `${rows.length} data`;

  return <section className="real-overview" aria-label="Peta sebaran hotspot"><article className="panel map-panel"><PanelHeading icon="⌖" title="Peta Persebaran Hotspot" subtitle={`${coordinateCount} memiliki koordinat · ${loadedScope}`} tag="DATA LAPANGAN" /><div className="hotspot-map-legend" aria-label="Legenda peta"><span><i className="map-marker-swatch map-marker-new" />Hotspot baru</span><span><i className="map-marker-swatch map-marker-existing" />Hotspot lama</span></div><RealLeafletMap rows={rows} /></article></section>;
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
            html: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="29" viewBox="0 0 30 38" aria-hidden="true"><defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${color}"/><stop offset=".58" stop-color="${color}"/><stop offset="1" stop-color="${shadowColor}"/></linearGradient></defs><path d="M15 1.5C7.82 1.5 2 7.32 2 14.5c0 9.1 13 22 13 22s13-12.9 13-22c0-7.18-5.82-13-13-13Z" fill="url(#${gradientId})" stroke="#fff" stroke-width="2"/><path d="M8 8.5c1.8-2.6 4.3-3.8 7-3.8" fill="none" stroke="#fff" stroke-linecap="round" stroke-opacity=".65" stroke-width="2"/><circle cx="15" cy="14.5" r="4.5" fill="#fff" fill-opacity=".95"/></svg>`,
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

  return <div className="leaflet-map-wrap"><div ref={mapRef} className="leaflet-map" />{points.length === 0 && <div className="real-empty">Belum ada koordinat GPS pada data.</div>}</div>;
}
