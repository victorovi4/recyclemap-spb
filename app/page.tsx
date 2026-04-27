import { fetchAllPoints } from "@/lib/ydb-points";
import { fetchAllCategories } from "@/lib/categories";
import HomeClient from "@/components/HomeClient";

export const revalidate = 300; // Next.js 16: данные кешируются на 5 минут

export default async function Home() {
  const [points, categories] = await Promise.all([
    fetchAllPoints(),
    fetchAllCategories(),
  ]);
  return <HomeClient points={points} categories={categories} />;
}
