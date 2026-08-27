"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Quote = {
  symbol: string;
  label: string;
  price: number;
  changePercent: number | null;
  currency?: string;
  provider?: string;
  marketState?: string;
  providerUpdatedAt?: string | null;
};

type QuoteResponse = {
  quotes: Quote[];
  updatedAt: string;
  spotSource?: string;
  macroSource?: string;
  spotState?: unknown;
  spotError?: string | null;
};

const labels = ["Gold", "Silver", "DXY", "USD/INR", "Brent", "VIX"] as const;

const money = (value: number) =>
  Number.isFinite(value)
    ? value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "--";

function statusFromQuotes(quotes: Quote[]) {
  const gold = quotes.find((q) => q.label === "Gold");
  const silver = quotes.find((q) => q.label === "Silver");
  const timestamps = [gold?.providerUpdatedAt, silver?.providerUpdatedAt]
    .filter(Boolean)
    .map((value) => Date.parse(value as string));
  const latest = timestamps.length ? Math.max(...timestamps) : NaN;
  if (!Number.isFinite(latest)) return { label: "DATA STATUS UNKNOWN", detail: "Waiting for provider timestamp" };
  const ageSeconds = Math.max(0, Date.now() - latest) / 1000;
  if (ageSeconds <= 90) return { label: "SPOT DATA FRESH", detail: `Updated ${Math.round(ageSeconds)}s ago` };
  return { label: "SPOT DATA STALE", detail: `Last update ${Math.round(ageSeconds / 60)}m ago` };
}

export default function Home() {
  const [data, setData] = useState<QuoteResponse>({ quotes: [], updatedAt: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadQuotes = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const response = await fetch("/api/quotes", { cache: "no-store" });
      if (!response.ok) throw new Error("Live quote request failed");
      setData(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Live data unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQuotes();
    const timer = window.setInterval(() => void loadQuotes(), 60_000);
    return () => window.clearInterval(timer);
  }, [loadQuotes]);

  const spotStatus = useMemo(() => statusFromQuotes(data.quotes), [data.quotes]);

  return (
    <main className="min-h-screen bg-[#070707] px-4 py-5 text-zinc-100 md:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <header className="rounded-2xl border border-zinc-800 bg-[#0d0d0d] p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-bold tracking-[0.32em] text-amber-300">GSAT</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">Gold & Silver War Room</h1>
              <p className="mt-2 text-sm text-zinc-500">Spot metals + macro watchlist • 60-second refresh</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-zinc-800 bg-black/30 px-3 py-2 text-xs text-zinc-400">{spotStatus.label}</span>
              <span className="rounded-full border border-zinc-800 bg-black/30 px-3 py-2 text-xs text-zinc-500">{spotStatus.detail}</span>
              <button onClick={() => void loadQuotes()} className="rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-2 text-sm font-medium text-amber-200 hover:bg-amber-300/15">{loading ? "Refreshing…" : "Refresh"}</button>
            </div>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {labels.map((label) => {
            const quote = data.quotes.find((q) => q.label === label);
            const positive = (quote?.changePercent ?? 0) >= 0;
            const provider = quote?.provider ?? (label === "Gold" || label === "Silver" ? "Spot provider" : "Yahoo Finance");
            return (
              <article key={label} className="rounded-2xl border border-zinc-800 bg-[#0d0d0d] p-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold tracking-[0.2em] text-zinc-500">{label}</p>
                  <span className="text-[10px] tracking-[0.16em] text-zinc-700">{quote ? "DATA" : "WAITING"}</span>
                </div>
                <p className="mt-4 font-mono text-3xl font-semibold">{quote ? money(quote.price) : "--"}</p>
                <p className={`mt-2 text-xs font-mono ${positive ? "text-emerald-400" : "text-red-400"}`}>
                  {quote?.changePercent == null ? "Change unavailable" : `${positive ? "+" : ""}${quote.changePercent.toFixed(2)}%`}
                </p>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-zinc-700">{provider}</span>
                  <span className="text-zinc-600">{quote?.providerUpdatedAt ? new Date(quote.providerUpdatedAt).toLocaleTimeString("en-IN") : "--"}</span>
                </div>
              </article>
            );
          })}
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.4fr_0.8fr]">
          <article className="rounded-2xl border border-zinc-800 bg-[#0d0d0d] p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold tracking-[0.2em] text-zinc-500">CHART</p>
                <h2 className="mt-1 text-lg font-semibold">Spot Gold / Silver</h2>
              </div>
              <span className="text-xs text-zinc-600">Live chart next</span>
            </div>
            <div className="mt-4 flex min-h-[360px] items-center justify-center rounded-xl border border-dashed border-zinc-800 bg-black/20 text-center">
              <div>
                <p className="text-lg font-medium text-zinc-300">Market chart slot</p>
                <p className="mt-2 text-sm text-zinc-600">The price cards are live first. TradingView integration comes after the data smoke test.</p>
              </div>
            </div>
          </article>
          <article className="rounded-2xl border border-zinc-800 bg-[#0d0d0d] p-5">
            <p className="text-xs font-semibold tracking-[0.2em] text-zinc-500">SYSTEM STATUS</p>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-zinc-500">Spot feed</span><span className={data.spotError ? "text-red-400" : "text-emerald-400"}>{data.spotError ? "Error" : "Connected"}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Refresh</span><span>60 sec</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Last fetch</span><span>{data.updatedAt ? new Date(data.updatedAt).toLocaleTimeString("en-IN") : "--"}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Engine</span><span className="text-amber-300">v0.1</span></div>
            </div>
            {data.spotError && <p className="mt-5 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300">{data.spotError}</p>}
            {error && <p className="mt-3 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300">{error}</p>}
          </article>
        </section>

        <footer className="flex flex-col gap-2 border-t border-zinc-900 pt-3 text-[10px] tracking-[0.14em] text-zinc-600 sm:flex-row sm:items-center sm:justify-between">
          <span>GSAT • WAR ROOM V1</span>
          <span>SPOT: {data.spotSource ?? "PENDING"} • MACRO: {data.macroSource ?? "PENDING"}</span>
        </footer>
      </div>
    </main>
  );
}
