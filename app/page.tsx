export default function Home() {
  return (
    <main className="min-h-screen bg-[#070707] p-6 text-zinc-100">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-2xl border border-zinc-800 bg-[#0d0d0d] p-6">
          <p className="text-sm font-semibold tracking-[0.3em] text-amber-300">GSAT</p>
          <h1 className="mt-2 text-3xl font-semibold">Gold & Silver War Room</h1>
          <p className="mt-2 text-sm text-zinc-500">Live free-market-data test build</p>
        </header>
        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[
            ["Gold", "GC=F"],
            ["Silver", "SI=F"],
            ["DXY", "DX-Y.NYB"],
            ["USD/INR", "USDINR=X"],
            ["Brent", "BZ=F"],
            ["VIX", "^VIX"],
          ].map(([label, symbol]) => (
            <article key={symbol} className="rounded-2xl border border-zinc-800 bg-[#0d0d0d] p-5">
              <p className="text-xs tracking-[0.2em] text-zinc-500">{label}</p>
              <p className="mt-3 font-mono text-2xl text-zinc-200">--</p>
              <p className="mt-1 text-xs text-zinc-600">{symbol}</p>
            </article>
          ))}
        </section>
        <section className="grid gap-4 lg:grid-cols-2">
          <article className="min-h-80 rounded-2xl border border-zinc-800 bg-[#0d0d0d] p-5">
            <p className="text-xs tracking-[0.2em] text-zinc-500">CHART</p>
            <div className="mt-4 flex h-64 items-center justify-center rounded-xl border border-dashed border-zinc-800 text-sm text-zinc-600">Live chart placeholder</div>
          </article>
          <article className="min-h-80 rounded-2xl border border-zinc-800 bg-[#0d0d0d] p-5">
            <p className="text-xs tracking-[0.2em] text-zinc-500">MACRO / SIGNAL</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-black/20 p-4"><p className="text-xs text-zinc-500">Macro score</p><p className="mt-2 font-mono text-2xl">--</p></div>
              <div className="rounded-xl bg-black/20 p-4"><p className="text-xs text-zinc-500">Signal</p><p className="mt-2 font-mono text-2xl">WAIT</p></div>
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
