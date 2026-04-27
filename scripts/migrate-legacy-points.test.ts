import { describe, it, expect } from "vitest";
import { findDuplicateByRadius, haversineMeters } from "./migrate-legacy-points";

describe("haversineMeters", () => {
  it("одинаковые координаты → 0 м", () => {
    expect(haversineMeters(59.94, 30.31, 59.94, 30.31)).toBe(0);
  });

  it("известный отрезок: 0.001° по широте ≈ 111 м", () => {
    const d = haversineMeters(59.94, 30.31, 59.941, 30.31);
    expect(d).toBeGreaterThan(105);
    expect(d).toBeLessThan(115);
  });
});

describe("findDuplicateByRadius", () => {
  const haystack = [
    { id: "rsbor-1", lat: 59.94, lng: 30.31 },
    { id: "rsbor-2", lat: 59.95, lng: 30.32 },
    { id: "rsbor-3", lat: 59.9395, lng: 30.31 }, // ~55 м к rsbor-1
  ];

  it("находит ближайший в радиусе 150 м", () => {
    const r = findDuplicateByRadius({ lat: 59.94, lng: 30.31 }, haystack, 150);
    expect(r?.id).toBe("rsbor-1");
    expect(r?.distanceMeters).toBeLessThan(1);
  });

  it("предпочитает ближайший, если в радиусе двое", () => {
    // Точка ровно посередине между rsbor-1 и rsbor-3
    const r = findDuplicateByRadius({ lat: 59.93975, lng: 30.31 }, haystack, 150);
    // Дистанция до обоих ~28 м; функция возвращает любой ближайший
    expect(["rsbor-1", "rsbor-3"]).toContain(r?.id);
  });

  it("возвращает null если ничего в радиусе", () => {
    const r = findDuplicateByRadius({ lat: 60.0, lng: 30.5 }, haystack, 150);
    expect(r).toBeNull();
  });

  it("возвращает null для пустого haystack", () => {
    const r = findDuplicateByRadius({ lat: 59.94, lng: 30.31 }, [], 150);
    expect(r).toBeNull();
  });
});
