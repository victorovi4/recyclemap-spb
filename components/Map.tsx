"use client";

import dynamic from "next/dynamic";
import type { PublicPoint, PublicCategory } from "@/lib/types";

const MapInner = dynamic(() => import("./MapInner"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center text-gray-500">
      Загрузка карты…
    </div>
  ),
});

type Props = {
  points: PublicPoint[];
  categories: PublicCategory[];
  center: [number, number];
  zoom: number;
  onMoveEnd: (center: [number, number], zoom: number) => void;
  onPointClick: (id: string) => void;
  forcePoint: { lat: number; lng: number } | null;
};

export default function Map(props: Props) {
  return <MapInner {...props} />;
}
