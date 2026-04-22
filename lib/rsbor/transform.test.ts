import { describe, it, expect } from "vitest";
import { parseGeom, formatSchedule, isSpbAddress, type RSBorScheduleDay } from "./transform";

describe("parseGeom", () => {
  it("extracts lng and lat from WKT POINT", () => {
    expect(parseGeom("POINT(30.420172 59.879528)")).toEqual({
      lng: 30.420172,
      lat: 59.879528,
    });
  });

  it("throws on malformed WKT", () => {
    expect(() => parseGeom("LINESTRING(1 2)")).toThrow(/Invalid geom format/);
  });

  it("throws on non-numeric coords", () => {
    expect(() => parseGeom("POINT(abc 59.88)")).toThrow(/Invalid geom format/);
  });

  it("throws on empty string", () => {
    expect(() => parseGeom("")).toThrow(/Invalid geom format/);
  });

  it("accepts negative coordinates (general correctness)", () => {
    expect(parseGeom("POINT(-30.42 -59.88)")).toEqual({ lng: -30.42, lat: -59.88 });
  });
});

describe("formatSchedule", () => {
  it("returns 'Не указано' for empty schedule", () => {
    expect(formatSchedule([])).toBe("Не указано");
  });

  it("formats single day", () => {
    const s: RSBorScheduleDay[] = [{ dow: 0, opens: ["10:00"], closes: ["19:00"] }];
    expect(formatSchedule(s)).toBe("Пн 10:00–19:00");
  });

  it("groups consecutive days with same hours", () => {
    const s: RSBorScheduleDay[] = [
      { dow: 0, opens: ["10:00"], closes: ["19:00"] },
      { dow: 1, opens: ["10:00"], closes: ["19:00"] },
      { dow: 2, opens: ["10:00"], closes: ["19:00"] },
      { dow: 3, opens: ["10:00"], closes: ["19:00"] },
      { dow: 4, opens: ["10:00"], closes: ["15:00"] },
    ];
    expect(formatSchedule(s)).toBe("Пн–Чт 10:00–19:00, Пт 10:00–15:00");
  });

  it("handles multiple intervals per day", () => {
    const s: RSBorScheduleDay[] = [
      { dow: 0, opens: ["10:00", "14:00"], closes: ["13:00", "19:00"] },
    ];
    expect(formatSchedule(s)).toBe("Пн 10:00–13:00, 14:00–19:00");
  });
});

describe("isSpbAddress", () => {
  it("matches canonical format", () => {
    expect(isSpbAddress("Россия, Санкт-Петербург, улица Швецова, 41")).toBe(true);
  });

  it("matches case-insensitive", () => {
    expect(isSpbAddress("санкт-петербург, невский, 1")).toBe(true);
  });

  it("rejects Leningrad oblast", () => {
    expect(isSpbAddress("Ленинградская область, Всеволожск, ул. Ленина")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isSpbAddress("")).toBe(false);
  });
});
