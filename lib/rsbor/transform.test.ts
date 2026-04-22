import { describe, it, expect } from "vitest";
import { parseGeom } from "./transform";

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
