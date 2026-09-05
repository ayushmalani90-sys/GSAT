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
type Level = { price: number; strength: number; touches: number; distancePct?: number };

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

type AnalysisResponse = {
  source?: string;
  generatedAt?: string;
  gold: { intraday: Analysis };
  silver: { intraday: Analysis };
  methodology?: { note?: string };
};

const money = (v: number | null) =>
  v != null && Number.isFinite(v)
    ? v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "--";

const levelPrice = (l: Level | number) => (typeof l === "number" ? l : l.price);
const levelStrength = (l: Level | number) => (typeof l === "number" ? null : l.strength);
const levelTouches = (l: Level | number) => (typeof l === "number" ? null : l.touches);

function dataTone(value: string) {
  if (/above|bull|buy|positive/i.test(value)) return "positive";
  if (/below|bear|sell|negative/i.test(value)) return "negative";
  return "neutral";
}

function TradingViewChart({ symbol, title, timeframe }: { symbol: string; title: string; timeframe: string }) {
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
      interval: timeframe,
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
      const current = document.getElementById(id);
      if (current) current.innerHTML = "";
    };
  }, [symbol, timeframe]);

  return (
    <section className="gsat-card gsat-chart-card">
      <div className="gsat-card-head">
        <div>
          <div className="gsat-kicker">{title}</div>
          <div className="gsat-card-subtitle">OANDA spot feed · {timeframe === "D" ? "1D" : timeframe === "W" ? "1W" : `${timeframe}m`} · RSI + MACD</div>
        </div>
        <span className="gsat-status-dot"><span /> LIVE</span>
      </div>
      <div id={`tv_${symbol.replace(/[^a-zA-Z0-9]/g, "_")}`} className="gsat-chart-frame" />
    </section>
  );
}

function SpotCard({ quote, accent }: { quote: Quote | undefined; accent: "gold" | "silver" }) {
  const change = quote?.changePercent;
  const tone = change != null ? (change >= 0 ? "positive" : "negative") : "neutral";
  const updated = quote?.providerUpdatedAt ? new Date(quote.providerUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--";

  return (
    <article className={`gsat-card gsat-spot-card ${accent}`}>
      <div className="gsat-spot-top">
        <div className="gsat-spot-name">
          <span className={`gsat-metal-mark ${accent}`}>{accent === "gold" ? "Au" : "Ag"}</span>
          <div>
            <div className="gsat-kicker">{accent === "gold" ? "GOLD" : "SILVER"}</div>
            <div className="gsat-card-subtitle">USD / troy oz · spot</div>
          </div>
        </div>
        <span className="gsat-live-pill">LIVE</span>
      </div>
      <div className="gsat-spot-price">${money(quote?.price ?? null)}</div>
      <div className="gsat-spot-bottom">
        <span className={`gsat-change ${tone}`}>{change == null ? "--" : `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`}</span>
        <span className="gsat-card-subtitle">Updated {updated}</span>
      </div>
    </article>
  );
}

function RatioCard({ gold, silver }: { gold: Quote | undefined; silver: Quote | undefined }) {
  const ratio = gold && silver && silver.price > 0 ? gold.price / silver.price : null;
  return (
    <article className="gsat-card gsat-spot-card ratio">
      <div className="gsat-spot-top">
        <div className="gsat-spot-name">
          <span className="gsat-metal-mark ratio">R</span>
          <div>
            <div className="gsat-kicker">GOLD / SILVER RATIO</div>
            <div className="gsat-card-subtitle">Relative spot value</div>
          </div>
        </div>
      </div>
      <div className="gsat-spot-price">{ratio == null ? "--" : ratio.toFixed(2)}×</div>
      <div className="gsat-card-subtitle">Gold spot ÷ silver spot</div>
    </article>
  );
}

function EmaCard({ label, value, relation, price }: { label: string; value: number | null; relation: string; price: number | null }) {
  const tone = dataTone(relation);
  return (
    <div className={`gsat-ema-card ${tone}`}>
      <div className="gsat-ema-head">
        <span>{label}</span>
        <span className={`gsat-mini-badge ${tone}`}>{relation || "--"}</span>
      </div>
      <div className="gsat-ema-value">{money(value)}</div>
      <div className="gsat-ema-sub">Current price ${money(price)}</div>
    </div>
  );
}

function LevelRow({ level, label, kind }: { level: Level | number; label: string; kind: "support" | "resistance" }) {
  return (
    <div className={`gsat-level-row ${kind}`}>
      <div>
        <div className="gsat-level-label">{label}</div>
        <div className="gsat-level-price">{money(levelPrice(level))}</div>
      </div>
      <div className="gsat-level-meta">
        <div>{levelStrength(level) != null ? `Strength ${levelStrength(level)}` : "Pivot"}</div>
        <div>{levelTouches(level) != null ? `${levelTouches(level)} touches` : "Confirmed level"}</div>
      </div>
    </div>
  );
}

function TechnicalCard({ metal, analysis, timeframe }: { metal: string; analysis: Analysis | null; timeframe: string }) {
  if (!analysis) {
    return (
      <article className="gsat-card gsat-tech-card">
        <div className="gsat-kicker">{metal.toUpperCase()} ANALYSIS</div>
        <div className="gsat-loading">Loading technical analysis…</div>
      </article>
    );
  }

  const bias = analysis.overall?.bias || analysis.ema.bias || "Mixed";
  const supports = analysis.supportResistance.supports.slice(0, 3);
  const resistances = analysis.supportResistance.resistances.slice(0, 3);

  return (
    <article className="gsat-card gsat-tech-card">
      <div className="gsat-card-head">
        <div>
          <div className="gsat-kicker">{metal.toUpperCase()} TECHNICAL ANALYSIS</div>
          <div className="gsat-card-subtitle">EMA 20 / 50 / 200 · {timeframe} timeframe</div>
        </div>
        <span className={`gsat-bias ${dataTone(bias)}`}>{bias}</span>
      </div>

      <div className="gsat-ema-grid">
        <EmaCard label="EMA 20" value={analysis.ema.ema20} relation={analysis.ema.priceVsEma20} price={analysis.price} />
        <EmaCard label="EMA 50" value={analysis.ema.ema50} relation={analysis.ema.priceVsEma50} price={analysis.price} />
        <EmaCard label="EMA 200" value={analysis.ema.ema200} relation={analysis.ema.priceVsEma200} price={analysis.price} />
      </div>

      {analysis.ema.interpretation ? <div className="gsat-note">{analysis.ema.interpretation}</div> : null}

      <div className="gsat-level-columns">
        <div>
          <div className="gsat-section-label support">SUPPORT</div>
          <div className="gsat-level-list">
            {supports.length ? supports.map((level, i) => <LevelRow key={`s-${i}-${levelPrice(level)}`} level={level} label={`S${i + 1}`} kind="support" />) : <div className="gsat-empty">No confirmed support</div>}
          </div>
        </div>
        <div>
          <div className="gsat-section-label resistance">RESISTANCE</div>
          <div className="gsat-level-list">
            {resistances.length ? resistances.map((level, i) => <LevelRow key={`r-${i}-${levelPrice(level)}`} level={level} label={`R${i + 1}`} kind="resistance" />) : <div className="gsat-empty">No confirmed resistance</div>}
          </div>
        </div>
      </div>

      <div className="gsat-momentum-grid">
        <div className="gsat-momentum-card">
          <div className="gsat-section-label">RSI 14</div>
          <div className="gsat-momentum-value">{analysis.momentum.rsi14 == null ? "--" : analysis.momentum.rsi14.toFixed(2)}</div>
          <div className={`gsat-momentum-badge ${dataTone(analysis.momentum.rsiBias)}`}>{analysis.momentum.rsiBias}</div>
        </div>
        <div className="gsat-momentum-card">
          <div className="gsat-section-label">MACD 12 / 26 / 9</div>
          <div className="gsat-momentum-value">{analysis.momentum.macd == null ? "--" : analysis.momentum.macd.toFixed(4)}</div>
          <div className={`gsat-momentum-badge ${dataTone(analysis.momentum.macdBias)}`}>{analysis.momentum.macdBias}</div>
          <div className="gsat-momentum-meta">Signal {analysis.momentum.macdSignal == null ? "--" : analysis.momentum.macdSignal.toFixed(4)} · Histogram {analysis.momentum.macdHistogram == null ? "--" : analysis.momentum.macdHistogram.toFixed(4)}</div>
        </div>
      </div>
    </article>
  );
}

const TIMEFRAMES = [
  { label: "15m", value: "15", hours: 48 },
  { label: "1H", value: "60", hours: 96 },
  { label: "4H", value: "240", hours: 168 },
  { label: "1D", value: "D", hours: 168 },
  { label: "1W", value: "W", hours: 168 },
] as const;

export default function Home() {
  const [data, setData] = useState<QuoteResponse>({ quotes: [], updatedAt: "" });
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [timeframe, setTimeframe] = useState<(typeof TIMEFRAMES)[number]>(TIMEFRAMES[1]);

  const load = useCallback(async (hours = timeframe.hours) => {
    try {
      setLoading(true);
      setError("");
      const q = await fetch(`/api/quotes?fresh=${Date.now()}`, { cache: "no-store" });
      if (!q.ok) throw new Error("Live spot request failed");
      const qData = await q.json();
      setData(qData);

      const a = await fetch(`/api/analysis?hours=${hours}&fresh=${Date.now()}`, { cache: "no-store" });
      const aData = await a.json();
      if (!a.ok) throw new Error(aData?.error || "Technical analysis unavailable");
      setAnalysis(aData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Live market data unavailable");
    } finally {
      setLoading(false);
    }
  }, [timeframe.hours]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60000);
    return () => window.clearInterval(timer);
  }, [load]);

  const statusText = useMemo(() => {
    if (!data.quotes.length) return "DATA WAITING";
    const timestamps = data.quotes.filter((q) => q.providerUpdatedAt).map((q) => Date.parse(q.providerUpdatedAt as string));
    if (!timestamps.length) return "DATA LIVE";
    const latest = Math.max(...timestamps);
    return Date.now() - latest <= 90000 ? "DATA FRESH" : "DATA STALE";
  }, [data.quotes]);

  const gold = data.quotes.find((q) => q.label === "Gold");
  const silver = data.quotes.find((q) => q.label === "Silver");
  const goldAnalysis = analysis?.gold.intraday ?? null;
  const silverAnalysis = analysis?.silver.intraday ?? null;

  return (
    <main className="gsat-shell">
      <header className="gsat-header">
        <div>
          <div className="gsat-brand-row"><span className="gsat-brand">GSAT</span><span className="gsat-status-dot"><span /> LIVE</span></div>
          <h1>Gold &amp; Silver Analysis Terminal</h1>
          <p>Live spot prices and systematic technical analysis.</p>
        </div>
        <div className="gsat-header-right">
          <div className="gsat-update">{statusText} · {timeframe.label}</div>
          <button className="gsat-refresh" onClick={() => void load()}>{loading ? "Refreshing…" : "Refresh"}</button>
        </div>
      </header>

      <section className="gsat-section">
        <div className="gsat-section-heading">
          <div><div className="gsat-kicker">MARKET SNAPSHOT</div><h2>Spot Prices</h2></div>
          <div className="gsat-card-subtitle">USD per troy ounce</div>
        </div>
        <div className="gsat-grid-3">
          <SpotCard quote={gold} accent="gold" />
          <SpotCard quote={silver} accent="silver" />
          <RatioCard gold={gold} silver={silver} />
        </div>
      </section>

      <section className="gsat-section">
        <div className="gsat-section-heading">
          <div><div className="gsat-kicker">TIMEFRAME</div><h2>Chart Interval</h2></div>
          <div className="gsat-card-subtitle">Chart and GSAT calculations update together</div>
        </div>
        <div className="gsat-timeframe-bar">
          {TIMEFRAMES.map((item) => (
            <button
              key={item.label}
              className={`gsat-timeframe-btn ${timeframe.label === item.label ? "active" : ""}`}
              onClick={() => {
                setTimeframe(item);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <section className="gsat-section">
        <div className="gsat-section-heading">
          <div><div className="gsat-kicker">MARKET CHARTS</div><h2>TradingView</h2></div>
          <div className="gsat-card-subtitle">{timeframe.label} · OANDA spot · RSI + MACD</div>
        </div>
        <div className="gsat-grid-2">
          <TradingViewChart symbol="OANDA:XAUUSD" title="GOLD · XAU/USD" timeframe={timeframe.value} />
          <TradingViewChart symbol="OANDA:XAGUSD" title="SILVER · XAG/USD" timeframe={timeframe.value} />
        </div>
      </section>

      <section className="gsat-section">
        <div className="gsat-section-heading">
          <div><div className="gsat-kicker">TECHNICAL ENGINE</div><h2>EMA Analysis</h2></div>
          <div className="gsat-card-subtitle">EMA 20 / 50 / 200 · RSI 14 · MACD 12/26/9 · {timeframe.label}</div>
        </div>
        {error ? <div className="gsat-error">{error}</div> : null}
        <div className="gsat-grid-2">
          <TechnicalCard metal="Gold" analysis={goldAnalysis} timeframe={timeframe.label} />
          <TechnicalCard metal="Silver" analysis={silverAnalysis} timeframe={timeframe.label} />
        </div>
      </section>

      <footer className="gsat-footer">GSAT · Spot data via XAUS · Technical calculations from the selected intraday window</footer>
    </main>
  );
}
