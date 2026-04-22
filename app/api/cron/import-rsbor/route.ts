import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runImport } from "@/lib/importers/rsbor";

// Max duration 15 minutes (Vercel-совместимый синтаксис; YC Container почитает
// revision-execution-timeout из deploy.yml, см. Task 12).
export const maxDuration = 900;
export const dynamic = "force-dynamic";

function authOk(req: Request): boolean {
  const expected = process.env.IMPORT_SECRET;
  if (!expected) return false;
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(bearer);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  if (!authOk(req)) {
    return new NextResponse(null, { status: 401 });
  }

  try {
    const stats = await runImport();
    return NextResponse.json({ ok: true, stats });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  // Disallow GET to prevent accidental triggers through browser / link preview.
  return new NextResponse(null, { status: 405 });
}
