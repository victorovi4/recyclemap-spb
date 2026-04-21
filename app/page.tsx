"use client";

import { categories, points } from "@/lib/data";
import Map from "@/components/Map";

export default function Home() {
  return (
    <div className="flex flex-1 min-h-0">
      {/* Левая колонка — фильтры (пока заглушка) */}
      <aside className="hidden md:flex md:flex-col w-64 shrink-0 border-r border-gray-200 p-4 overflow-y-auto bg-white">
        <h2 className="font-semibold mb-3">Фильтры</h2>
        <p className="text-sm text-gray-500 mb-4">
          Категории ({categories.length}) появятся здесь
        </p>
        <p className="text-sm text-gray-600">Точек в базе: {points.length}</p>
      </aside>

      {/* Карта */}
      <section className="flex-1">
        <Map points={points} categories={categories} />
      </section>
    </div>
  );
}
