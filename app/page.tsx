"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, ArrowDownRight, ArrowUpRight, BarChart3, CircleDollarSign, Globe2, RefreshCw, ShieldAlert } from "lucide-react";

type Quote = { symbol: string; label: string; price: number; changePercent: number | null };

export default function Home() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/quotes", { cache: "no-store" });
      if (!response.ok) throw new Error("Live market data unavailable");
      const data = await response.json();
      setQuotes(Array.isArray(data.quotes) ? data.quotes : []);
      setUpdatedAt(data.updatedAt || new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Live market data unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 60_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const find = (label: string) => quotes.find((quote) => quote.label === label);
  const featured = [find("Gold"), find("Silver")].filter(Boolean) as Quote[];
  const watchlist = [find("DXY"), find("USD/INR"), find("Brent"), find("VIX")].filter(Boolean) as Quote[];

  return (
    <main className="min-h-screen bg-[#070707] px-4 py-4 text-zinc-100 md:px-6 lg:px-8">
      <div className="mx-auto max-w-[1600px] space-y-4">
        <header className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-[#0d0d0d] p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-3"><div className="rounded-xl bg-amber-300/10 p-2 text-amber-300"><Activity size={20} /></div><div><p className="font-semibold tracking-[0.28em] text-amber-300">GSAT</p><h1 className="text-xl font-semibold md:text-2xl">GOLD & SILVER WAR ROOM</h1></div></div>
            <p className="mt-2 text-xs text-zinc-500">Free live market-data test build • no paid API key</p>
          </div>
          <div className="flex items-center gap-3"><div className="rounded-xl border border-zinc-800 bg-black/30 px-4 py-3 text-xs"><p className="text-zinc-500">LAST REFRESH</p><p className="mt-1 font-mono">{updatedAt ? new Date(updatedAt).toLocaleTimeString("en-IN") : "--"}</p></div><button onClick={refresh} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-200 hover:bg-amber-300/15"><RefreshCw size={16} className={loading ? "animate-spin" : ""} />Refresh</button></div>
        </header>

        {error && <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">{error}. Automatic retry remains active.</div>}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {featured.map((quote) => { const up = (quote.changePercent ?? 0) >= 0; return <article key={quote.symbol} className="rounded-2xl border border-zinc-800 bg-[#0d0d0d] p-5"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold tracking-[0.18em] text-zinc-400">{quote.label.toUpperCase()}</p><p className="mt-1 text-xs text-zinc-600">{quote.symbol}</p></div><CircleDollarSign size={18} className="text-amber-300" /></div><div className="mt-5 flex items-end justify-between gap-4"><p className="font-mono text-3xl font-semibold">${quote.price.toFixed(2)}</p><span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 font-mono text-xs ${up ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-red-500/30 bg-red-500/10 text-red-400"}`}>{up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{quote.changePercent == null ? "--" : `${quote.changePercent.toFixed(2)}%`}</span></div></article>; })}
          {featured.length === 0 && !loading && <article className="rounded-2xl border border-zinc-800 bg-[#0d0d0d] p-5 md:col-span-2 xl:col-span-4"><p className="text-sm text-zinc-500">No live quotes returned. Press Refresh to retry.</p></article>}
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.45fr_0.8fr_0.8fr]">
          <article className="min-h-[420px] rounded-2xl border border-zinc-800 bg-[#0d0d0d] p-5"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold tracking-[0.18em] text-zinc-400">MARKET CHART</p><h2 className="mt-1 text-lg font-semibold">Gold / Silver Price Action</h2></div><BarChart3 size={19} className="text-amber-300" /></div><div className="mt-6 flex h-[330px] items-center justify-center rounded-xl border border-dashed border-zinc-800 bg-black/20 text-center"><div><BarChart3 className="mx-auto text-zinc-700" size={42} /><p className="mt-3 text-sm font-medium text-zinc-500">Chart integration comes after deployment verification</p><p className="mt-1 text-xs text-zinc-700">First target: reliable live quotes on Vercel.</p></div></div></article>
          <article className="rounded-2xl border border-zinc-800 bg-[#0d0d0d] p-5"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold tracking-[0.18em] text-zinc-400">MARKET STATUS</p><h2 className="mt-1 text-lg font-semibold">Live Feed</h2></div><Globe2 size={18} className="text-amber-300" /></div><div className="mt-7 flex items-center justify-center"><div className="flex h-40 w-40 items-center justify-center rounded-full border-[12px] border-amber-300/50 bg-amber-300/5"><div className="text-center"><p className="font-mono text-3xl font-semibold">{quotes.length}</p><p className="text-[10px] tracking-[0.2em] text-zinc-500">QUOTES</p></div></div></div><div className="mt-7 rounded-xl border border-zinc-800 bg-black/20 p-4 text-xs text-zinc-500">Quotes are requested from the GSAT server route and refreshed automatically.</div></article>
          <article className="rounded-2xl border border-zinc-800 bg-[#0d0d0d] p-5"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold tracking-[0.18em] text-zinc-400">SIGNAL</p><h2 className="mt-1 text-lg font-semibold">WAIT</h2></div><ShieldAlert size={18} className="text-amber-300" /></div><div className="mt-6 rounded-xl border border-amber-300/20 bg-amber-300/5 p-4"><p className="text-xs text-zinc-500">MODE</p><p className="mt-1 font-mono text-2xl font-semibold text-amber-300">TEST</p></div><p className="mt-4 text-sm leading-6 text-zinc-500">No technical signal is generated until the live feed is confirmed stable.</p></article>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-[#0d0d0d] p-5"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold tracking-[0.18em] text-zinc-400">MACRO WATCHLIST</p><h2 className="mt-1 text-lg font-semibold">Free Market Drivers</h2></div><span className="text-[10px] tracking-[0.18em] text-zinc-600">LIVE</span></div><div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{watchlist.map((quote) => { const up = (quote.changePercent ?? 0) >= 0; return <div key={quote.symbol} className="rounded-xl border border-zinc-800 bg-black/20 p-4"><p className="text-xs font-semibold tracking-[0.14em] text-zinc-500">{quote.label.toUpperCase()}</p><div className="mt-2 flex items-baseline justify-between"><span className="font-mono text-lg">{quote.price.toFixed(2)}</span><span className={`font-mono text-xs ${up ? "text-red-400" : "text-emerald-400"}`}>{quote.changePercent == null ? "--" : `${quote.changePercent.toFixed(2)}%`}</span></div></div>; })}</div>{watchlist.length === 0 && !loading && <p className="mt-4 text-sm text-zinc-500">Macro quotes are temporarily unavailable.</p>}</section>

        <footer className="border-t border-zinc-900 pt-3 text-[10px] tracking-[0.14em] text-zinc-600">GSAT • WAR ROOM V0.1 • LIVE FREE DATA TEST</footer>
      </div>
    </main>
  );
}
