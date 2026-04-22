import { Resend } from "resend";

export type ImportStats = {
  started_at: string; // ISO
  duration_ms: number;
  created: number;
  updated: number;
  skipped_manual: number;
  unchanged: number;
  errors: { pointId: number; reason: string }[];
};

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM = "RecycleMap <onboarding@resend.dev>";
const ADMIN_URL = "https://bbaosmjuhscbpji6n847.containers.yandexcloud.net/admin";

function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  return `${Math.floor(sec / 60)} мин ${sec % 60} сек`;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;",
  );
}

export function renderReportHtml(stats: ImportStats): string {
  const errorsBlock =
    stats.errors.length === 0
      ? `<p style="color:#2e7d32;">✓ Без ошибок</p>`
      : `<ul>${stats.errors
          .map((e) => `<li>pointId ${e.pointId} — ${esc(e.reason)}</li>`)
          .join("")}</ul>`;

  return `<!doctype html>
<html lang="ru"><body style="font-family:system-ui,sans-serif;max-width:640px;margin:auto;">
<h2>RecycleMap — еженедельный импорт</h2>
<p>${new Date(stats.started_at).toLocaleString("ru-RU")}<br>
Длительность: ${formatDuration(stats.duration_ms)}</p>
<table style="border-collapse:collapse;">
<tr><td>Новых точек:</td><td><b>${stats.created}</b></td></tr>
<tr><td>Обновлено:</td><td><b>${stats.updated}</b></td></tr>
<tr><td>Пропущено (ручные):</td><td><b>${stats.skipped_manual}</b></td></tr>
<tr><td>Без изменений:</td><td>${stats.unchanged}</td></tr>
<tr><td>Ошибки:</td><td><b>${stats.errors.length}</b></td></tr>
</table>
<h3>Ошибки</h3>
${errorsBlock}
<p><a href="${ADMIN_URL}/points" style="display:inline-block;padding:8px 16px;background:#2e7d32;color:#fff;text-decoration:none;border-radius:4px;">Открыть админку</a></p>
</body></html>`;
}

export async function sendImportReport(stats: ImportStats): Promise<void> {
  if (!resend) {
    console.warn("RESEND_API_KEY not set — skipping email");
    return;
  }
  const to = (process.env.IMPORT_REPORT_TO ?? "").split(",").filter(Boolean);
  if (to.length === 0) {
    console.warn("IMPORT_REPORT_TO not set — skipping email");
    return;
  }
  await resend.emails.send({
    from: FROM,
    to,
    subject: `RecycleMap импорт: +${stats.created} новых, ${stats.updated} изменений`,
    html: renderReportHtml(stats),
  });
}

export async function sendImportFailure(error: Error): Promise<void> {
  if (!resend) return;
  const to = (process.env.IMPORT_REPORT_TO ?? "").split(",").filter(Boolean);
  if (to.length === 0) return;
  await resend.emails.send({
    from: FROM,
    to,
    subject: "❌ RecycleMap импорт упал",
    html: `<pre style="background:#fee;padding:16px;">${esc(error.stack ?? error.message)}</pre>`,
  });
}
