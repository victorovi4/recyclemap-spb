"use client";

import { useState } from "react";
import { Drawer } from "vaul";
import type { PublicPoint, PublicCategory, CategoryId } from "@/lib/types";
import PointDetails from "./PointDetails";

const SNAP_POINTS: (number | string)[] = [0.4, 0.92];

type Props = {
  point: PublicPoint | null;
  categoryById: Map<CategoryId, PublicCategory>;
  onClose: () => void;
};

/**
 * Mobile bottom-sheet через vaul. Snap-точки [0.4, 0.92] — peek и full.
 * Закрывается свайпом вниз ниже peek (vaul вызывает onOpenChange(false)).
 * На десктопе скрыт через md:hidden (overlay и content) — vaul не рендерит
 * Portal-элементы когда open=false.
 *
 * Vaul 1.1.x требует controlled snap (activeSnapPoint + setActiveSnapPoint)
 * когда заданы snapPoints — иначе sheet остаётся за пределами viewport.
 */
export default function PointDetailsSheet({
  point,
  categoryById,
  onClose,
}: Props) {
  const [activeSnap, setActiveSnap] = useState<number | string | null>(
    SNAP_POINTS[0],
  );

  return (
    <Drawer.Root
      open={point !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
          // Сбрасываем snap при закрытии — следующее открытие начнётся с peek
          setActiveSnap(SNAP_POINTS[0]);
        }
      }}
      snapPoints={SNAP_POINTS}
      activeSnapPoint={activeSnap}
      setActiveSnapPoint={setActiveSnap}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="md:hidden fixed inset-0 bg-black/20 z-[1001]" />
        <Drawer.Content className="md:hidden fixed bottom-0 left-0 right-0 z-[1002] bg-white rounded-t-xl flex flex-col max-h-[92vh]">
          <Drawer.Title className="sr-only">
            {point?.name ?? "Точка приёма"}
          </Drawer.Title>
          <div className="mx-auto w-10 h-1 bg-gray-300 rounded-full my-2 shrink-0" />
          <div className="flex-1 overflow-y-auto">
            {point && (
              <PointDetails
                point={point}
                categoryById={categoryById}
                onClose={onClose}
              />
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
