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

const indicatorGuides = [
  ["RSI (14)", "Momentum", "Measures recent gains versus losses. Above 50 favors positive momentum; below 50 favors negative momentum. Extreme readings need trend context."],
  ["MACD", "Trend momentum", "Uses moving-average relationships to show direction and momentum. Crosses, zero-line position and histogram change matter."],
  ["Bollinger Bands", "Volatility", "Shows price relative to a moving average and volatility bands. Expansion means volatility is increasing."],
  ["VWAP", "Intraday fair value", "Compares price with volume-weighted average price. Above VWAP generally means stronger intraday positioning."],
  ["ADX (14)", "Trend strength", "Measures trend strength, not direction. Higher readings mean a stronger trend."],
  ["ATR (14)", "Range / volatility", "Measures typical range size. Higher ATR means wider expected price movement and larger risk zones."],
  ["Stochastic RSI", "Short-cycle momentum", "Measures RSI momentum within its own range and is useful for shorter timing, but can produce false signals."],
] as const;

const money = (value: number) => Number.isFinite(value)
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
  useEffect(() => {
    const containerId = `tv_${symbol.replace(/[^a-zA-Z0-9]/g, "_")}`;
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = "";

    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container";
    widget.style.height = "100%";
    widget.style.width = "100%";
    const chart = document.createElement("div");
    chart.className = "tradingview-widget-container__widget";
    chart.style.height = "calc(100% - 32px)";
    chart.style.width = "100%";
    const copyright = document.createElement("div");
    copyright.className = "tradingview-widget-copyright";
    copyright.innerHTML = '<a href="https://www.tradingview.com/" rel="noopener nofollow" target="_blank">Track markets on TradingView</a>';
    widget.appendChild(chart);
    widget.appendChild(copyright);
    container.appendChild(widget);

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval: "60",
      timezone: "Asia/Kolkata",
      theme: "dark",
      style: "1",
      locale: "en",
      allow_symbol_change: false,
      hide_top_toolbar: false,
      hide_legend: false,
      hide_side_toolbar: false,
      hide_volume: false,
      withdateranges: true,
      save_image: false,
      calendar: false,
      support_host: "https://www.tradingview.com",
      studies: ["RSI@tv-basicstudies", "MACD@tv-basicstudies"],
    });
    widget.appendChild(script);

    return () => {
      const current = document.getElementById(containerId);
      if (current) current.innerHTML = "";
    };
  }, [symbol]);

  return (
    <article className="overflow-hidden rounded-2xl border border-zinc-800 bg-[#0d0d0d]">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.2em] text-zinc-500">{title}</p>
          <p className="mt-1 text-xs text-zinc-600">TradingView • OANDA spot feed • RSI + MACD only</p>
        </div>
        <span className="rounded-full border border-emerald-500/20 bg-emerald-500/5 px-2 py-1 text-[10px] text-emerald-400">LIVE CHART</span>
      </div>
      <div id={`tv_${symbol.replace(/[^a-zA-Z0-9]/g, "_")}`} className="h-[640px] w-full" />
    </article>
  );
}

function EmaAnalysis({ metal, price }: { metal: string; price: number | null }) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-[#0d0d0d] p-5">
      <p className="text-xs font-semibold tracking-[0.2em] text-zinc-500">{metal.toUpperCase()} EMA ANALYSIS</p>
      <h2 className="mt-1 text-xl font-semibold">EMA 20 • EMA 50 • EMA 200</h2>
      <p className="mt-2 text-sm text-zinc-600">The three EMAs are intentionally separate from TradingView. GSAT will analyze price vs each average, slope and alignment using OHLC data.</p>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {[
          ["EMA 20", "Short-term", "Fast trend, pullbacks and short-cycle direction."],
          ["EMA 50", "Medium-term", "Intermediate trend and broader pullback structure."],
          ["EMA 200", "Long-term", "Major trend regime and long-term bias."],
        ].map(([name, focus, desc]) => (
          <article key={name} className="rounded-xl border border-zinc-800 bg-black/20 p-4">
            <h3 className="text-sm font-semibold text-zinc-200">{name}</h3>
            <p className="mt-2 text-xs font-medium text-amber-300">{focus}</p>
            <p className="mt-2 text-xs leading-5 text-zinc-500">{desc}</p>
            <p className="mt-3 text-[11px] text-zinc-700">Live spot reference: {price == null ? "--" : money(price)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function IndicatorGuide() {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-[#0d0d0d] p-5">
      <p className="text-xs font-semibold tracking-[0.2em] text-zinc-500">INDICATOR ANALYSIS</p>
      <h2 className="mt-1 text-xl font-semibold">What each indicator is analyzing</h2>
      <p className="mt-2 max-w-4xl text-sm text-zinc-600">These are confirmation layers. GSAT will interpret them with price structure, support/resistance and macro context.</p>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {indicatorGuides.map(([name, focus, desc]) => (
          <article key={name} className="rounded-xl border border-zinc-800 bg-black/20 p-4">
            <h3 className="text-sm font-semibold text-zinc-200">{name}</h3>
            <p className="mt-2 text-xs font-medium text-amber-300">Analyzes: {focus}</p>
            <p className="mt-2 text-xs leading-5 text-zinc-500">{desc}</p>
          </article>
        ))}
      </div>
    </section>
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
      const response = await fetch(`/api/quotes?ts=${Date.now()}`, { cache: "no-store" });
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
  const gold = data.quotes.find((q) => q.label === "Gold");
  const silver = data.quotes.find((q) => q.label === "Silver");

  return (
    <main className="min-h-screen bg-[#070707] px-4 py-5 text-zinc-100 md:px-6 lg:px-8">
      <div className="mx-auto max-w-[1550px] space-y-5">
        <header className="rounded-2xl border border-zinc-800 bg-[#0d0d0d] p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-bold tracking-[0.32em] text-amber-300">GSAT</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">Gold & Silver Analysis Terminal</h1>
              <p className="mt-2 text-sm text-zinc-500">Gold & Silver Spot • live refresh • clean TradingView charts • GSAT analysis</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-zinc-800 bg-black/30 px-3 py-2 text-xs text-zinc-400">{spotStatus.label}</span>
              <span className="rounded-full border border-zinc-800 bg-black/30 px-3 py-2 text-xs text-zinc-500">{spotStatus.detail}</span>
              <button onClick={() => void loadQuotes()} className="rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-2 text-sm font-medium text-amber-200 hover:bg-amber-300/15">{loading ? "Refreshing…" : "Refresh"}</button>
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          {[gold, silver].map((quote) => (
            <article key={quote?.label ?? "missing"} className="rounded-2xl border border-zinc-800 bg-[#0d0d0d] p-5">
              <div className="flex items-center justify-between"><p className="text-xs font-semibold tracking-[0.2em] text-zinc-500">{quote?.label ?? "Metal"} SPOT / USD</p><span className="text-[10px] tracking-[0.16em] text-zinc-700">{quote ? "DATA" : "WAITING"}</span></div>
              <p className="mt-4 font-mono text-4xl font-semibold">{quote ? money(quote.price) : "--"}</p>
              <p className={`mt-2 text-sm font-mono ${(quote?.changePercent ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>{quote?.changePercent == null ? "Change unavailable" : `${quote.changePercent >= 0 ? "+" : ""}${quote.changePercent.toFixed(2)}%`}</p>
              <div className="mt-3 flex items-center justify-between text-xs"><span className="text-zinc-700">{quote?.provider ?? "XAUS"}</span><span className="text-zinc-600">{quote?.providerUpdatedAt ? new Date(quote.providerUpdatedAt).toLocaleTimeString("en-IN") : "--"}</span></div>
            </article>
          ))}
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <TradingViewChart symbol="OANDA:XAUUSD" title="GOLD SPOT / USD" />
          <TradingViewChart symbol="OANDA:XAGUSD" title="SILVER SPOT / USD" />
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <EmaAnalysis metal="Gold" price={gold?.price ?? null} />
          <EmaAnalysis metal="Silver" price={silver?.price ?? null} />
        </section>

        <IndicatorGuide />

        <section className="rounded-2xl border border-zinc-800 bg-[#0d0d0d] p-5">
          <p className="text-xs font-semibold tracking-[0.2em] text-zinc-500">ANALYSIS ORDER</p>
          <h2 className="mt-1 text-xl font-semibold">Live Price → Pattern → Indicators → Support / Resistance → Macro → Decision</h2>
          <p className="mt-2 text-sm text-zinc-600">The decision layer will react to each live price update instead of showing static commentary.</p>
        </section>

        <article className="rounded-2xl border border-zinc-800 bg-[#0d0d0d] p-5">
          <p className="text-xs font-semibold tracking-[0.2em] text-zinc-500">SYSTEM STATUS</p>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex justify-between"><span className="text-zinc-500">Spot feed</span><span className={data.spotError ? "text-red-400" : "text-emerald-400"}>{data.spotError ? "Error" : "Connected"}</span></div>
            <div className="flex justify-between"><span className="text-zinc-500">Provider</span><span>XAUS</span></div>
            <div className="flex justify-between"><span className="text-zinc-500">Refresh</span><span>60 sec</span></div>
            <div className="flex justify-between"><span className="text-zinc-500">Metals</span><span>{gold && silver ? "Ready" : "Incomplete"}</span></div>
          </div>
          {(data.spotError || error) && <p className="mt-5 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300">{data.spotError || error}</p>}
        </article>

        <footer className="flex flex-col gap-2 border-t border-zinc-900 pt-3 text-[10px] tracking-[0.14em] text-zinc-600 sm:flex-row sm:items-center sm:justify-between"><span>GSAT • TECHNICAL WAR ROOM</span><span>SPOT: XAUS • CHARTS: TRADINGVIEW/OANDA</span></footer>
      </div>
    </main>
  );
}
