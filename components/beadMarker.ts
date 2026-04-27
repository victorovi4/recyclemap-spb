const HEX_COLOR = /^#[0-9a-fA-F]{3,8}$/;

function isValidColor(c: string): boolean {
  return HEX_COLOR.test(c);
}

export function buildBeadHtml(colors: string[], maxBeads = 5): string {
  const valid = colors.filter(isValidColor);
  const visible = valid.slice(0, maxBeads);
  const overflow = valid.length - visible.length;
  const beads = visible
    .map((c) => `<span style="background:${c}"></span>`)
    .join("");
  const more = overflow > 0 ? `<span class="more">+${overflow}</span>` : "";
  return `<div class="bead-marker">${beads}${more}</div>`;
}
