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
  spotError?: string | null;
  errors?: string[];
};

const labels = ["Gold", "Silver", "DXY", "USD/INR", "Brent", "VIX"] as const;

const money = (value: number) =>
  Number.isFinite(value)
    ? value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "--";

function statusFromQuotes(quotes: Quote[]) {
  const metals = quotes.filter((q) => q.label === "Gold" || q.label === "Silver");
  const timestamps = metals.filter((q) => q.providerUpdatedAt).map((q) => Date.parse(q.providerUpdatedAt as string));
  const latest = timestamps.length ? Math.max(...timestamps) : NaN;
  if (!Number.isFinite(latest)) return { label: "DATA STATUS UNKNOWN", detail: "Waiting for spot timestamp" };
  const ageSeconds = Math.max(0, Date.now() - latest) / 1000;
  if (ageSeconds <= 90) return { label: "SPOT DATA FRESH", detail: `Updated ${Math.round(ageSeconds)}s ago` };
  return { label: "SPOT DATA STALE", detail: `Last update ${Math.round(ageSeconds / 60)}m ago` };
}

function TradingViewChart({ symbol, title }: { symbol: string; title: string }) {
  const src = `https://www.tradingview.com/widgetembed/?frameElementId=tv_${encodeURIComponent(symbol)}&symbol=${encodeURIComponent(symbol)}&interval=60&hidesidetoolbar=0&symboledit=1&saveimage=1&toolbarbg=%23070707&studies=RSI@tv-basicstudies%1FMACD@tv-basicstudies&theme=dark&style=1&timezone=Asia%2FKolkata&withdateranges=1&hideideas=1&hidelegend=0&locale=en`;
  return (
    <article className="overflow-hidden rounded-2xl border border-zinc-800 bg-[#0d0d0d]">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.2em] text-zinc-500">{title}</p>
          <p className="mt-1 text-xs text-zinc-600">TradingView spot feed • OANDA</p>
        </div>
        <span className="rounded-full border border-emerald-500/20 bg-emerald-500/5 px-2 py-1 text-[10px] text-emerald-400">LIVE CHART</span>
      </div>
      <iframe title={title} src={src} className="h-[520px] w-full border-0" loading="lazy" />
    </article>
  );
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
  const metals = data.quotes.filter((q) => q.label === "Gold" || q.label === "Silver");

  return (
    <main className="min-h-screen bg-[#070707] px-4 py-5 text-zinc-100 md:px-6 lg:px-8">
      <div className="mx-auto max-w-[1550px] space-y-5">
        <header className="rounded-2xl border border-zinc-800 bg-[#0d0d0d] p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-bold tracking-[0.32em] text-amber-300">GSAT</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">Gold & Silver Analysis Terminal</h1>
              <p className="mt-2 text-sm text-zinc-500">Single spot source for Gold + Silver • charts • indicators • macro watchlist</p>
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
            const provider = quote?.provider ?? (label === "Gold" || label === "Silver" ? "XAUS" : "Yahoo Finance");
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

        <section className="grid gap-5 xl:grid-cols-2">
          <TradingViewChart symbol="OANDA:XAUUSD" title="GOLD SPOT / USD" />
          <TradingViewChart symbol="OANDA:XAGUSD" title="SILVER SPOT / USD" />
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
          <article className="rounded-2xl border border-zinc-800 bg-[#0d0d0d] p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold tracking-[0.2em] text-zinc-500">ANALYSIS FLOW</p>
                <h2 className="mt-1 text-lg font-semibold">Pattern → Indicators → Levels → Macro → Decision</h2>
              </div>
              <span className="text-xs text-zinc-600">GSAT engine</span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {["Chart Pattern", "Indicators", "Support / Resistance", "Macro", "Decision"].map((item, index) => (
                <div key={item} className="rounded-xl border border-zinc-800 bg-black/20 p-4">
                  <span className="text-[10px] font-semibold tracking-[0.18em] text-amber-300">0{index + 1}</span>
                  <p className="mt-2 text-sm font-medium">{item}</p>
                  <p className="mt-1 text-xs text-zinc-600">{index === 0 ? "Structure first" : index === 1 ? "RSI • MACD • EMA" : index === 2 ? "Zones + pivots" : index === 3 ? "DXY • VIX • rates" : "BUY • WAIT • SELL"}</p>
                </div>
              ))}
            </div>
          </article>
          <article className="rounded-2xl border border-zinc-800 bg-[#0d0d0d] p-5">
            <p className="text-xs font-semibold tracking-[0.2em] text-zinc-500">SYSTEM STATUS</p>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-zinc-500">Spot feed</span><span className={data.spotError ? "text-red-400" : "text-emerald-400"}>{data.spotError ? "Error" : "Connected"}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Spot provider</span><span>XAUS</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Refresh</span><span>60 sec</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Gold + Silver</span><span>{metals.length === 2 ? "Ready" : `${metals.length}/2`}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Macro</span><span>Yahoo Finance</span></div>
            </div>
            {(data.spotError || error) && <p className="mt-5 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300">{data.spotError || error}</p>}
          </article>
        </section>

        <footer className="flex flex-col gap-2 border-t border-zinc-900 pt-3 text-[10px] tracking-[0.14em] text-zinc-600 sm:flex-row sm:items-center sm:justify-between">
          <span>GSAT • WAR ROOM V1</span>
          <span>SPOT: XAUS • CHARTS: TRADINGVIEW/OANDA • MACRO: YAHOO FINANCE</span>
        </footer>
      </div>
    </main>
  );
}
