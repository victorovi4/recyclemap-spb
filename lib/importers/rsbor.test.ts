import { describe, it, expect } from "vitest";
import { transformDetailsToPoint } from "./rsbor";
import type { RSBorPointDetails } from "../rsbor/types";

const detailsFixture: RSBorPointDetails = {
  geom: "POINT(30.420172 59.879528)",
  pointId: 3,
  pointType: "RC",
  address: "Россия, Санкт-Петербург, Варфоломеевская улица, 18Д",
  addressDescription: "",
  pointDescription: "Любой металл",
  precise: true,
  restricted: false,
  title: "Пункт приёма",
  scheduleDescription: null,
  fractions: [{ id: 4, name: "METALL", type: "RC", color: "#E83623", icon: "metall.svg" }],
  photos: [{ photo_id: 4, order: 1, path: "258_123.jpg", thumb: null }],
  rating: { likes: 0, dislikes: 0, score: 0 },
  businesHoursState: { state: "open", nextStateTime: "", expired: false },
  numberOfComments: 0,
  schedule: [{ dow: 0, opens: ["10:00"], closes: ["19:00"] }],
  validDates: [],
  operator: {
    operatorId: 3,
    title: "Метал-проект",
    address: "Варфоломеевская ул., 18",
    phones: ["88123208340", "89219609111"],
    emails: [],
    sites: ["https://metall-lom.ru"],
  },
  partner: null,
  lastUpdate: "2025-08-05",
  moderators: [],
  comments: [],
};

describe("transformDetailsToPoint", () => {
  const rsborMap = new Map([[4, "metal" as const]]);

  it("maps basic fields", () => {
    const p = transformDetailsToPoint(detailsFixture, rsborMap);
    expect(p.id).toBe("rsbor-3");
    expect(p.name).toBe("Пункт приёма");
    expect(p.address).toBe("Россия, Санкт-Петербург, Варфоломеевская улица, 18Д");
    expect(p.lat).toBeCloseTo(59.879528);
    expect(p.lng).toBeCloseTo(30.420172);
    expect(p.description).toBe("Любой металл");
  });

  it("picks first phone and website from operator", () => {
    const p = transformDetailsToPoint(detailsFixture, rsborMap);
    expect(p.phone).toBe("88123208340");
    expect(p.website).toBe("https://metall-lom.ru");
  });

  it("formats schedule and stores raw JSON", () => {
    const p = transformDetailsToPoint(detailsFixture, rsborMap);
    expect(p.hours).toBe("Пн 10:00–19:00");
    expect(p.schedule_json).toContain('"dow":0');
  });

  it("maps fraction.id to our category id", () => {
    const p = transformDetailsToPoint(detailsFixture, rsborMap);
    expect(p.categoryIds).toEqual(["metal"]);
  });

  it("handles null operator", () => {
    const p = transformDetailsToPoint({ ...detailsFixture, operator: null }, rsborMap);
    expect(p.phone).toBeNull();
    expect(p.website).toBeNull();
  });

  it("handles empty photos", () => {
    const p = transformDetailsToPoint({ ...detailsFixture, photos: [] }, rsborMap);
    expect(p.photo_url).toBeNull();
  });

  it("skips unknown fraction ids with warning", () => {
    const p = transformDetailsToPoint(
      { ...detailsFixture, fractions: [{ id: 999, name: "UNKNOWN", type: "RC", color: "#000", icon: "x.svg" }] },
      rsborMap,
    );
    expect(p.categoryIds).toEqual([]);
  });
});
