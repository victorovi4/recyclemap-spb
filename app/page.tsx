"use client";

import { useMemo, useState } from "react";
import { categories, points } from "@/lib/data";
import type { CategoryId } from "@/lib/types";
import Map from "@/components/Map";
import FilterPanel from "@/components/FilterPanel";

const allCategoryIds: CategoryId[] = categories.map((c) => c.id);

export default function Home() {
  // По умолчанию включены все категории — видны все точки.
  const [selected, setSelected] = useState<Set<CategoryId>>(
    () => new Set(allCategoryIds),
  );

  // Точка показывается, если ХОТЯ БЫ ОДНА её категория выбрана в фильтре.
  const filteredPoints = useMemo(
    () => points.filter((p) => p.categories.some((c) => selected.has(c))),
    [selected],
  );

  const toggle = (id: CategoryId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(allCategoryIds));
  const reset = () => setSelected(new Set());

  return (
    <div className="flex flex-1 min-h-0">
      {/* Левая колонка — фильтры (скрыта на мобильных, для них будет шторка) */}
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

      {/* Карта */}
      <section className="flex-1">
        <Map points={filteredPoints} categories={categories} />
      </section>
    </div>
  );
}
