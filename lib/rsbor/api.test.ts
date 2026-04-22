import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchFractions, fetchPointsPage, fetchPointDetails } from "./api";

describe("RSBor API client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetchFractions returns data array", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ isSuccess: true, data: [{ id: 1, name: "BUMAGA" }] }),
    });

    const result = await fetchFractions();
    expect(result).toEqual([{ id: 1, name: "BUMAGA" }]);
    expect(fetch).toHaveBeenCalledWith(
      "https://recyclemap.ru/api/public/fractions",
      expect.objectContaining({
        headers: expect.objectContaining({ "User-Agent": expect.stringContaining("RecycleMapSPb") }),
      }),
    );
  });

  it("fetchPointsPage passes bbox and size params", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ isSuccess: true, data: { totalResults: 0, points: [] } }),
    });

    await fetchPointsPage({ bbox: "29,59,31,60", page: 0, size: 100 });
    const calledUrl = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain("bbox=29%2C59%2C31%2C60");
    expect(calledUrl).toContain("page=0");
    expect(calledUrl).toContain("size=100");
  });

  it("fetchPointDetails retries on 5xx", async () => {
    const m = fetch as unknown as ReturnType<typeof vi.fn>;
    m.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) });
    m.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) });
    m.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ isSuccess: true, data: { pointId: 3, title: "x" } }),
    });

    const result = await fetchPointDetails(3, { backoffMs: () => 0 });
    expect(result.pointId).toBe(3);
    expect(m).toHaveBeenCalledTimes(3);
  });

  it("fetchPointDetails throws after 3 failed attempts", async () => {
    const m = fetch as unknown as ReturnType<typeof vi.fn>;
    m.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

    await expect(fetchPointDetails(3, { backoffMs: () => 0 })).rejects.toThrow(
      /500.*after 3 attempts/,
    );
    expect(m).toHaveBeenCalledTimes(3);
  });
});
