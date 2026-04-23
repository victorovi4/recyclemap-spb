import Image from "next/image";
import {
  getCategoriesWithCounts,
  getPointsBySource,
  getRecentPoints,
} from "@/lib/admin-stats";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const [pointsBySource, categories, recent] = await Promise.all([
    getPointsBySource(),
    getCategoriesWithCounts(),
    getRecentPoints(5),
  ]);
  const totalPoints = pointsBySource.reduce((s, r) => s + r.count, 0);

  return (
    <main className="p-6 max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold mb-1">Админка RecycleMap СПб</h1>
      <p className="text-sm text-gray-500 mb-8">
        Живые данные из YDB. Модерация и ручное добавление — в Phase F.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-3">Точки в базе</h2>
        <div className="flex flex-wrap gap-3">
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-5 py-3 min-w-[140px]">
            <div className="text-3xl font-bold text-emerald-700">
              {totalPoints.toLocaleString("ru-RU")}
            </div>
            <div className="text-sm text-gray-600">всего</div>
          </div>
          {pointsBySource.map((r) => (
            <div
              key={r.source}
              className="bg-gray-50 border border-gray-200 rounded-lg px-5 py-3 min-w-[140px]"
            >
              <div className="text-3xl font-bold text-gray-900">
                {r.count.toLocaleString("ru-RU")}
              </div>
              <div className="text-sm text-gray-600 font-mono">
                source = {r.source}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-3">
          Категории{" "}
          <span className="text-sm font-normal text-gray-500">
            (таксономия «РазДельного Сбора», 13 штук)
          </span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
          {categories.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg bg-white"
            >
              {c.icon_path ? (
                <Image
                  src={c.icon_path}
                  alt=""
                  width={32}
                  height={32}
                  className="w-8 h-8 shrink-0"
                />
              ) : (
                <span className="text-2xl shrink-0">{c.icon}</span>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{c.label}</div>
                <div className="text-xs text-gray-500">
                  {c.point_count.toLocaleString("ru-RU")} точек
                </div>
              </div>
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: c.color }}
                aria-hidden
              />
            </div>
          ))}
        </div>
      </section>

      {recent.length > 0 && (
        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-3">Недавние точки из импорта</h2>
          <div className="border border-gray-200 rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-3 py-2">Название</th>
                  <th className="px-3 py-2">Адрес</th>
                  <th className="px-3 py-2">Часы</th>
                  <th className="px-3 py-2">Телефон</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recent.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2 font-medium">{p.name}</td>
                    <td className="px-3 py-2 text-gray-600">{p.address}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                      {p.hours ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                      {p.phone ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="text-sm text-gray-600 border-t border-gray-200 pt-6">
        <p className="mb-1">
          🔄 Автоимпорт из API recyclemap.ru запускается каждое воскресенье
          03:00 МСК через YC Trigger{" "}
          <code className="bg-gray-100 px-1 rounded">
            recyclemap-rsbor-import-weekly
          </code>
          .
        </p>
        <p>
          ✉️ Отчёт приходит на email администраторов после каждого запуска.
        </p>
      </section>
    </main>
  );
}
