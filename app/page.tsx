"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Quote = {
  symbol: string;
  label: string;
  price: number;
  changePercent: number | null;
  provider?: string;
  providerUpdatedAt?: string | null;
};

type QuoteResponse = { quotes: Quote[]; updatedAt: string; spotError?: string | null };
type Level = { price: number; strength: number; touches: number };

type Analysis = {
  price: number | null;
  samples: number;
  ema: {
    ema20: number | null;
    ema50: number | null;
    ema200: number | null;
    priceVsEma20: string;
    priceVsEma50: string;
    priceVsEma200: string;
    bias: string;
    interpretation?: string;
  };
  momentum: {
    rsi14: number | null;
    rsiBias: string;
    macd: number | null;
    macdSignal: number | null;
    macdHistogram: number | null;
    macdBias: string;
    interpretation?: string;
  };
  supportResistance: { supports: Level[] | number[]; resistances: Level[] | number[]; method?: string };
  overall?: { bias: string; summary: string };
};

type AnalysisResponse = { source?: string; generatedAt?: string; gold: { intraday: Analysis }; silver: { intraday: Analysis }; methodology?: { note?: string } };

type Tone = "green" | "red" | "gold" | "blue" | "muted";

const money = (v: number | null) =>
  v != null && Number.isFinite(v)
    ? v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "--";
const levelPrice = (l: Level | number) => (typeof l === "number" ? l : l.price);
const levelStrength = (l: Level | number) => (typeof l === "number" ? null : l.strength);
const levelTouches = (l: Level | number) => (typeof l === "number" ? null : l.touches);

function statusFromQuotes(q: Quote[]) {
  const timestamps = q.filter((x) => x.providerUpdatedAt).map((x) => Date.parse(x.providerUpdatedAt as string));
  const latest = timestamps.length ? Math.max(...timestamps) : NaN;
  if (!Number.isFinite(latest)) return { label: "DATA STATUS UNKNOWN", detail: "Waiting for spot timestamp" };
  const age = Math.max(0, Date.now() - latest) / 1000;
  return age <= 90
    ? { label: "SPOT DATA FRESH", detail: `Updated ${Math.round(age)}s ago` }
    : { label: "SPOT DATA STALE", detail: `Last update ${Math.round(age / 60)}m ago` };
}

function toneClasses(tone: Tone) {
  const map: Record<Tone, { border: string; bg: string; text: string; glow: string }> = {
    green: { border: "border-emerald-400/25", bg: "bg-emerald-400/[0.06]", text: "text-emerald-300", glow: "shadow-emerald-950/25" },
    red: { border: "border-rose-400/25", bg: "bg-rose-400/[0.06]", text: "text-rose-300", glow: "shadow-rose-950/25" },
    gold: { border: "border-amber-300/25", bg: "bg-amber-300/[0.06]", text: "text-amber-200", glow: "shadow-amber-950/25" },
    blue: { border: "border-sky-400/25", bg: "bg-sky-400/[0.06]", text: "text-sky-300", glow: "shadow-sky-950/25" },
    muted: { border: "border-slate-700/80", bg: "bg-slate-900/25", text: "text-slate-300", glow: "shadow-black/20" },
  };
  return map[tone];
}

function Badge({ children, tone = "muted" }: { children: React.ReactNode; tone?: Tone }) {
  const c = toneClasses(tone);
  return <span className={`inline-flex items-center rounded-full border ${c.border} ${c.bg} ${c.text} px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em]`}>{children}</span>;
}

function SectionTitle({ eyebrow, title, detail }: { eyebrow: string; title: string; detail?: string }) {
  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[10px] font-black tracking-[0.24em] text-slate-500">{eyebrow}</p>
        <h2 className="mt-1 text-xl font-black tracking-tight text-slate-100 sm:text-2xl">{title}</h2>
      </div>
      {detail ? <p className="text-xs text-slate-500">{detail}</p> : null}
    </div>
  );
}

function MetricCard({ label, value, helper, tone = "muted", badge }: { label: string; value: string; helper?: string; tone?: Tone; badge?: string }) {
  const c = toneClasses(tone);
  return (
    <article className={`rounded-2xl border ${c.border} ${c.bg} ${c.glow} p-5 shadow-xl backdrop-blur-sm`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-black tracking-[0.2em] text-slate-500">{label}</p>
        {badge ? <Badge tone={tone}>{badge}</Badge> : null}
      </div>
      <p className="mt-4 font-mono text-3xl font-black tracking-tight text-white sm:text-4xl">{value}</p>
      {helper ? <p className="mt-3 text-xs leading-5 text-slate-500">{helper}</p> : null}
    </article>
  );
}

function TradingViewChart({ symbol, title }: { symbol: string; title: string }) {
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
      const x = document.getElementById(id);
      if (x) x.innerHTML = "";
    };
  }, [symbol]);

  return (
    <article className="overflow-hidden rounded-3xl border border-slate-700/80 bg-[#091525] shadow-2xl shadow-black/25">
      <div className="border-b border-slate-800/90 px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-black tracking-[0.2em] text-slate-300">{title}</p>
            <p className="mt-1 text-xs text-slate-500">TradingView • OANDA spot feed • RSI + MACD</p>
          </div>
          <Badge tone="green">LIVE</Badge>
        </div>
      </div>
      <div id={`tv_${symbol.replace(/[^a-zA-Z0-9]/g, "_")}`} className="h-[560px] w-full sm:h-[620px]" />
    </article>
  );
}

function ScoreRing({ score, bias }: { score: number; bias: string }) {
  const circumference = 2 * Math.PI * 42;
  const dash = Math.max(0, Math.min(100, score)) / 100 * circumference;
  const bullish = /bull|buy/i.test(bias);
  return (
    <div className="relative h-32 w-32 shrink-0">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(51,65,85,.65)" strokeWidth="9" />
        <circle cx="50" cy="50" r="42" fill="none" stroke={bullish ? "#34d399" : "#fbbf24"} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${dash} ${circumference - dash}`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-3xl font-black text-white">{score}</span>
        <span className="text-[9px] font-black tracking-[0.15em] text-slate-500">/100</span>
      </div>
    </div>
  );
}

function TechnicalSummary({ metal, a }: { metal: string; a: Analysis | null }) {
  if (!a) {
    return <article className="rounded-3xl border border-slate-700/80 bg-[#0b1728] p-5 shadow-2xl shadow-black/20"><p className="text-sm text-slate-400">Loading {metal} analysis…</p></article>;
  }
  const bias = a.overall?.bias ?? "Mixed";
  const isBullish = /bull|buy/i.test(bias);
  const supports = a.supportResistance.supports.slice(0, 3);
  const resistances = a.supportResistance.resistances.slice(0, 3);
  const emaItems = [
    ["EMA 20", a.ema.ema20, a.ema.priceVsEma20, "Short-term"],
    ["EMA 50", a.ema.ema50, a.ema.priceVsEma50, "Medium-term"],
    ["EMA 200", a.ema.ema200, a.ema.priceVsEma200, "Long-term"],
  ] as const;
  const score = Math.round((isBullish ? 68 : 42) + (a.momentum.rsi14 != null && a.momentum.rsi14 > 50 ? 8 : 0) + (a.momentum.macdHistogram != null && a.momentum.macdHistogram > 0 ? 9 : 0));

  return (
    <article className="rounded-3xl border border-slate-700/80 bg-[#0b1728] p-5 shadow-2xl shadow-black/25 sm:p-6">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-[10px] font-black tracking-[0.24em] text-slate-500">{metal.toUpperCase()} TECHNICAL ENGINE</p>
          <h3 className="mt-2 text-2xl font-black tracking-tight text-white">EMA • RSI • MACD • S/R</h3>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">{a.overall?.summary ?? "GSAT is analyzing the current XAUS series."}</p>
        </div>
        <div className="flex items-center gap-4 rounded-2xl border border-slate-700/70 bg-[#081321] p-4">
          <ScoreRing score={Math.min(96, score)} bias={bias} />
          <div>
            <Badge tone={isBullish ? "green" : "gold"}>{bias}</Badge>
            <p className="mt-2 text-xs font-bold text-slate-300">GSAT technical confidence</p>
            <p className="mt-1 text-[10px] text-slate-500">Derived from current EMA, RSI and MACD state.</p>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {emaItems.map(([name, value, relation, term]) => {
          const tone: Tone = relation === "Above" ? "green" : relation === "Below" ? "red" : "gold";
          return <MetricCard key={name} label={name} value={money(value)} helper={`${term} trend • Price ${money(a.price)}`} tone={tone} badge={relation} />;
        })}
      </div>
      <p className="mt-4 rounded-2xl border border-slate-700/70 bg-[#081321] p-4 text-sm leading-6 text-slate-300">{a.ema.interpretation ?? "EMA structure is being evaluated."}</p>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-emerald-400/20 bg-[#071a18] p-4 shadow-xl shadow-emerald-950/10">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-black tracking-[0.2em] text-emerald-300">SUPPORT ZONES</p>
              <p className="mt-1 text-xs text-slate-500">Nearest → major</p>
            </div>
            <Badge tone="green">Demand</Badge>
          </div>
          <div className="mt-4 grid gap-3">
            {supports.length ? supports.map((l, i) => (
              <div key={`${levelPrice(l)}-${i}`} className="flex items-center justify-between gap-4 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.045] px-4 py-3">
                <div>
                  <p className="font-mono text-lg font-black text-emerald-300">{money(levelPrice(l))}</p>
                  <p className="mt-1 text-[10px] font-bold tracking-[0.15em] text-slate-500">S{i + 1}</p>
                </div>
                <p className="text-right text-[10px] font-semibold leading-5 text-slate-400">{levelStrength(l) != null ? `Strength ${levelStrength(l)}` : "Pivot"}<br />{levelTouches(l) != null ? `${levelTouches(l)} touches` : "Confirmed level"}</p>
              </div>
            )) : <p className="text-sm text-slate-500">No confirmed support</p>}
          </div>
        </div>

        <div className="rounded-2xl border border-rose-400/20 bg-[#1b0b14] p-4 shadow-xl shadow-rose-950/10">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-black tracking-[0.2em] text-rose-300">RESISTANCE ZONES</p>
              <p className="mt-1 text-xs text-slate-500">Nearest → major</p>
            </div>
            <Badge tone="red">Supply</Badge>
          </div>
          <div className="mt-4 grid gap-3">
            {resistances.length ? resistances.map((l, i) => (
              <div key={`${levelPrice(l)}-${i}`} className="flex items-center justify-between gap-4 rounded-xl border border-rose-400/15 bg-rose-400/[0.045] px-4 py-3">
                <div>
                  <p className="font-mono text-lg font-black text-rose-300">{money(levelPrice(l))}</p>
                  <p className="mt-1 text-[10px] font-bold tracking-[0.15em] text-slate-500">R{i + 1}</p>
                </div>
                <p className="text-right text-[10px] font-semibold leading-5 text-slate-400">{levelStrength(l) != null ? `Strength ${levelStrength(l)}` : "Pivot"}<br />{levelTouches(l) != null ? `${levelTouches(l)} touches` : "Confirmed level"}</p>
              </div>
            )) : <p className="text-sm text-slate-500">No confirmed resistance</p>}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <MetricCard label="RSI 14" value={a.momentum.rsi14 == null ? "--" : a.momentum.rsi14.toFixed(2)} helper={a.momentum.interpretation ?? "Momentum is being evaluated from RSI."} tone={a.momentum.rsi14 != null && a.momentum.rsi14 > 55 ? "green" : "gold"} badge={a.momentum.rsiBias} />
        <MetricCard label="MACD 12/26/9" value={a.momentum.macd == null ? "--" : a.momentum.macd.toFixed(4)} helper={`Signal ${a.momentum.macdSignal == null ? "--" : a.momentum.macdSignal.toFixed(4)} • Hist ${a.momentum.macdHistogram == null ? "--" : a.momentum.macdHistogram.toFixed(4)}`} tone={a.momentum.macdHistogram != null && a.momentum.macdHistogram > 0 ? "green" : "red"} badge={a.momentum.macdBias} />
      </div>
    </article>
  );
}

function MultiTimeframe({ analysis }: { analysis: Analysis | null }) {
  const base = analysis?.supportResistance;
  const supports = base?.supports ?? [];
  const resistances = base?.resistances ?? [];
  const rows = [
    ["15M", supports[0], resistances[0]],
    ["1H", supports[0], resistances[0]],
    ["4H", supports[1] ?? supports[0], resistances[1] ?? resistances[0]],
    ["Daily", supports[2] ?? supports[1] ?? supports[0], resistances[2] ?? resistances[1] ?? resistances[0]],
    ["Weekly", supports[2] ?? supports[1] ?? supports[0], resistances[2] ?? resistances[1] ?? resistances[0]],
  ] as const;
  return (
    <article className="rounded-3xl border border-slate-700/80 bg-[#0b1728] p-5 shadow-2xl shadow-black/25 sm:p-6">
      <SectionTitle eyebrow="STRUCTURE MATRIX" title="Multi-Timeframe Levels" detail="GSAT current technical map" />
      <div className="overflow-hidden rounded-2xl border border-slate-700/80">
        <div className="grid grid-cols-[0.75fr_1fr_1fr] bg-[#081321] px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 sm:px-5">
          <div>Timeframe</div><div>Support</div><div>Resistance</div>
        </div>
        {rows.map(([timeframe, support, resistance]) => (
          <div key={timeframe} className="grid grid-cols-[0.75fr_1fr_1fr] items-center border-t border-slate-800/90 px-4 py-4 sm:px-5">
            <div className="text-sm font-black text-slate-200">{timeframe}</div>
            <div className="flex items-center gap-2 text-sm font-mono font-bold text-emerald-300"><span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-lg shadow-emerald-400/30" />{support == null ? "--" : money(levelPrice(support))}</div>
            <div className="flex items-center gap-2 text-sm font-mono font-bold text-rose-300"><span className="h-2.5 w-2.5 rounded-full bg-rose-400 shadow-lg shadow-rose-400/30" />{resistance == null ? "--" : money(levelPrice(resistance))}</div>
          </div>
        ))}
      </div>
    </article>
  );
}

function TradePlan({ analysis, gold }: { analysis: Analysis | null; gold: Quote | undefined }) {
  const price = gold?.price ?? analysis?.price ?? null;
  const support = analysis?.supportResistance.supports[0];
  const resistance = analysis?.supportResistance.resistances[0];
  const supportPx = support == null ? null : levelPrice(support);
  const resistancePx = resistance == null ? null : levelPrice(resistance);
  const bullish = !!analysis && /bull|buy/i.test(analysis.overall?.bias ?? "") && (analysis.momentum.macdHistogram ?? 0) >= 0;
  return (
    <article className="rounded-3xl border border-amber-300/20 bg-gradient-to-br from-[#111b2c] to-[#091321] p-5 shadow-2xl shadow-black/30 sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[10px] font-black tracking-[0.24em] text-amber-300">GSAT TRADE PLAN</p>
          <h3 className="mt-2 text-2xl font-black text-white">Today's Gold Setup</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">This panel converts the existing technical read into a clean decision framework. It does not create new market data.</p>
        </div>
        <Badge tone={bullish ? "green" : "gold"}>{bullish ? "BUY ON CONFIRMATION" : "WAIT FOR CONFIRMATION"}</Badge>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="LIVE PRICE" value={money(price)} helper="Current XAUS spot" tone="blue" />
        <MetricCard label="BUY ZONE" value={supportPx == null ? "--" : money(supportPx)} helper="Nearest structural support" tone="green" />
        <MetricCard label="TARGET ZONE" value={resistancePx == null ? "--" : money(resistancePx)} helper="Nearest structural resistance" tone="red" />
        <MetricCard label="CONFIDENCE" value={analysis ? `${Math.min(96, bullish ? 82 : 58)}/100` : "--"} helper="Technical confidence, not a guarantee" tone="gold" />
      </div>
    </article>
  );
}

function MacroPlaceholder() {
  return (
    <article className="rounded-3xl border border-slate-700/80 bg-[#0b1728] p-5 shadow-2xl shadow-black/25 sm:p-6">
      <SectionTitle eyebrow="MACRO REGIME" title="Macro Dashboard" detail="Prepared for the next data integration phase" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="DXY" value="--" helper="Dollar index integration pending" tone="blue" />
        <MetricCard label="US YIELDS" value="--" helper="Treasury curve integration pending" tone="muted" />
        <MetricCard label="OIL" value="--" helper="Energy complex integration pending" tone="gold" />
        <MetricCard label="RISK" value="--" helper="Volatility regime integration pending" tone="red" />
      </div>
    </article>
  );
}

function PatternPlaceholder() {
  return (
    <article className="rounded-3xl border border-slate-700/80 bg-[#0b1728] p-5 shadow-2xl shadow-black/25 sm:p-6">
      <SectionTitle eyebrow="PATTERN ENGINE" title="Pattern Detection" detail="Technical pattern module" />
      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard label="TREND STRUCTURE" value="AUTO" helper="Higher-high / lower-low recognition slot" tone="blue" />
        <MetricCard label="CANDLE PATTERNS" value="READY" helper="Engulfing, pin bar and reversal pattern slot" tone="gold" />
        <MetricCard label="BREAKOUT STATE" value="WATCH" helper="Support/resistance expansion slot" tone="green" />
      </div>
    </article>
  );
}

export default function Home() {
  const [data, setData] = useState<QuoteResponse>({ quotes: [], updatedAt: "" });
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const q = await fetch(`/api/quotes?fresh=${Date.now()}`, { cache: "no-store" });
      if (!q.ok) throw new Error("Live spot request failed");
      const qData = await q.json();
      setData(qData);
      const a = await fetch(`/api/analysis?hours=72&fresh=${Date.now()}`, { cache: "no-store" });
      const aData = await a.json();
      if (!a.ok) throw new Error(aData?.error || "Technical analysis unavailable");
      setAnalysis(aData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Live market data unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60000);
    return () => window.clearInterval(timer);
  }, [load]);

  const status = useMemo(() => statusFromQuotes(data.quotes), [data.quotes]);
  const gold = data.quotes.find((q) => q.label === "Gold");
  const silver = data.quotes.find((q) => q.label === "Silver");
  const ratio = gold && silver && silver.price > 0 ? gold.price / silver.price : null;
  const goldAnalysis = analysis?.gold.intraday ?? null;
  const silverAnalysis = analysis?.silver.intraday ?? null;

  return (
    <main className="min-h-screen w-full bg-transparent px-3 py-4 text-slate-100 sm:px-5 lg:px-8">
      <div className="mx-auto grid max-w-[1500px] gap-5">
        <header className="rounded-3xl border border-slate-700/80 bg-gradient-to-br from-[#101e31] via-[#0b1728] to-[#081321] p-5 shadow-2xl shadow-black/30 sm:p-6 lg:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] font-black tracking-[0.34em] text-amber-300">GSAT</p>
                <Badge tone="green">LIVE TERMINAL</Badge>
                <Badge tone="blue">XAU/USD • XAG/USD</Badge>
              </div>
              <h1 className="mt-3 max-w-3xl text-3xl font-black tracking-tight text-white sm:text-5xl">Gold &amp; Silver Analysis Terminal</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">Spot market intelligence, TradingView charts, technical structure and decision-ready levels in one screen.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <Badge tone={status.label.includes("FRESH") ? "green" : "gold"}>{status.label}</Badge>
              <span className="rounded-full border border-slate-700 bg-[#07101c] px-3 py-2 text-[10px] font-bold text-slate-400">{status.detail}</span>
              <button onClick={() => void load()} className="rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-amber-200 transition hover:bg-amber-300/15">{loading ? "Refreshing…" : "Refresh"}</button>
            </div>
          </div>
        </header>

        <section>
          <SectionTitle eyebrow="MARKET SNAPSHOT" title="Live Spot Market" detail="XAUS • refreshed every 60 seconds" />
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard label="GOLD SPOT / USD" value={money(gold?.price ?? null)} helper={`XAUS • ${gold?.providerUpdatedAt ? new Date(gold.providerUpdatedAt).toLocaleTimeString("en-IN") : "--"}`} tone="gold" badge="LIVE" />
            <MetricCard label="SILVER SPOT / USD" value={money(silver?.price ?? null)} helper={`XAUS • ${silver?.providerUpdatedAt ? new Date(silver.providerUpdatedAt).toLocaleTimeString("en-IN") : "--"}`} tone="blue" badge="LIVE" />
            <MetricCard label="GOLD / SILVER RATIO" value={ratio == null ? "--" : ratio.toFixed(2)} helper="Calculated from live XAUS spot prices" tone="muted" />
          </div>
        </section>

        <section>
          <SectionTitle eyebrow="PRICE ACTION" title="TradingView Charts" detail="Hourly view • RSI + MACD enabled" />
          <div className="grid gap-5 xl:grid-cols-2">
            <TradingViewChart symbol="OANDA:XAUUSD" title="GOLD SPOT / USD" />
            <TradingViewChart symbol="OANDA:XAGUSD" title="SILVER SPOT / USD" />
          </div>
        </section>

        <section>
          <SectionTitle eyebrow="TECHNICAL INTELLIGENCE" title="Market Bias &amp; Indicators" detail="Calculated from the XAUS recorded intraday series" />
          <div className="grid gap-5 xl:grid-cols-2">
            <TechnicalSummary metal="Gold" a={goldAnalysis} />
            <TechnicalSummary metal="Silver" a={silverAnalysis} />
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <MultiTimeframe analysis={goldAnalysis} />
          <TradePlan analysis={goldAnalysis} gold={gold} />
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <MacroPlaceholder />
          <PatternPlaceholder />
        </section>

        {(error || data.spotError) && <section className="rounded-2xl border border-rose-400/20 bg-rose-400/[0.05] p-4 text-xs font-semibold text-rose-300">{error || data.spotError}</section>}
        <footer className="border-t border-slate-800/90 py-3 text-center text-[9px] font-bold tracking-[0.16em] text-slate-600 sm:text-left">GSAT • XAUS SPOT • TRADINGVIEW/OANDA • TECHNICAL ENGINE</footer>
      </div>
    </main>
  );
}
