"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";

type Props = {
  center: [number, number];
  zoom: number;
};

/**
 * Применяет внешние center/zoom (из URL) к карте, не вызывая событий moveend
 * (animate: false). Защита от петли URL → карта → URL: храним последнюю
 * применённую позицию и пропускаем повторное setView, если props не менялись.
 */
export default function MapView({ center, zoom }: Props) {
  const map = useMap();
  const lastApplied = useRef<{ center: [number, number]; zoom: number }>({
    center,
    zoom,
  });

  useEffect(() => {
    const same =
      lastApplied.current.center[0] === center[0] &&
      lastApplied.current.center[1] === center[1] &&
      lastApplied.current.zoom === zoom;
    if (same) return;
    lastApplied.current = { center, zoom };
    map.setView(center, zoom, { animate: false });
  }, [center, zoom, map]);

  return null;
}
