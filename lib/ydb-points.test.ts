import { describe, it, expect } from "vitest";
import { pointsEqual, type PointRow } from "./ydb-points";

describe("pointsEqual", () => {
  const base: PointRow = {
    id: "rsbor-3",
    name: "Пункт приёма",
    address: "Санкт-Петербург, Варфоломеевская, 18Д",
    lat: 59.88,
    lng: 30.42,
    description: "Металл",
    hours: "Пн–Вс 10:00–19:00",
    schedule_json: '[{"dow":0,"opens":["10:00"],"closes":["19:00"]}]',
    phone: "88123208340",
    website: "https://metall-lom.ru",
    photo_url: "258_20161004.jpg",
    status: "active",
    source: "rsbor",
    source_id: "3",
    categoryIds: ["metal"],
  };

  it("equal when all fields match", () => {
    expect(pointsEqual(base, { ...base })).toBe(true);
  });

  it("not equal when name differs", () => {
    expect(pointsEqual(base, { ...base, name: "Другое" })).toBe(false);
  });

  it("not equal when categoryIds differ", () => {
    expect(pointsEqual(base, { ...base, categoryIds: ["metal", "paper"] })).toBe(false);
  });

  it("equal regardless of categoryIds order", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = { ...base, categoryIds: ["metal", "paper"] as any };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = { ...base, categoryIds: ["paper", "metal"] as any };
    expect(pointsEqual(a, b)).toBe(true);
  });

  it("not equal when id differs", () => {
    expect(pointsEqual(base, { ...base, id: "rsbor-999" })).toBe(false);
  });

  it("not equal when source_id differs", () => {
    expect(pointsEqual(base, { ...base, source_id: "999" })).toBe(false);
  });
});
