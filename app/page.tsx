"use client";

import { useEffect, useState } from "react";

type Quote = { symbol: string; label: string; price: number; changePercent: number | null };
type QuoteResponse = { quotes: Quote[]; updatedAt: string };

const money = (value: number, digits = 2) => Number.isFinite(value) ? value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "--";

export default function Home() {
  const [data, setData] = useState<QuoteResponse>({ quotes: [], updatedAt: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadQuotes() {
    try {
      setError("");
      const response = await fetch("/api/quotes", { cache: "no-store" });
      if (!response.ok) throw new Error("Live quote request failed");
      setData(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Live data unavailable");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadQuotes();
    const timer = window.setInterval(loadQuotes, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <main className="min-h-screen bg-[#070707] text-zinc-100">
      <div className="mx-auto max-w-[1500px] space-y-5 p-5 md:p-8">
        <header className="rounded-2xl border border-zinc-800 bg-[#0d0d0d] p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-bold tracking-[0.32em] text-amber-300">GSAT</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">Gold & Silver War Room</h1>
              <p className="mt-2 text-sm text-zinc-500">Free live-market test build • refreshes every 60 seconds</p>
            </div>
            <button onClick={loadQuotes} className="rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-2 text-sm font-medium text-amber-200 hover:bg-amber-300/15">{loading ? "Refreshing…" : "Refresh"}</button>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {(["Gold","Silver","DXY","USD/INR","Brent","VIX"] as const).map(label => {
            const quote = data.quotes.find(q => q.label === label);
            const positive = (quote?.changePercent ?? 0) >= 0;
            return (
              <article key={label} className="rounded-2xl border border-zinc-800 bg-[#0d0d0d] p-5">
                <div className="flex items-center justify-between"><p className="text-xs font-semibold tracking-[0.2em] text-zinc-500">{label}</p><span className="text-[10px] tracking-[0.16em] text-zinc-700">LIVE</span></div>
                <p className="mt-4 font-mono text-3xl font-semibold">{quote ? money(quote.price) : "--"}</p>
                <p className={`mt-2 text-xs font-mono ${positive ? "text-emerald-400" : "text-red-400"}`}>{quote?.changePercent == null ? "--" : `${positive ? "+" : ""}${quote.changePercent.toFixed(2)}%`}</p>
                <p className="mt-3 text-xs text-zinc-700">Yahoo Finance public feed</p>
              </article>
            );
          })}
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.4fr_0.8fr]">
          <article className="rounded-2xl border border-zinc-800 bg-[#0d0d0d] p-5">
            <p className="text-xs font-semibold tracking-[0.2em] text-zinc-500">CHART</p>
            <div className="mt-4 flex min-h-[360px] items-center justify-center rounded-xl border border-dashed border-zinc-800 bg-black/20 text-center">
              <div><p className="text-lg font-medium text-zinc-300">Live chart slot</p><p className="mt-2 text-sm text-zinc-600">Chart integration comes after the production smoke test.</p></div>
            </div>
          </article>
          <article className="rounded-2xl border border-zinc-800 bg-[#0d0d0d] p-5">
            <p className="text-xs font-semibold tracking-[0.2em] text-zinc-500">SYSTEM STATUS</p>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-zinc-500">Data</span><span className="text-emerald-400">{error ? "Error" : "Connected"}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Auto refresh</span><span>60 sec</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Last update</span><span>{data.updatedAt ? new Date(data.updatedAt).toLocaleTimeString("en-IN") : "--"}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Engine</span><span className="text-amber-300">v0.1</span></div>
            </div>
            {error && <p className="mt-5 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300">{error}</p>}
          </article>
        </section>
      </div>
    </main>
  );
}
