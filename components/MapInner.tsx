"use client";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Point, Category, CategoryId } from "@/lib/types";
import PointPopup from "./PointPopup";

function coloredIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="
      width: 22px; height: 22px; border-radius: 50%;
      background: ${color}; border: 2px solid white;
      box-shadow: 0 1px 4px rgba(0,0,0,0.4);
    "></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

type Props = {
  points: Point[];
  categories: Category[];
};

export default function MapInner({ points, categories }: Props) {
  const categoryById = new Map<CategoryId, Category>(
    categories.map((c) => [c.id, c])
  );

  return (
    <MapContainer
      center={[59.9386, 30.3141]}
      zoom={11}
      className="h-full w-full"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {points.map((p) => {
        const primary = categoryById.get(p.categories[0]);
        const color = primary?.color ?? "#888";
        return (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            icon={coloredIcon(color)}
          >
            <Popup>
              <PointPopup point={p} categoryById={categoryById} />
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
