import { NextResponse } from "next/server";

type Entry = {
  count: number;
  resetAt: number;
};

const store = new Map<string, Entry>();

export function rateLimit(
  identifier: string,
  maxRequests: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const entry = store.get(identifier);

  if (!entry || now > entry.resetAt) {
    store.set(identifier, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= maxRequests) {
    return false;
  }

  entry.count += 1;
  return true;
}

export function checkRateLimit(
  request: Request,
  maxRequests = 30,
  windowMs = 60_000
): Response | null {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "anonymous";

  if (!rateLimit(ip, maxRequests, windowMs)) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429 }
    );
  }

  return null;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now > entry.resetAt) {
      store.delete(key);
    }
  }
}, 60_000);
