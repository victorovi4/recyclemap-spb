import { describe, it, expect } from "vitest";
import { buildBeadHtml } from "./beadMarker";

describe("buildBeadHtml", () => {
  it("3 цвета — 3 span'а без хвоста", () => {
    const html = buildBeadHtml(["#aabbcc", "#112233", "#ffeedd"]);
    expect(html).toBe(
      `<div class="bead-marker"><span style="background:#aabbcc"></span><span style="background:#112233"></span><span style="background:#ffeedd"></span></div>`,
    );
  });

  it("8 цветов — первые 5 + хвост +3", () => {
    const html = buildBeadHtml(
      ["#1", "#2", "#3", "#4", "#5", "#6", "#7", "#8"].map((c) => `#${c.replace("#", "").padStart(6, "0")}`),
    );
    const spans = html.match(/<span style="background:/g) ?? [];
    expect(spans).toHaveLength(5);
    expect(html).toContain(`<span class="more">+3</span>`);
  });

  it("0 цветов — пустой div", () => {
    expect(buildBeadHtml([])).toBe(`<div class="bead-marker"></div>`);
  });

  it("отбрасывает невалидный цвет (XSS-инъекция в style)", () => {
    const html = buildBeadHtml([
      "#aabbcc",
      'red; background-image: url("/evil")',
      "#112233",
    ]);
    expect(html).toContain(`style="background:#aabbcc"`);
    expect(html).toContain(`style="background:#112233"`);
    expect(html).not.toContain("evil");
    expect(html).not.toContain("background-image");
  });
});
