"use client";

import { useEffect } from "react";

export type Level = { price: number; strength?: number; touches?: number };
export type Quote = { symbol: string; label: string; price: number; changePercent: number | null; provider?: string; providerUpdatedAt?: string | null };
export type Analysis = {
  price: number | null;
  ema: { ema20: number | null; ema50: number | null; ema200: number | null; priceVsEma20: string; priceVsEma50: string; priceVsEma200: string; bias: string; interpretation?: string };
  momentum: { rsi14: number | null; rsiBias: string; macd: number | null; macdSignal: number | null; macdHistogram: number | null; macdBias: string; interpretation?: string };
  supportResistance: { supports: Level[] | number[]; resistances: Level[] | number[]; method?: string };
  overall?: { bias: string; summary: string };
};

export const money = (v: number | null) => v != null && Number.isFinite(v) ? v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "--";
export const levelPrice = (l: Level | number) => typeof l === "number" ? l : l.price;
export const levelStrength = (l: Level | number) => typeof l === "number" ? null : l.strength ?? null;
export const levelTouches = (l: Level | number) => typeof l === "number" ? null : l.touches ?? null;

export type Tone = "green" | "red" | "gold" | "blue" | "muted";
const tone: Record<Tone, { border: string; bg: string; text: string }> = {
  green: { border: "border-emerald-400/25", bg: "bg-emerald-400/[0.06]", text: "text-emerald-300" },
  red: { border: "border-rose-400/25", bg: "bg-rose-400/[0.06]", text: "text-rose-300" },
  gold: { border: "border-amber-300/25", bg: "bg-amber-300/[0.06]", text: "text-amber-200" },
  blue: { border: "border-sky-400/25", bg: "bg-sky-400/[0.06]", text: "text-sky-300" },
  muted: { border: "border-slate-700/80", bg: "bg-slate-900/30", text: "text-slate-300" },
};

export function Badge({ children, tone: t = "muted" }: { children: React.ReactNode; tone?: Tone }) {
  const c = tone[t];
  return <span className={`inline-flex items-center rounded-full border ${c.border} ${c.bg} ${c.text} px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em]`}>{children}</span>;
}

export function SectionTitle({ eyebrow, title, detail }: { eyebrow: string; title: string; detail?: string }) {
  return <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[10px] font-black tracking-[0.25em] text-slate-500">{eyebrow}</p><h2 className="mt-1 text-xl font-black tracking-tight text-white sm:text-2xl">{title}</h2></div>{detail ? <p className="text-xs text-slate-500">{detail}</p> : null}</div>;
}

export function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-3xl border border-slate-700/80 bg-[#0b1728] shadow-2xl shadow-black/20 ${className}`}>{children}</section>;
}

export function StatCard({ label, value, sub, tone: t = "muted", badge }: { label: string; value: string; sub?: string; tone?: Tone; badge?: string }) {
  const c = tone[t];
  return <article className={`min-w-0 rounded-2xl border ${c.border} ${c.bg} p-5 shadow-xl shadow-black/15`}><div className="flex items-start justify-between gap-3"><p className="text-[10px] font-black tracking-[0.2em] text-slate-500">{label}</p>{badge ? <Badge tone={t}>{badge}</Badge> : null}</div><p className="mt-4 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-3xl font-black tracking-tight text-white sm:text-4xl">{value}</p>{sub ? <p className="mt-3 text-xs leading-5 text-slate-500">{sub}</p> : null}</article>;
}

export function ScoreRing({ score, label, tone: t = "green" }: { score: number; label: string; tone?: Tone }) {
  const r = 42;
  const circ = 2 * Math.PI * r;
  const dash = Math.max(0, Math.min(100, score)) / 100 * circ;
  const stroke = t === "green" ? "#34d399" : t === "red" ? "#fb7185" : "#fbbf24";
  return <div className="relative h-32 w-32"><svg viewBox="0 0 100 100" className="h-full w-full -rotate-90"><circle cx="50" cy="50" r={r} fill="none" stroke="rgba(51,65,85,.65)" strokeWidth="8"/><circle cx="50" cy="50" r={r} fill="none" stroke={stroke} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${dash} ${circ-dash}`}/></svg><div className="absolute inset-0 flex flex-col items-center justify-center"><span className="font-mono text-3xl font-black text-white">{score}</span><span className="text-[9px] font-black tracking-[0.16em] text-slate-500">{label}</span></div></div>;
}

export function TradingViewChart({ symbol, title }: { symbol: string; title: string }) {
  useEffect(() => {
    const id = `tv_${symbol.replace(/[^a-zA-Z0-9]/g, "_")}`;
    const container = document.getElementById(id);
    if (!container) return;
    container.innerHTML = "";
    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container";
    widget.style.height = "100%";
    widget.style.width = "100%";
    const chart = document.createElement("div");
    chart.className = "tradingview-widget-container__widget";
    chart.style.height = "100%";
    chart.style.width = "100%";
    widget.appendChild(chart);
    container.appendChild(widget);
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({ autosize: true, symbol, interval: "60", timezone: "Asia/Kolkata", theme: "dark", style: "1", locale: "en", allow_symbol_change: false, hide_top_toolbar: false, hide_legend: false, hide_side_toolbar: false, hide_volume: false, withdateranges: true, save_image: false, calendar: false, support_host: "https://www.tradingview.com", studies: ["RSI@tv-basicstudies", "MACD@tv-basicstudies"] });
    widget.appendChild(script);
    return () => { const x = document.getElementById(id); if (x) x.innerHTML = ""; };
  }, [symbol]);
  return <Panel className="overflow-hidden"><div className="flex items-center justify-between gap-4 border-b border-slate-800/90 px-5 py-4"><div><p className="text-[10px] font-black tracking-[0.2em] text-slate-200">{title}</p><p className="mt-1 text-xs text-slate-500">TradingView • OANDA spot • RSI + MACD</p></div><Badge tone="green">LIVE</Badge></div><div id={`tv_${symbol.replace(/[^a-zA-Z0-9]/g, "_")}`} className="h-[520px] w-full sm:h-[620px]"/></Panel>;
}

export function ZoneCard({ title, levels, kind }: { title: string; levels: (Level | number)[]; kind: "support" | "resistance" }) {
  const isSupport = kind === "support";
  return <div className={`rounded-2xl border p-4 ${isSupport ? "border-emerald-400/20 bg-[#071a18]" : "border-rose-400/20 bg-[#1b0b14]"}`}><div className="flex items-center justify-between gap-3"><div><p className={`text-[10px] font-black tracking-[0.2em] ${isSupport ? "text-emerald-300" : "text-rose-300"}`}>{title}</p><p className="mt-1 text-xs text-slate-500">Nearest → major</p></div><Badge tone={isSupport ? "green" : "red"}>{isSupport ? "DEMAND" : "SUPPLY"}</Badge></div><div className="mt-4 grid gap-2">{levels.length ? levels.map((l,i)=><div key={`${levelPrice(l)}-${i}`} className={`grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl border px-4 py-3 ${isSupport ? "border-emerald-400/15 bg-emerald-400/[0.045]" : "border-rose-400/15 bg-rose-400/[0.045]"}`}><div><p className={`font-mono text-lg font-black ${isSupport ? "text-emerald-300" : "text-rose-300"}`}>{money(levelPrice(l))}</p><p className="mt-1 text-[10px] font-black tracking-[0.14em] text-slate-500">{isSupport ? "S" : "R"}{i+1}</p></div><p className="text-right text-[10px] leading-5 text-slate-400">{levelStrength(l)!=null ? `Strength ${levelStrength(l)}` : "Pivot"}<br/>{levelTouches(l)!=null ? `${levelTouches(l)} touches` : "Confirmed level"}</p></div>)) : <p className="text-sm text-slate-500">No confirmed levels</p>}</div></div>;
}

export function SignalCard({ label, value, detail, tone: t = "green" }: { label: string; value: string; detail: string; tone?: Tone }) {
  const c = tone[t];
  return <article className={`rounded-2xl border ${c.border} ${c.bg} p-5`}><p className={`text-[10px] font-black tracking-[0.2em] ${c.text}`}>{label}</p><p className="mt-3 text-3xl font-black text-white">{value}</p><p className="mt-2 text-xs leading-5 text-slate-400">{detail}</p></article>;
}
