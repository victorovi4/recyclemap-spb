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
