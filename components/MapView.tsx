"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";

type Props = {
  center: [number, number];
  zoom: number;
  forcePoint: { lat: number; lng: number } | null;
};

/**
 * Применяет внешние center/zoom к карте. Если задан forcePoint, имеет
 * приоритет: setView на координаты точки с zoom = max(current, 14)
 * и animate: true (плавный pan).
 *
 * Защита от петли URL ↔ карта:
 *   `lastApplied.current.key` — единый строковый ключ для обоих режимов.
 *   Если ключ совпадает с предыдущим — setView НЕ вызывается.
 *
 * Сценарий открытия точки:
 *   1. Пользователь кликает маркер → setP(id) → forcePoint появляется.
 *   2. MapView вызывает setView({ animate: true }), карта плавно едет.
 *   3. После анимации Leaflet генерит moveend → MapEventsBridge через 300ms
 *      пишет ?ll&z в URL.
 *   4. На следующем рендере MapView видит ТОТ ЖЕ forcePoint → key не
 *      изменился → setView не вызывается. Петли нет.
 *   5. Пользователь нажимает × → setP(null) → forcePoint станет null →
 *      MapView переключается на view-mode. center/zoom уже актуальные
 *      (Leaflet знает свою позицию), так что setView будет no-op либо
 *      минимальная перерисовка без анимации.
 */
export default function MapView({ center, zoom, forcePoint }: Props) {
  const map = useMap();
  const lastApplied = useRef<{ key: string }>({ key: "" });

  useEffect(() => {
    if (forcePoint) {
      const newZoom = Math.max(map.getZoom(), 14);
      const key = `pt:${forcePoint.lat},${forcePoint.lng},${newZoom}`;
      if (lastApplied.current.key === key) return;
      lastApplied.current.key = key;
      map.setView([forcePoint.lat, forcePoint.lng], newZoom, {
        animate: true,
      });
      return;
    }
    const key = `view:${center[0]},${center[1]},${zoom}`;
    if (lastApplied.current.key === key) return;
    lastApplied.current.key = key;
    map.setView(center, zoom, { animate: false });
  }, [center, zoom, forcePoint, map]);

  return null;
}
