"use client";

import type { PublicPoint, PublicCategory, CategoryId } from "@/lib/types";
import PointDetails from "./PointDetails";

type Props = {
  point: PublicPoint | null;
  categoryById: Map<CategoryId, PublicCategory>;
  onClose: () => void;
};

/**
 * Desktop sidebar — overlay поверх правой части карты, ширина 360px.
 * Slide-in анимация через transform: translateX. Виден только на ≥md
 * через `hidden md:block`. Когда point=null — sidebar остаётся в DOM,
 * но сдвинут вправо за пределы видимости (`translate-x-full`).
 */
export default function PointDetailsSidebar({
  point,
  categoryById,
  onClose,
}: Props) {
  return (
    <aside
      className={
        "hidden md:block absolute right-0 top-0 bottom-0 w-[360px] bg-white " +
        "shadow-[-4px_0_12px_rgba(0,0,0,0.1)] transition-transform duration-300 ease-out " +
        "z-[1000] " +
        (point ? "translate-x-0" : "translate-x-full")
      }
      aria-hidden={!point}
    >
      {point && (
        <PointDetails
          point={point}
          categoryById={categoryById}
          onClose={onClose}
        />
      )}
    </aside>
  );
}
