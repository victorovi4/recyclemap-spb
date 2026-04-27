import type { PublicPoint, PublicCategory, CategoryId } from "@/lib/types";

type Props = {
  point: PublicPoint;
  categoryById: Map<CategoryId, PublicCategory>;
};

export default function PointPopup({ point, categoryById }: Props) {
  const sortedCats = point.categoryIds
    .map((id) => categoryById.get(id))
    .filter((c): c is PublicCategory => c !== undefined)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="text-sm max-w-xs">
      {point.photoUrl && (
        <img
          src={point.photoUrl}
          alt=""
          className="w-full h-32 object-cover rounded mb-2"
          loading="lazy"
        />
      )}

      <div className="font-semibold text-base mb-1">{point.name}</div>
      <div className="text-gray-700 mb-2">{point.address}</div>

      <div className="flex flex-wrap gap-1 mb-2">
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
        <div className="mb-1">
          <span className="text-gray-500">Часы:</span> {point.hours}
        </div>
      )}
      {point.phone && (
        <div className="mb-1">
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
        <div className="mb-1">
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
        <div className="mt-2 text-gray-700">{point.description}</div>
      )}
    </div>
  );
}
