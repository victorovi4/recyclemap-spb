import type { Category, Point } from "./types";
import categoriesJson from "@/data/categories.json";
import pointsJson from "@/data/points.json";

export const categories: Category[] = categoriesJson as Category[];
export const points: Point[] = pointsJson as Point[];
