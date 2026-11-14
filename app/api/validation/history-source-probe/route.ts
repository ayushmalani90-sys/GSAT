import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function GET() {
  if (process.env.VERCEL_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const response = await fetch("https://evtradelabs.com/data", {
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0 GSAT historical-source validation" },
      signal: AbortSignal.timeout(12_000),
    });
    const html = await response.text();
    const links = [...html.matchAll(/(?:href|src)=["']([^"']+)["']/gi)]
      .map((match) => match[1])
      .filter((value) => /xauusd|xagusd|\.json\.gz|download|data/i.test(value))
      .slice(0, 100);
    const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)]
      .map((match) => match[1])
      .slice(0, 30);
    const textMatches = html.match(/.{0,120}(?:XAUUSD|XAGUSD|\.json\.gz|download|catalog).{0,180}/gi) ?? [];
    return NextResponse.json({
      status: response.status,
      contentType: response.headers.get("content-type"),
      bytes: html.length,
      title: html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1] ?? null,
      relevantLinks: [...new Set(links)],
      scripts,
      snippets: textMatches.slice(0, 30),
      note: "Preview-only discovery. No market data is imported or mixed into GSAT.",
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "EV Trading Labs source probe failed",
    }, { status: 502, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}
