export type CategoryId =
  | "plastic"
  | "glass"
  | "paper"
  | "metal"
  | "batteries"
  | "electronics"
  | "tetrapak"
  | "textile";

export type Category = {
  id: CategoryId;
  label: string;
  color: string; // HEX
  icon: string; // emoji
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
