"use client";

import dynamic from "next/dynamic";
import type { Point, Category } from "@/lib/types";

const MapInner = dynamic(() => import("./MapInner"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center text-gray-500">
      Загрузка карты…
    </div>
  ),
});

type Props = {
  points: Point[];
  categories: Category[];
};

export default function Map(props: Props) {
  return <MapInner {...props} />;
}
