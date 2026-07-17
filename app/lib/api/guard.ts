import { NextRequest, NextResponse } from "next/server";

const buckets = new Map<string, { count: number; resetAt: number }>();

export function apiError(message: string, status: number, code: string) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}

export function clientAddress(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}

export function enforceRateLimit(request: NextRequest, namespace: string, limit: number, windowMs: number) {
  const key = `${namespace}:${clientAddress(request)}`;
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  bucket.count += 1;
  if (bucket.count <= limit) return null;
  return NextResponse.json(
    { ok: false, error: { code: "RATE_LIMITED", message: "Trop de requêtes. Réessayez dans quelques instants." } },
    { status: 429, headers: { "Retry-After": String(Math.ceil((bucket.resetAt - now) / 1000)), "Cache-Control": "no-store" } }
  );
}
