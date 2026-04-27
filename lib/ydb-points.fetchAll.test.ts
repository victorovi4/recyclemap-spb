import { describe, it, expect, vi, beforeEach } from "vitest";

// Мокаем getDriver — мы тестируем чистую сборку из YDB-rows в PublicPoint[].
const executeQuery = vi.fn();
vi.mock("./ydb", () => ({
  getDriver: async () => ({
    tableClient: {
      withSession: async (cb: (s: unknown) => Promise<unknown>) =>
        cb({ executeQuery }),
    },
  }),
  TypedValues: {},
}));

import { fetchAllPoints } from "./ydb-points";

beforeEach(() => {
  executeQuery.mockReset();
});

describe("fetchAllPoints", () => {
  it("сводит points + point_categories в PublicPoint[] и формирует photoUrl", async () => {
    // Первый вызов — points; второй — point_categories.
    executeQuery
      .mockResolvedValueOnce({
        resultSets: [
          {
            rows: [
              {
                items: [
                  { textValue: "rsbor-1" },                    // id
                  { textValue: "Экоцентр" },                   // name
                  { textValue: "СПб, ул. Тестовая, 1" },       // address
                  { doubleValue: 59.94 },                      // lat
                  { doubleValue: 30.31 },                      // lng
                  { textValue: "Описание" },                   // description
                  { textValue: "Пн-Пт 10-19" },                // hours
                  { textValue: null },                         // phone
                  { textValue: "https://example.org" },        // website
                  { textValue: "258_20161004-124814_1.jpg" },  // photo_url
                ],
              },
              {
                items: [
                  { textValue: "manual-x" },
                  { textValue: "Локальная" },
                  { textValue: "СПб, ул. Местная, 2" },
                  { doubleValue: 59.95 },
                  { doubleValue: 30.32 },
                  { textValue: null },
                  { textValue: null },
                  { textValue: null },
                  { textValue: null },
                  { textValue: null },
                ],
              },
            ],
          },
        ],
      })
      .mockResolvedValueOnce({
        resultSets: [
          {
            rows: [
              { items: [{ textValue: "rsbor-1" }, { textValue: "paper" }] },
              { items: [{ textValue: "rsbor-1" }, { textValue: "plastic" }] },
              { items: [{ textValue: "manual-x" }, { textValue: "glass" }] },
            ],
          },
        ],
      });

    const result = await fetchAllPoints();

    expect(result).toHaveLength(2);

    const rsbor = result.find((p) => p.id === "rsbor-1")!;
    expect(rsbor.name).toBe("Экоцентр");
    expect(rsbor.lat).toBe(59.94);
    expect(rsbor.categoryIds.sort()).toEqual(["paper", "plastic"]);
    expect(rsbor.photoUrl).toBe("https://recyclemap.ru/images/258_20161004-124814_1.jpg");
    expect(rsbor.phone).toBeNull();

    const manual = result.find((p) => p.id === "manual-x")!;
    expect(manual.categoryIds).toEqual(["glass"]);
    expect(manual.photoUrl).toBeNull();
  });

  it("возвращает пустой массив, если в points нет строк", async () => {
    executeQuery
      .mockResolvedValueOnce({ resultSets: [{ rows: [] }] })
      .mockResolvedValueOnce({ resultSets: [{ rows: [] }] });
    expect(await fetchAllPoints()).toEqual([]);
  });
});
