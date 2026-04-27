"use client";

import { useMemo, useState } from "react";
import type { PublicCategory, PublicPoint, CategoryId } from "@/lib/types";
import Map from "@/components/Map";
import FilterPanel from "@/components/FilterPanel";

type Props = {
  points: PublicPoint[];
  categories: PublicCategory[];
};

export default function HomeClient({ points, categories }: Props) {
  const allCategoryIds = useMemo<CategoryId[]>(
    () => categories.map((c) => c.id),
    [categories],
  );

  const [selected, setSelected] = useState<Set<CategoryId>>(
    () => new Set(allCategoryIds),
  );

  const filteredPoints = useMemo(
    () => points.filter((p) => p.categoryIds.some((c) => selected.has(c))),
    [points, selected],
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

      <section className="flex-1">
        <Map points={filteredPoints} categories={categories} />
      </section>
    </div>
  );
}
