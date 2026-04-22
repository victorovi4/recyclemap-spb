import { describe, it, expect } from "vitest";
import { renderReportHtml, type ImportStats } from "./email";

const baseStats: ImportStats = {
  started_at: "2026-04-26T03:00:00.000Z",
  duration_ms: 872_000,
  created: 12,
  updated: 47,
  skipped_manual: 3,
  unchanged: 4428,
  errors: [
    { pointId: 4521, reason: "HTTP 500 after 3 attempts" },
    { pointId: 5113, reason: "Invalid JSON in details" },
  ],
};

describe("renderReportHtml", () => {
  it("contains all stat values", () => {
    const html = renderReportHtml(baseStats);
    expect(html).toContain("12"); // created
    expect(html).toContain("47"); // updated
    expect(html).toContain("4428"); // unchanged
    expect(html).toContain("pointId 4521");
  });

  it("formats duration as minutes/seconds", () => {
    const html = renderReportHtml(baseStats);
    expect(html).toMatch(/14 мин\s+32 сек/);
  });

  it("shows '✓ Без ошибок' when errors empty", () => {
    const html = renderReportHtml({ ...baseStats, errors: [] });
    expect(html).toContain("Без ошибок");
  });
});
