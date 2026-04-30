"use client";

import type { PublicPoint, PublicCategory, CategoryId } from "@/lib/types";

type Props = {
  point: PublicPoint;
  categoryById: Map<CategoryId, PublicCategory>;
  onClose: () => void;
};

export default function PointDetails({ point, categoryById, onClose }: Props) {
  const sortedCats = point.categoryIds
    .map((id) => categoryById.get(id))
    .filter((c): c is PublicCategory => c !== undefined)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="relative h-full overflow-y-auto p-4">
      <button
        type="button"
        onClick={onClose}
        aria-label="Закрыть"
        className="absolute right-3 top-3 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 z-10 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
      >
        ×
      </button>

      {point.photoUrl && (
        <img
          src={point.photoUrl}
          alt=""
          className="w-full h-40 object-cover rounded mb-3"
          loading="lazy"
        />
      )}

      <h2 className="font-semibold text-lg mb-1 pr-8">{point.name}</h2>
      <p className="text-sm text-gray-700 mb-3">{point.address}</p>

      <div className="flex flex-wrap gap-1 mb-3">
        {sortedCats.map((cat) => (
          <span
            key={cat.id}
            className="text-xs px-2 py-0.5 rounded-full text-white inline-flex items-center gap-1"
            style={{ backgroundColor: cat.color }}
          >
            {cat.iconPath ? (
              <img
                src={cat.iconPath}
                alt=""
                className="w-3 h-3 invert"
                aria-hidden
              />
            ) : (
              <span aria-hidden>{cat.emoji}</span>
            )}
            {cat.label}
          </span>
        ))}
      </div>

      {point.hours && (
        <div className="mb-2 text-sm">
          <span className="text-gray-500">Часы:</span> {point.hours}
        </div>
      )}
      {point.phone && (
        <div className="mb-2 text-sm">
          <span className="text-gray-500">Телефон:</span>{" "}
          <a
            href={`tel:${point.phone}`}
            className="text-emerald-700 underline"
          >
            {point.phone}
          </a>
        </div>
      )}
      {point.website && (
        <div className="mb-2 text-sm">
          <a
            href={point.website}
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-700 underline"
          >
            Сайт
          </a>
        </div>
      )}
      {point.description && (
        <div className="mt-3 text-sm text-gray-700">{point.description}</div>
      )}
    </div>
  );
}
