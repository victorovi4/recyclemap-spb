"use client";

type Props = {
  selectedCount: number;
  totalCount: number;
  pointCount: number;
  children: React.ReactNode;
};

export default function MobileFilterDrawer({
  selectedCount,
  totalCount,
  pointCount,
  children,
}: Props) {
  return (
    <details className="md:hidden bg-white border-b border-gray-200">
      <summary
        className="flex items-center justify-between px-4 py-3 cursor-pointer list-none select-none"
      >
        <span className="font-medium text-sm">
          🎯 Фильтры
          {selectedCount < totalCount && (
            <span className="ml-1 text-emerald-700">({selectedCount})</span>
          )}
        </span>
        <span className="text-xs text-gray-500">
          Найдено: {pointCount}
          <span className="filter-arrow ml-2 inline-block transition-transform">
            ▾
          </span>
        </span>
      </summary>
      <div className="px-4 pb-4 pt-1 border-t border-gray-100">
        {children}
      </div>
    </details>
  );
}
