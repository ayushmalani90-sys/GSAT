"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Quote = { symbol: string; label: string; price: number; changePercent: number | null; provider?: string; providerUpdatedAt?: string | null };
type QuoteResponse = { quotes: Quote[]; updatedAt: string; spotError?: string | null };

const money = (value: number | null) => value != null && Number.isFinite(value) ? value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "--";

function statusFromQuotes(quotes: Quote[]) {
  const timestamps = quotes.filter((q) => q.providerUpdatedAt).map((q) => Date.parse(q.providerUpdatedAt as string));
  const latest = timestamps.length ? Math.max(...timestamps) : NaN;
  if (!Number.isFinite(latest)) return { label: "DATA STATUS UNKNOWN", detail: "Waiting for spot timestamp" };
  const ageSeconds = Math.max(0, Date.now() - latest) / 1000;
  return ageSeconds <= 90 ? { label: "SPOT DATA FRESH", detail: `Updated ${Math.round(ageSeconds)}s ago` } : { label: "SPOT DATA STALE", detail: `Last update ${Math.round(ageSeconds / 60)}m ago` };
}

function TradingViewChart({ symbol, title }: { symbol: string; title: string }) {
  useEffect(() => {
    const id = `tv_${symbol.replace(/[^a-zA-Z0-9]/g, "_")}`;
    const container = document.getElementById(id);
    if (!container) return;
    container.innerHTML = "";
    const widget = document.createElement("div"); widget.className = "tradingview-widget-container"; widget.style.height = "100%"; widget.style.width = "100%";
    const chart = document.createElement("div"); chart.className = "tradingview-widget-container__widget"; chart.style.height = "calc(100% - 32px)"; chart.style.width = "100%";
    widget.appendChild(chart); container.appendChild(widget);
    const script = document.createElement("script"); script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js"; script.type = "text/javascript"; script.async = true;
    script.innerHTML = JSON.stringify({ autosize: true, symbol, interval: "60", timezone: "Asia/Kolkata", theme: "dark", style: "1", locale: "en", allow_symbol_change: false, hide_top_toolbar: false, hide_legend: false, hide_side_toolbar: false, hide_volume: false, withdateranges: true, save_image: false, calendar: false, support_host: "https://www.tradingview.com", studies: ["RSI@tv-basicstudies", "MACD@tv-basicstudies"] });
    widget.appendChild(script);
    return () => { const current = document.getElementById(id); if (current) current.innerHTML = ""; };
  }, [symbol]);
  return <article className="overflow-hidden rounded-2xl border border-zinc-800 bg-[#0d0d0d]"><div className="border-b border-zinc-800 px-4 py-3"><p className="text-[10px] font-semibold tracking-[0.2em] text-zinc-500">{title}</p><p className="mt-1 text-xs text-zinc-600">TradingView • OANDA spot feed • RSI + MACD</p></div><div id={`tv_${symbol.replace(/[^a-zA-Z0-9]/g, "_")}`} className="h-[640px] w-full" /></article>;
}

function EmaBlock({ metal, price }: { metal: string; price: number | null }) {
  return <section className="rounded-2xl border border-zinc-800 bg-[#0d0d0d] p-5"><p className="text-xs font-semibold tracking-[0.2em] text-zinc-500">{metal.toUpperCase()} EMA ANALYSIS</p><h2 className="mt-1 text-xl font-semibold">EMA 20 • EMA 50 • EMA 200</h2><p className="mt-2 text-sm text-zinc-500">EMA calculations require a historical price series. They are not calculated from a single live spot quote.</p><div className="mt-4 grid gap-3 md:grid-cols-3">{[["EMA 20","Short-term trend"],["EMA 50","Medium-term trend"],["EMA 200","Long-term trend"]].map(([name,desc])=><div key={name} className="rounded-xl border border-zinc-800 bg-black/20 p-4"><p className="text-sm font-semibold">{name}</p><p className="mt-2 text-xs text-zinc-500">{desc}</p><p className="mt-3 font-mono text-xs text-zinc-700">Live spot: {money(price)}</p><p className="mt-2 text-[11px] text-amber-300">Waiting for verified history</p></div>)}</div></section>;
}

function SupportResistance() {
  return <section className="rounded-2xl border border-zinc-800 bg-[#0d0d0d] p-5"><p className="text-xs font-semibold tracking-[0.2em] text-zinc-500">SUPPORT / RESISTANCE</p><h2 className="mt-1 text-xl font-semibold">Verified levels only</h2><p className="mt-2 text-sm text-zinc-500">GSAT will populate support and resistance from actual historical price data. No levels are fabricated from the current spot price.</p><div className="mt-4 grid gap-3 md:grid-cols-2"><div className="rounded-xl border border-zinc-800 bg-black/20 p-4"><p className="text-xs text-zinc-600">SUPPORT</p><p className="mt-3 text-sm text-zinc-500">Waiting for verified historical series</p></div><div className="rounded-xl border border-zinc-800 bg-black/20 p-4"><p className="text-xs text-zinc-600">RESISTANCE</p><p className="mt-3 text-sm text-zinc-500">Waiting for verified historical series</p></div></div></section>;
}

export default function Home() {
  const [data, setData] = useState<QuoteResponse>({ quotes: [], updatedAt: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => { try { setLoading(true); setError(""); const response = await fetch(`/api/quotes?ts=${Date.now()}`, { cache: "no-store" }); if (!response.ok) throw new Error("Live spot request failed"); setData(await response.json()); } catch (e) { setError(e instanceof Error ? e.message : "Live spot unavailable"); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 60000); return () => window.clearInterval(timer); }, [load]);
  const status = useMemo(() => statusFromQuotes(data.quotes), [data.quotes]);
  const gold = data.quotes.find((q) => q.label === "Gold");
  const silver = data.quotes.find((q) => q.label === "Silver");
  return <main className="min-h-screen bg-[#070707] px-4 py-5 text-zinc-100 md:px-6 lg:px-8"><div className="mx-auto max-w-[1550px] space-y-5"><header className="rounded-2xl border border-zinc-800 bg-[#0d0d0d] p-6"><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-bold tracking-[0.32em] text-amber-300">GSAT</p><h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">Gold & Silver Analysis Terminal</h1><p className="mt-2 text-sm text-zinc-500">XAUS spot prices • TradingView charts • technical analysis</p></div><div className="flex flex-wrap items-center gap-3"><span className="rounded-full border border-zinc-800 bg-black/30 px-3 py-2 text-xs text-zinc-400">{status.label}</span><span className="rounded-full border border-zinc-800 bg-black/30 px-3 py-2 text-xs text-zinc-500">{status.detail}</span><button onClick={() => void load()} className="rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-2 text-sm font-medium text-amber-200">{loading ? "Refreshing…" : "Refresh"}</button></div></div></header><section className="grid gap-4 md:grid-cols-2"><article className="rounded-2xl border border-zinc-800 bg-[#0d0d0d] p-5"><p className="text-xs font-semibold tracking-[0.2em] text-zinc-500">GOLD SPOT / USD</p><p className="mt-4 font-mono text-4xl font-semibold">{money(gold?.price ?? null)}</p><p className="mt-2 text-xs text-zinc-600">XAUS • {gold?.providerUpdatedAt ? new Date(gold.providerUpdatedAt).toLocaleTimeString("en-IN") : "--"}</p></article><article className="rounded-2xl border border-zinc-800 bg-[#0d0d0d] p-5"><p className="text-xs font-semibold tracking-[0.2em] text-zinc-500">SILVER SPOT / USD</p><p className="mt-4 font-mono text-4xl font-semibold">{money(silver?.price ?? null)}</p><p className="mt-2 text-xs text-zinc-600">XAUS • {silver?.providerUpdatedAt ? new Date(silver.providerUpdatedAt).toLocaleTimeString("en-IN") : "--"}</p></article></section><section className="grid gap-5 xl:grid-cols-2"><TradingViewChart symbol="OANDA:XAUUSD" title="GOLD SPOT / USD"/><TradingViewChart symbol="OANDA:XAGUSD" title="SILVER SPOT / USD"/></section><section className="grid gap-5 xl:grid-cols-2"><EmaBlock metal="Gold" price={gold?.price ?? null}/><EmaBlock metal="Silver" price={silver?.price ?? null}/></section><SupportResistance/><section className="rounded-2xl border border-zinc-800 bg-[#0d0d0d] p-5">{error || data.spotError ? <p className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300">{error || data.spotError}</p> : <p className="text-sm text-zinc-500">Technical engine is paused until verified historical data is available. This prevents GSAT from displaying false EMA or support/resistance levels.</p>}</section><footer className="border-t border-zinc-900 pt-3 text-[10px] tracking-[0.14em] text-zinc-600">GSAT • SPOT: XAUS • CHARTS: TRADINGVIEW/OANDA</footer></div></main>;
}
