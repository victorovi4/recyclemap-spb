"use client";

import type { PublicCategory } from "@/lib/types";

type Props = {
  category: PublicCategory;
  active: boolean;
  onClick: () => void;
};

export default function CategoryChip({ category, active, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs " +
        "font-medium border border-transparent transition-colors cursor-pointer " +
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 " +
        (active
          ? "text-white"
          : "bg-gray-200 text-gray-700 hover:bg-gray-300")
      }
      style={active ? { backgroundColor: category.color } : undefined}
    >
      <span aria-hidden>{category.emoji}</span>
      {category.label}
    </button>
  );
}
