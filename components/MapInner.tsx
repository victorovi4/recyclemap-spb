"use client";

import {
  MapContainer,
  TileLayer,
  Marker,
  AttributionControl,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import MarkerClusterGroup from "react-leaflet-cluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import type { PublicPoint, PublicCategory, CategoryId } from "@/lib/types";
import { buildBeadHtml } from "./beadMarker";
import MapView from "./MapView";
import MapEventsBridge from "./MapEventsBridge";

function beadIcon(colors: string[]): L.DivIcon {
  return L.divIcon({
    className: "",
    html: buildBeadHtml(colors),
    iconAnchor: [9, 9],
  });
}

type Props = {
  points: PublicPoint[];
  categories: PublicCategory[];
  center: [number, number];
  zoom: number;
  onMoveEnd: (center: [number, number], zoom: number) => void;
  onPointClick: (id: string) => void;
  forcePoint: { lat: number; lng: number } | null;
};

export default function MapInner({
  points,
  categories,
  center,
  zoom,
  onMoveEnd,
  onPointClick,
  forcePoint,
}: Props) {
  const categoryById = new Map<CategoryId, PublicCategory>(
    categories.map((c) => [c.id, c]),
  );

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      className="h-full w-full"
      scrollWheelZoom
      attributionControl={false}
    >
      <MapView center={center} zoom={zoom} forcePoint={forcePoint} />
      <MapEventsBridge onMoveEnd={onMoveEnd} />
      <AttributionControl prefix={false} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MarkerClusterGroup
        chunkedLoading
        maxClusterRadius={50}
        spiderfyOnMaxZoom
        showCoverageOnHover={false}
        disableClusteringAtZoom={15}
      >
        {points.map((p) => {
          const sortedCats = p.categoryIds
            .map((id) => categoryById.get(id))
            .filter((c): c is PublicCategory => c !== undefined)
            .sort((a, b) => a.sortOrder - b.sortOrder);
          const colors = sortedCats.map((c) => c.color);
          return (
            <Marker
              key={p.id}
              position={[p.lat, p.lng]}
              icon={beadIcon(colors)}
              eventHandlers={{ click: () => onPointClick(p.id) }}
            />
          );
        })}
      </MarkerClusterGroup>
    </MapContainer>
  );
}
