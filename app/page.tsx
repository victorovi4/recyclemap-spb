import { fetchAllPoints } from "@/lib/ydb-points";
import { fetchAllCategories } from "@/lib/categories";
import HomeClient from "@/components/HomeClient";

// Рендерим только на сервере при запросе — YDB env-vars недоступны в build-time
// (они приходят из YC Serverless Container в рантайме). С `force-dynamic` Next.js
// не пытается prerender'ить эту страницу при `next build`.
//
// `revalidate` намеренно НЕ ставим: оно несовместимо с `force-dynamic` (Next.js
// 16 при их сочетании игнорирует `revalidate`). Кеш 5 мин на YDB-чтение можно
// добавить позже через `unstable_cache()` вокруг fetchAllPoints/Categories,
// если станет нужно — пока трафика мало, рендер на каждый запрос комфортный.
export const dynamic = "force-dynamic";

export default async function Home() {
  const [points, categories] = await Promise.all([
    fetchAllPoints(),
    fetchAllCategories(),
  ]);
  return <HomeClient points={points} categories={categories} />;
}
