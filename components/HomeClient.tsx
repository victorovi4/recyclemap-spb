"use client";

import { useEffect, useMemo } from "react";
import { useQueryState } from "nuqs";
import type { PublicCategory, PublicPoint, CategoryId } from "@/lib/types";
import {
  fractionsParser,
  llParser,
  zoomParser,
  pointParser,
  sanitizeFractions,
} from "@/lib/url-state";
import Map from "@/components/Map";
import FilterPanel from "@/components/FilterPanel";
import MobileFilterDrawer from "@/components/MobileFilterDrawer";
import PointDetailsSidebar from "@/components/PointDetailsSidebar";
import PointDetailsSheet from "@/components/PointDetailsSheet";

type Props = {
  points: PublicPoint[];
  categories: PublicCategory[];
};

const DEFAULT_CENTER: [number, number] = [59.9386, 30.3141];
const DEFAULT_ZOOM = 11;

export default function HomeClient({ points, categories }: Props) {
  const allCategoryIds = useMemo<CategoryId[]>(
    () => categories.map((c) => c.id),
    [categories],
  );

  const categoryById = useMemo<globalThis.Map<CategoryId, PublicCategory>>(
    () => new globalThis.Map(categories.map((c): [CategoryId, PublicCategory] => [c.id, c])),
    [categories],
  );

  const [rawFractions, setFractions] = useQueryState("f", fractionsParser);
  const [llRaw, setLL] = useQueryState("ll", llParser);
  const [zRaw, setZ] = useQueryState("z", zoomParser);
  const [pointId, setPoint] = useQueryState("p", pointParser);

  const sanitized = useMemo(
    () => sanitizeFractions(rawFractions),
    [rawFractions],
  );

  // null (параметра нет) → все 13 включены; [] → ничего; [...] → как есть.
  const selected = useMemo<Set<CategoryId>>(() => {
    return sanitized === null
      ? new Set(allCategoryIds)
      : new Set(sanitized);
  }, [sanitized, allCategoryIds]);

  const filteredPoints = useMemo(
    () => points.filter((p) => p.categoryIds.some((c) => selected.has(c))),
    [points, selected],
  );

  // Текущая выбранная точка — null если ?p= нет в URL ИЛИ id невалиден.
  const selectedPoint = useMemo(
    () => (pointId ? points.find((p) => p.id === pointId) ?? null : null),
    [points, pointId],
  );

  // Тихая очистка невалидного ?p= (например, точку удалили из импорта)
  useEffect(() => {
    if (pointId && !selectedPoint) {
      setPoint(null);
    }
  }, [pointId, selectedPoint, setPoint]);

  // ESC закрывает sidebar/sheet на десктопе. (Vaul сам ловит ESC для шита.)
  useEffect(() => {
    if (!pointId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPoint(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [pointId, setPoint]);

  const center: [number, number] = llRaw ?? DEFAULT_CENTER;
  const zoom: number = zRaw ?? DEFAULT_ZOOM;
  const forcePoint = selectedPoint
    ? { lat: selectedPoint.lat, lng: selectedPoint.lng }
    : null;

  const toggle = (id: CategoryId) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);

    if (next.size === allCategoryIds.length) {
      setFractions(null); // все включены → URL чистый
    } else {
      setFractions([...next]); // в порядке вставки
    }
  };

  const selectAll = () => setFractions(null);
  const reset = () => setFractions([]);

  const onMoveEnd = (c: [number, number], z: number) => {
    setLL(c);
    setZ(z);
  };

  const onPointClick = (id: string) => {
    setPoint(id);
  };

  const onCloseDetails = () => {
    setPoint(null);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Mobile-only: <details> со списком чипов под header */}
      <MobileFilterDrawer
        selectedCount={selected.size}
        totalCount={allCategoryIds.length}
        pointCount={filteredPoints.length}
      >
        <FilterPanel
          categories={categories}
          selected={selected}
          onToggle={toggle}
          onSelectAll={selectAll}
          onReset={reset}
          pointCount={filteredPoints.length}
        />
      </MobileFilterDrawer>

      <div className="flex flex-1 min-h-0">
        {/* Desktop-only sidebar (filters) */}
        <aside className="hidden md:flex md:flex-col w-64 shrink-0 border-r border-gray-200 p-4 overflow-y-auto bg-white">
          <FilterPanel
            categories={categories}
            selected={selected}
            onToggle={toggle}
            onSelectAll={selectAll}
            onReset={reset}
            pointCount={filteredPoints.length}
          />
        </aside>

        {/* Карта + desktop point details sidebar (overlay) */}
        <section className="flex-1 relative">
          <Map
            points={filteredPoints}
            categories={categories}
            center={center}
            zoom={zoom}
            onMoveEnd={onMoveEnd}
            onPointClick={onPointClick}
            forcePoint={forcePoint}
          />
          <PointDetailsSidebar
            point={selectedPoint}
            categoryById={categoryById}
            onClose={onCloseDetails}
          />
        </section>
      </div>

      {/* Mobile bottom-sheet — снаружи layout, использует Portal */}
      <PointDetailsSheet
        point={selectedPoint}
        categoryById={categoryById}
        onClose={onCloseDetails}
      />
    </div>
  );
}
