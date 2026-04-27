import { describe, it, expect, vi, beforeEach } from "vitest";

const executeQuery = vi.fn();
vi.mock("./ydb", () => ({
  getDriver: async () => ({
    tableClient: {
      withSession: async (cb: (s: unknown) => Promise<unknown>) =>
        cb({ executeQuery }),
    },
  }),
}));

import { fetchAllCategories } from "./categories";

beforeEach(() => executeQuery.mockReset());

describe("fetchAllCategories", () => {
  it("преобразует YDB-rows в PublicCategory[], сохраняет порядок sort_order", async () => {
    executeQuery.mockResolvedValueOnce({
      resultSets: [
        {
          rows: [
            {
              items: [
                { textValue: "paper" },
                { textValue: "Бумага и картон" },
                { textValue: "#4085F3" },
                { textValue: "📄" },
                { textValue: "/icons/fractions/paper.svg" },
                { int32Value: 1 },
              ],
            },
            {
              items: [
                { textValue: "plastic" },
                { textValue: "Пластик" },
                { textValue: "#ED671C" },
                { textValue: "🧴" },
                { textValue: null },
                { int32Value: 2 },
              ],
            },
          ],
        },
      ],
    });

    const result = await fetchAllCategories();

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: "paper",
      label: "Бумага и картон",
      color: "#4085F3",
      emoji: "📄",
      iconPath: "/icons/fractions/paper.svg",
      sortOrder: 1,
    });
    expect(result[1].iconPath).toBeNull();
  });
});
