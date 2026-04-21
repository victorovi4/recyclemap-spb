"use client";

import type { Category, CategoryId } from "@/lib/types";

type Props = {
  categories: Category[];
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

      <ul className="space-y-2 mb-4">
        {categories.map((c) => (
          <li key={c.id}>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={selected.has(c.id)}
                onChange={() => onToggle(c.id)}
                className="w-4 h-4 accent-emerald-700"
              />
              <span
                className="inline-block w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: c.color }}
                aria-hidden
              />
              <span className="text-sm">
                {c.icon} {c.label}
              </span>
            </label>
          </li>
        ))}
      </ul>

      <div className="flex gap-2 mb-4">
        <button
          onClick={onSelectAll}
          className="text-sm px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
        >
          Выбрать все
        </button>
        <button
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
