import { fetchFractions, fetchPointsPage, fetchPointDetails } from "../rsbor/api";
import type { RSBorPointDetails } from "../rsbor/types";
import { formatSchedule, isSpbAddress, isSpbBbox, parseGeom } from "../rsbor/transform";
import type { CategoryId } from "../types";
import {
  fetchRsborIdMap,
  findBySource,
  insertPoint,
  pointsEqual,
  updatePoint,
  type PointRow,
} from "../ydb-points";
import { sendImportFailure, sendImportReport, type ImportStats } from "../email";

const BBOX_SPB = "29.0,59.5,31.0,60.3";
const PAGE_SIZE = 100;
const DETAIL_THROTTLE_MS = 200; // 5 req/sec

export function transformDetailsToPoint(
  d: RSBorPointDetails,
  rsborIdMap: Map<number, CategoryId>,
): PointRow {
  const { lat, lng } = parseGeom(d.geom);
  const categoryIds: CategoryId[] = [];
  for (const f of d.fractions) {
    const ours = rsborIdMap.get(f.id);
    if (ours) categoryIds.push(ours);
    else console.warn(`[import] unknown fraction id=${f.id} (${f.name}) on point ${d.pointId}`);
  }

  return {
    id: `rsbor-${d.pointId}`,
    name: d.title || "Пункт приёма",
    address: d.address,
    lat,
    lng,
    description: d.pointDescription || null,
    hours: formatSchedule(d.schedule),
    schedule_json: JSON.stringify(d.schedule),
    phone: d.operator?.phones[0] ?? null,
    website: d.operator?.sites[0] ?? null,
    photo_url: d.photos[0]?.path ?? null,
    status: "active",
    source: "rsbor",
    source_id: String(d.pointId),
    categoryIds,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function runImport(): Promise<ImportStats> {
  const startedAt = Date.now();
  const stats: ImportStats = {
    started_at: new Date(startedAt).toISOString(),
    duration_ms: 0,
    created: 0,
    updated: 0,
    skipped_manual: 0,
    unchanged: 0,
    errors: [],
  };

  try {
    console.log("[import] fetching fractions and categories map…");
    const [fractions, rsborIdMap] = await Promise.all([fetchFractions(), fetchRsborIdMap()]);
    console.log(`[import] fractions=${fractions.length}, categories mapped=${rsborIdMap.size}`);

    console.log("[import] paginating points list…");
    const seenIds = new Set<number>();
    const allItems: { pointId: number; address: string; lat: number; lng: number }[] = [];
    let totalExpected = 0;
    const MAX_PAGES = 200; // safety net
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await fetchPointsPage({ bbox: BBOX_SPB, page, size: PAGE_SIZE });
      if (page === 0) totalExpected = res.totalResults;
      if (res.points.length === 0) break;
      let newThisPage = 0;
      for (const p of res.points) {
        if (seenIds.has(p.pointId)) continue; // API бывает возвращает дубликаты после фактического конца
        seenIds.add(p.pointId);
        const { lat, lng } = parseGeom(p.geom);
        allItems.push({ pointId: p.pointId, address: p.address, lat, lng });
        newThisPage++;
      }
      console.log(
        `[import]   page=${page} cumulative=${allItems.length} new=${newThisPage} (expected total=${totalExpected})`,
      );
      // Страница не добавила ничего нового (API зациклился) — выходим.
      if (newThisPage === 0) {
        console.log(`[import] page=${page} returned only duplicates, stopping pagination`);
        break;
      }
      // Достигли или превысили заявленный totalResults — выходим.
      if (totalExpected > 0 && allItems.length >= totalExpected) {
        console.log(`[import] reached totalResults=${totalExpected}, stopping pagination`);
        break;
      }
    }
    console.log(`[import] total list=${allItems.length} (expected ${totalExpected})`);

    const spbItems = allItems.filter(
      (p) => isSpbAddress(p.address) || (p.address === "" && isSpbBbox(p.lat, p.lng)),
    );
    console.log(`[import] after SPb filter=${spbItems.length}`);

    for (let i = 0; i < spbItems.length; i++) {
      const { pointId } = spbItems[i];
      if (i > 0) await sleep(DETAIL_THROTTLE_MS);
      try {
        const details = await fetchPointDetails(pointId);
        const row = transformDetailsToPoint(details, rsborIdMap);
        const existing = await findBySource(row.source, row.source_id ?? "");

        if (!existing) {
          await insertPoint(row);
          stats.created++;
        } else if (existing.manually_edited) {
          stats.skipped_manual++;
        } else if (pointsEqual(row, existing.data)) {
          stats.unchanged++;
        } else {
          await updatePoint(row);
          stats.updated++;
        }

        if ((i + 1) % 100 === 0) {
          console.log(
            `[import] progress ${i + 1}/${spbItems.length} (created=${stats.created}, updated=${stats.updated}, unchanged=${stats.unchanged})`,
          );
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error(`[import] pointId=${pointId} failed: ${reason}`);
        stats.errors.push({ pointId, reason });
      }
    }

    stats.duration_ms = Date.now() - startedAt;
    console.log(`[import] done in ${stats.duration_ms}ms`, stats);

    await sendImportReport(stats);
    return stats;
  } catch (err) {
    stats.duration_ms = Date.now() - startedAt;
    const e = err instanceof Error ? err : new Error(String(err));
    console.error(`[import] FATAL`, e);
    await sendImportFailure(e);
    throw e;
  }
}
