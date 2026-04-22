import { describe, it, expect } from "vitest";
import { parseGeom } from "./transform";

describe("parseGeom", () => {
  it("extracts lng and lat from WKT POINT", () => {
    expect(parseGeom("POINT(30.420172 59.879528)")).toEqual({
      lng: 30.420172,
      lat: 59.879528,
    });
  });
});
