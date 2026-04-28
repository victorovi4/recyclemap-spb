"use client";

import { useEffect, useRef } from "react";
import { useMapEvents } from "react-leaflet";

type Props = {
  onMoveEnd: (center: [number, number], zoom: number) => void;
};

/**
 * Слушает leaflet 'moveend' (drag/zoom закончился), debounce 300ms,
 * округляет координаты до 4 знаков и зовёт onMoveEnd. Колбэк, в свою
 * очередь, обновит URL через nuqs.
 */
export default function MapEventsBridge({ onMoveEnd }: Props) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const map = useMapEvents({
    moveend: () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        const c = map.getCenter();
        onMoveEnd(
          [
            Math.round(c.lat * 10000) / 10000,
            Math.round(c.lng * 10000) / 10000,
          ],
          map.getZoom(),
        );
      }, 300);
    },
  });

  // Cleanup pending debounce on unmount
  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  return null;
}
