import { Activity, ArrowDownRight, ArrowUpRight, BarChart3, CalendarDays, CircleDollarSign, Globe2, Newspaper, ShieldAlert, Sparkles } from "lucide-react";

const prices = [
  { name: "GOLD", market: "MCX", value: "₹98,520", change: "+0.82%", up: true },
  { name: "SILVER", market: "MCX", value: "₹1,12,300", change: "+1.24%", up: true },
  { name: "GOLD SPOT", market: "XAU/USD", value: "$3,348.40", change: "+0.41%", up: true },
  { name: "SILVER SPOT", market: "XAG/USD", value: "$38.22", change: "-0.18%", up: false },
];

const watchlist = [
  ["DXY", "98.42", "+0.12%"],
  ["USD/INR", "87.08", "+0.06%"],
  ["BRENT", "$66.18", "-0.31%"],
  ["US10Y", "4.29%", "+0.04%"],
  ["VIX", "18.72", "-1.06%"],
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#070707] px-4 py-4 text-zinc-100 md:px-6 lg:px-8">
      <div className="mx-auto max-w-[1600px] space-y-4">
        <header className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-[#0d0d0d] p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-amber-300/10 p-2 text-amber-300"><Sparkles size={20} /></div>
              <div>
                <p className="font-semibold tracking-[0.28em] text-amber-300">GSAT</p>
                <h1 className="text-xl font-semibold tracking-tight md:text-2xl">GOLD & SILVER WAR ROOM</h1>
              </div>
            </div>
            <p className="mt-2 text-xs text-zinc-500">Decision terminal • free-data architecture • live integrations staged next</p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
            <div className="rounded-xl border border-zinc-800 bg-black/30 px-4 py-3"><p className="text-zinc-500">MARKET</p><p className="mt-1 font-medium text-emerald-400">OPEN / MONITOR</p></div>
            <div className="rounded-xl border border-zinc-800 bg-black/30 px-4 py-3"><p className="text-zinc-500">LAST REFRESH</p><p className="mt-1 font-mono">22:41 IST</p></div>
            <div className="col-span-2 rounded-xl border border-zinc-800 bg-black/30 px-4 py-3 sm:col-span-1"><p className="text-zinc-500">ENGINE</p><p className="mt-1 font-medium text-amber-300">BUILD v0.1</p></div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {prices.map((item) => (
            <article key={item.name} className="rounded-2xl border border-zinc-800 bg-[#0d0d0d] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.01)]">
              <div className="flex items-center justify-between"><div><p className="text-xs font-semibold tracking-[0.18em] text-zinc-400">{item.name}</p><p className="mt-1 text-xs text-zinc-600">{item.market}</p></div><CircleDollarSign className="text-amber-300" size={18} /></div>
              <div className="mt-5 flex items-end justify-between gap-4"><div><p className="font-mono text-2xl font-semibold tracking-tight">{item.value}</p><p className="mt-1 text-[11px] text-zinc-600">Illustrative placeholder until live feed</p></div><span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 font-mono text-xs ${item.up ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-red-500/30 bg-red-500/10 text-red-400"}`}>{item.up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{item.change}</span></div>
            </article>
          ))}
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.55fr_0.8fr_0.8fr]">
          <article className="min-h-[420px] rounded-2xl border border-zinc-800 bg-[#0d0d0d] p-5">
            <div className="flex items-start justify-between"><div><p className="text-xs font-semibold tracking-[0.18em] text-zinc-400">MARKET CHART</p><h2 className="mt-1 text-lg font-semibold">Gold / Silver Price Action</h2></div><BarChart3 size={19} className="text-amber-300" /></div>
            <div className="mt-6 flex h-[330px] items-center justify-center rounded-xl border border-dashed border-zinc-800 bg-black/20 text-center">
              <div><BarChart3 className="mx-auto text-zinc-700" size={42} /><p className="mt-3 text-sm font-medium text-zinc-500">Chart engine reserved for live market feed</p><p className="mt-1 text-xs text-zinc-700">TradingView / free market-data adapter will be connected next</p></div>
            </div>
          </article>

          <article className="rounded-2xl border border-zinc-800 bg-[#0d0d0d] p-5">
            <div className="flex items-center justify-between"><div><p className="text-xs font-semibold tracking-[0.18em] text-zinc-400">MACRO SCORE</p><h2 className="mt-1 text-lg font-semibold">74 / 100</h2></div><Globe2 size={18} className="text-amber-300" /></div>
            <div className="mt-7 flex items-center justify-center"><div className="flex h-40 w-40 items-center justify-center rounded-full border-[14px] border-amber-300/70 bg-amber-300/5"><div className="text-center"><p className="font-mono text-4xl font-semibold">74</p><p className="text-[10px] tracking-[0.2em] text-zinc-500">BULLISH</p></div></div></div>
            <div className="mt-7 grid grid-cols-2 gap-3 text-xs"><div className="rounded-xl bg-black/20 p-3"><p className="text-zinc-500">DOLLAR</p><p className="mt-1 text-emerald-400">Favorable</p></div><div className="rounded-xl bg-black/20 p-3"><p className="text-zinc-500">RATES</p><p className="mt-1 text-amber-300">Watch</p></div><div className="rounded-xl bg-black/20 p-3"><p className="text-zinc-500">INFLATION</p><p className="mt-1 text-emerald-400">Supportive</p></div><div className="rounded-xl bg-black/20 p-3"><p className="text-zinc-500">RISK</p><p className="mt-1 text-zinc-300">Moderate</p></div></div>
          </article>

          <article className="rounded-2xl border border-zinc-800 bg-[#0d0d0d] p-5">
            <div className="flex items-center justify-between"><div><p className="text-xs font-semibold tracking-[0.18em] text-zinc-400">DECISION ENGINE</p><h2 className="mt-1 text-lg font-semibold">BUY</h2></div><ShieldAlert size={18} className="text-amber-300" /></div>
            <div className="mt-6 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4"><p className="text-xs text-zinc-500">CONFIDENCE</p><p className="mt-1 font-mono text-3xl font-semibold text-emerald-400">78%</p></div>
            <div className="mt-4 space-y-3 text-sm"><div className="flex justify-between"><span className="text-zinc-500">Bias</span><span className="text-emerald-400">Bullish</span></div><div className="flex justify-between"><span className="text-zinc-500">Risk</span><span>Moderate</span></div><div className="flex justify-between"><span className="text-zinc-500">Setup</span><span>Trend + Macro</span></div><div className="flex justify-between"><span className="text-zinc-500">Status</span><span className="text-amber-300">Simulation</span></div></div>
            <div className="mt-6 rounded-xl border border-zinc-800 bg-black/20 p-3 text-xs text-zinc-500">Signal is illustrative until the Technical + Macro engines consume live data.</div>
          </article>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-2xl border border-zinc-800 bg-[#0d0d0d] p-5">
            <div className="flex items-center justify-between"><div className="flex items-center gap-3"><Newspaper size={18} className="text-amber-300" /><div><p className="text-xs font-semibold tracking-[0.18em] text-zinc-400">NEWS INTELLIGENCE</p><h2 className="mt-1 text-lg font-semibold">Gold & Macro Feed</h2></div></div><span className="text-[10px] tracking-[0.18em] text-zinc-600">STAGED</span></div>
            <div className="mt-5 space-y-3">{["Fed path and real yields remain the key macro driver for bullion.", "Rupee direction can amplify or offset global gold moves for Indian buyers.", "Silver is showing higher beta versus gold in the current placeholder regime."].map((item, index) => <div key={item} className="rounded-xl border border-zinc-800 bg-black/20 p-4"><div className="flex items-center gap-2 text-[10px] tracking-[0.16em] text-zinc-600"><Activity size={12} /> MACRO {index + 1}</div><p className="mt-2 text-sm text-zinc-300">{item}</p></div>)}</div>
          </article>

          <article className="rounded-2xl border border-zinc-800 bg-[#0d0d0d] p-5">
            <div className="flex items-center gap-3"><CalendarDays size={18} className="text-amber-300" /><div><p className="text-xs font-semibold tracking-[0.18em] text-zinc-400">WATCHLIST</p><h2 className="mt-1 text-lg font-semibold">Macro Drivers</h2></div></div>
            <div className="mt-5 divide-y divide-zinc-800">{watchlist.map(([name, value, change]) => <div key={name} className="flex items-center justify-between py-3"><span className="text-sm font-medium">{name}</span><div className="flex items-center gap-4"><span className="font-mono text-sm">{value}</span><span className={`w-16 text-right font-mono text-xs ${change.startsWith("+") ? "text-red-400" : "text-emerald-400"}`}>{change}</span></div></div>)}</div>
          </article>
        </section>

        <footer className="flex flex-col gap-2 border-t border-zinc-900 pt-3 text-[10px] tracking-[0.14em] text-zinc-600 sm:flex-row sm:items-center sm:justify-between"><span>GSAT • WAR ROOM V1 • UI FOUNDATION</span><span>NO LIVE DATA CONNECTED YET • NEXT: FREE MARKET DATA + TECHNICAL ENGINE</span></footer>
      </div>
    </main>
  );
}
