import { describe, it, expect } from "vitest";
import {
  fractionsParser,
  llParser,
  zoomParser,
  sanitizeFractions,
  pointParser,
} from "./url-state";

describe("fractionsParser", () => {
  it("parses comma-separated list", () => {
    expect(fractionsParser.parse("plastic,glass,paper")).toEqual([
      "plastic", "glass", "paper",
    ]);
  });

  it("parses empty string as empty array", () => {
    expect(fractionsParser.parse("")).toEqual([]);
  });

  it("serializes array to comma-separated string", () => {
    expect(fractionsParser.serialize(["plastic", "glass"])).toBe(
      "plastic,glass",
    );
  });
});

describe("sanitizeFractions", () => {
  it("returns null for null input", () => {
    expect(sanitizeFractions(null)).toBeNull();
  });

  it("filters out unknown ids", () => {
    expect(sanitizeFractions(["plastic", "evil-id", "glass"])).toEqual([
      "plastic", "glass",
    ]);
  });

  it("returns empty array as-is", () => {
    expect(sanitizeFractions([])).toEqual([]);
  });

  it("keeps all 13 known ids", () => {
    const all = [
      "plastic", "glass", "paper", "metal", "batteries", "electronics",
      "tetrapak", "textile", "lamps", "caps", "tires", "hazardous", "other",
    ];
    expect(sanitizeFractions(all)).toEqual(all);
  });
});

describe("llParser", () => {
  it("parses 'lat,lng' to tuple", () => {
    expect(llParser.parse("59.94,30.31")).toEqual([59.94, 30.31]);
  });

  it("returns null for malformed input", () => {
    expect(llParser.parse("garbage")).toBeNull();
    expect(llParser.parse("59.94")).toBeNull();
    expect(llParser.parse("59.94,30.31,extra")).toBeNull();
  });

  it("returns null for non-numeric parts", () => {
    expect(llParser.parse("abc,30.31")).toBeNull();
    expect(llParser.parse("59.94,xyz")).toBeNull();
  });

  it("returns null for out-of-range latitude", () => {
    expect(llParser.parse("99,30.31")).toBeNull();
    expect(llParser.parse("-99,30.31")).toBeNull();
  });

  it("returns null for out-of-range longitude", () => {
    expect(llParser.parse("59.94,200")).toBeNull();
    expect(llParser.parse("59.94,-200")).toBeNull();
  });

  it("serializes tuple to 4-decimal string", () => {
    expect(llParser.serialize([59.93861234, 30.31412345])).toBe(
      "59.9386,30.3141",
    );
  });
});

describe("zoomParser", () => {
  it("parses integer in range", () => {
    expect(zoomParser.parse("11")).toBe(11);
    expect(zoomParser.parse("8")).toBe(8);
    expect(zoomParser.parse("18")).toBe(18);
  });

  it("returns null for out-of-range zoom", () => {
    expect(zoomParser.parse("7")).toBeNull();
    expect(zoomParser.parse("19")).toBeNull();
    expect(zoomParser.parse("0")).toBeNull();
  });

  it("returns null for non-integer", () => {
    expect(zoomParser.parse("abc")).toBeNull();
  });

  it("serializes integer to string", () => {
    expect(zoomParser.serialize(11)).toBe("11");
  });
});

describe("pointParser", () => {
  it("parses string id", () => {
    expect(pointParser.parse("rsbor-1234")).toBe("rsbor-1234");
  });
  it("parses any non-empty string", () => {
    expect(pointParser.parse("manual-foo-59.9")).toBe("manual-foo-59.9");
  });
});
