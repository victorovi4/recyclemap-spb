export type CategoryId =
  | "plastic"
  | "glass"
  | "paper"
  | "metal"
  | "batteries"
  | "electronics"
  | "tetrapak"
  | "textile"
  | "lamps"
  | "caps"
  | "tires"
  | "hazardous"
  | "other";

export type Category = {
  id: CategoryId;
  label: string;
  color: string; // HEX
  icon: string; // emoji (fallback)
  iconPath?: string; // SVG-путь для рендера
  rsborId?: number; // для импорта
};

export type Point = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  categories: CategoryId[];
  hours: string;
  phone: string;
  website: string;
  description: string;
  source: string;
};

export type PublicCategory = {
  id: CategoryId;
  label: string;
  color: string;          // HEX
  iconPath: string | null; // "/icons/fractions/paper.svg"
  emoji: string;          // fallback "📄"
  sortOrder: number;
};

export type PublicPoint = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  categoryIds: CategoryId[]; // в порядке вставки в YDB; сортировка по sortOrder — на стороне рендера
  hours: string | null;
  phone: string | null;
  website: string | null;
  description: string | null;
  photoUrl: string | null;
};
