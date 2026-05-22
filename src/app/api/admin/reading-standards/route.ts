import { NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { timingSafeEqual } from "crypto";

const CONFIG_PATH = join(process.cwd(), "config", "reading-standards.json");

// Basic auth check via ADMIN_SECRET header
function authorize(request: Request): boolean {
  const secret = request.headers.get("x-admin-secret");
  const expected = process.env.ADMIN_SECRET;
  if (!expected || expected.length === 0) return false;
  if (!secret) return false;
  try {
    return timingSafeEqual(Buffer.from(secret), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const content = await readFile(CONFIG_PATH, "utf-8");
    const data = JSON.parse(content);
    return NextResponse.json(data);
  } catch (err) {
    console.error("Failed to read reading-standards.json:", err);
    return NextResponse.json({ error: "Failed to read config" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    // Validate structure
    if (!body.english || !body.chinese) {
      return NextResponse.json({ error: "Invalid structure: english and chinese required" }, { status: 400 });
    }

    // Validate english grades 1-8
    for (const grade of ["1", "2", "3", "4", "5", "6", "7", "8"]) {
      const std = body.english[grade];
      if (!std || typeof std.wordCountMin !== "number" || typeof std.wordCountMax !== "number" || typeof std.wpm !== "number") {
        return NextResponse.json({ error: `Invalid english grade ${grade}` }, { status: 400 });
      }
    }

    // Validate chinese grades 1-8
    for (const grade of ["1", "2", "3", "4", "5", "6", "7", "8"]) {
      const std = body.chinese[grade];
      if (!std || typeof std.charCountMin !== "number" || typeof std.charCountMax !== "number" || typeof std.wpm !== "number") {
        return NextResponse.json({ error: `Invalid chinese grade ${grade}` }, { status: 400 });
      }
    }

    // Update lastUpdated
    body._meta = body._meta || {};
    body._meta.lastUpdated = new Date().toISOString().split("T")[0];
    body._meta.version = (parseFloat(body._meta.version || "1.0") + 0.1).toFixed(1);

    await writeFile(CONFIG_PATH, JSON.stringify(body, null, 2), "utf-8");

    return NextResponse.json({ success: true, data: body });
  } catch (err) {
    console.error("Failed to write reading-standards.json:", err);
    return NextResponse.json({ error: "Failed to write config" }, { status: 500 });
  }
}