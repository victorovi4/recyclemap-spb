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
};

export default function Map(props: Props) {
  return <MapInner {...props} />;
}
