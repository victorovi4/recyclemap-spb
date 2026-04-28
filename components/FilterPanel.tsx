"use client";

import type { PublicCategory, CategoryId } from "@/lib/types";
import CategoryChip from "./CategoryChip";

type Props = {
  categories: PublicCategory[];
  selected: Set<CategoryId>;
  onToggle: (id: CategoryId) => void;
  onSelectAll: () => void;
  onReset: () => void;
  pointCount: number;
};

export default function FilterPanel({
  categories,
  selected,
  onToggle,
  onSelectAll,
  onReset,
  pointCount,
}: Props) {
  return (
    <div className="flex flex-col h-full">
      <h2 className="font-semibold mb-3">Фильтры</h2>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {categories.map((c) => (
          <CategoryChip
            key={c.id}
            category={c}
            active={selected.has(c.id)}
            onClick={() => onToggle(c.id)}
          />
        ))}
      </div>

      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={onSelectAll}
          className="text-sm px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
        >
          Выбрать все
        </button>
        <button
          type="button"
          onClick={onReset}
          className="text-sm px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
        >
          Сбросить
        </button>
      </div>

      <div className="text-sm text-gray-600">
        Найдено: <span className="font-semibold">{pointCount}</span>
      </div>
    </div>
  );
}
