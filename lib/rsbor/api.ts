import type {
  RSBorApiResponse,
  RSBorFraction,
  RSBorPointDetails,
  RSBorPointsListResponse,
} from "./types";

const BASE_URL = "https://recyclemap.ru/api/public";
const USER_AGENT = "RecycleMapSPb-Importer/1.0 (+https://github.com/victorovi4/recyclemap-spb)";
const DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent": USER_AGENT,
  Accept: "application/json",
};

type RetryOpts = {
  maxAttempts?: number;
  backoffMs?: (attempt: number) => number;
};

const DEFAULT_RETRY: Required<RetryOpts> = {
  maxAttempts: 3,
  backoffMs: (attempt) => Math.pow(2, attempt) * 1000, // 1s, 2s, 4s
};

async function fetchJson<T>(url: string, retry: RetryOpts = {}): Promise<T> {
  const { maxAttempts, backoffMs } = { ...DEFAULT_RETRY, ...retry };
  let lastErr: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, backoffMs(attempt)));
    }
    try {
      const res = await fetch(url, { headers: DEFAULT_HEADERS });
      if (res.ok) {
        const body = (await res.json()) as RSBorApiResponse<T>;
        if (!body.isSuccess) {
          throw new Error(`API error: ${body.errors.message}`);
        }
        return body.data;
      }
      // 4xx — не ретраим кроме 429
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        throw new Error(`HTTP ${res.status} (non-retryable)`);
      }
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
  }

  throw new Error(`${lastErr instanceof Error ? lastErr.message : String(lastErr)} after ${maxAttempts} attempts`);
}

export function fetchFractions(retry?: RetryOpts): Promise<RSBorFraction[]> {
  return fetchJson<RSBorFraction[]>(`${BASE_URL}/fractions`, retry);
}

export function fetchPointsPage(
  params: { bbox: string; page: number; size: number },
  retry?: RetryOpts,
): Promise<RSBorPointsListResponse> {
  const qs = new URLSearchParams({
    bbox: params.bbox,
    page: String(params.page),
    size: String(params.size),
  });
  return fetchJson<RSBorPointsListResponse>(`${BASE_URL}/points?${qs}`, retry);
}

export function fetchPointDetails(
  pointId: number,
  retry?: RetryOpts,
): Promise<RSBorPointDetails> {
  return fetchJson<RSBorPointDetails>(`${BASE_URL}/points/${pointId}`, retry);
}
