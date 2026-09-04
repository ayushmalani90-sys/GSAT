export type TechnicalPoint = { t: string; p: number };
export type Level = { price: number; strength: number; touches: number };

export type TechnicalAnalysisV2 = {
  price: number | null;
  samples: number;
  ema: {
    ema20: number | null; ema50: number | null; ema200: number | null;
    priceVsEma20: string; priceVsEma50: string; priceVsEma200: string;
    bias: string; interpretation: string;
  };
  momentum: {
    rsi14: number | null; rsiBias: string;
    macd: number | null; macdSignal: number | null; macdHistogram: number | null;
    macdBias: string; interpretation: string;
  };
  supportResistance: { supports: Level[]; resistances: Level[]; method: string };
  overall: { bias: string; summary: string };
};

const round = (v: number) => Number(v.toFixed(2));

function ema(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let current = values.slice(0, period).reduce((a,b) => a+b, 0) / period;
  for (let i = period; i < values.length; i++) current = values[i] * k + current * (1-k);
  return current;
}

function rsi(values: number[], period = 14): number | null {
  if (values.length <= period) return null;
  let gain = 0, loss = 0;
  for (let i=1; i<=period; i++) { const d=values[i]-values[i-1]; gain += Math.max(d,0); loss += Math.max(-d,0); }
  let avgGain=gain/period, avgLoss=loss/period;
  for (let i=period+1; i<values.length; i++) { const d=values[i]-values[i-1]; avgGain=(avgGain*(period-1)+Math.max(d,0))/period; avgLoss=(avgLoss*(period-1)+Math.max(-d,0))/period; }
  if (avgLoss === 0) return 100;
  return 100 - 100/(1+avgGain/avgLoss);
}

function macd(values: number[]) {
  const series:number[]=[];
  for(let i=1;i<=values.length;i++){const f=ema(values.slice(0,i),12),s=ema(values.slice(0,i),26);if(f!=null&&s!=null)series.push(f-s);}
  if(!series.length)return{line:null,signal:null,histogram:null};
  const line=series.at(-1)??null; const signal=ema(series,9);
  return{line,signal,histogram:line!=null&&signal!=null?line-signal:null};
}

function supportResistance(values:number[],current:number){
  const tolerance=Math.max(Math.abs(current)*0.0015,0.5); const lows:number[]=[], highs:number[]=[];
  for(let i=2;i<values.length-2;i++){const v=values[i];const low=v<=values[i-1]&&v<=values[i-2]&&v<=values[i+1]&&v<=values[i+2];const high=v>=values[i-1]&&v>=values[i-2]&&v>=values[i+1]&&v>=values[i+2];if(low&&v<current)lows.push(v);if(high&&v>current)highs.push(v);}
  const cluster=(levels:number[],dir:"support"|"resistance")=>{const groups:number[][]=[];for(const v of [...levels].sort((a,b)=>dir==="support"?b-a:a-b)){const idx=groups.findIndex(g=>Math.abs(g[0]-v)<=tolerance);if(idx>=0)groups[idx].push(v);else groups.push([v]);}return groups.map(g=>{const price=g.reduce((a,b)=>a+b,0)/g.length;const touches=g.length;return{price:round(price),touches,strength:Math.min(100,45+touches*12)};}).sort((a,b)=>dir==="support"?b.price-a.price:a.price-b.price).slice(0,3);};
  return{supports:cluster(lows,"support"),resistances:cluster(highs,"resistance"),method:"Five-point swing pivots clustered by adaptive price tolerance; repeated pivots strengthen a level."};
}

export function analyzeV2(points:TechnicalPoint[]):TechnicalAnalysisV2{
  const values=points.map(p=>p.p).filter(Number.isFinite), price=values.at(-1)??null;
  const e20=ema(values,20),e50=ema(values,50),e200=ema(values,200);
  const rel=(e:number|null)=>e==null||price==null?"Unavailable":price>e?"Above":price<e?"Below":"At";
  const bull=[e20,e50,e200].filter(e=>price!=null&&e!=null&&price>e).length,bear=[e20,e50,e200].filter(e=>price!=null&&e!=null&&price<e).length;
  const bias=bull>=2?"Bullish EMA structure":bear>=2?"Bearish EMA structure":"Mixed EMA structure";
  const emaText=bias.startsWith("Bullish")?"Price is above most available EMAs, supporting an upside trend structure.":bias.startsWith("Bearish")?"Price is below most available EMAs, supporting a downside trend structure.":"Price is mixed around the available EMAs; trend conviction is limited.";
  const rr=rsi(values),m=macd(values); const rsiBias=rr==null?"Unavailable":rr>=70?"Overbought":rr<=30?"Oversold":rr>=55?"Bullish momentum":rr<=45?"Bearish momentum":"Neutral momentum";
  const macdBias=m.line==null||m.signal==null?"Unavailable":m.line>m.signal?"Bullish MACD":m.line<m.signal?"Bearish MACD":"Neutral MACD";
  const sr=price==null?{supports:[] as Level[],resistances:[] as Level[],method:"No price series available."}:supportResistance(values,price);
  const momentumScore=(rr==null?0:rr>=50?1:-1)+(m.line==null||m.signal==null?0:m.line>m.signal?1:-1);
  const overall=bull>=2&&momentumScore>=1?{bias:"Bullish",summary:"EMA trend and momentum are aligned bullishly."}:bear>=2&&momentumScore<=-1?{bias:"Bearish",summary:"EMA trend and momentum are aligned bearishly."}:{bias:"Mixed",summary:"Trend and momentum are not fully aligned."};
  return{price,samples:values.length,ema:{ema20:e20,ema50:e50,ema200:e200,priceVsEma20:rel(e20),priceVsEma50:rel(e50),priceVsEma200:rel(e200),bias,interpretation:emaText},momentum:{rsi14:rr,rsiBias,macd:m.line,macdSignal:m.signal,macdHistogram:m.histogram,macdBias,interpretation:`RSI: ${rsiBias}. MACD: ${macdBias}.`},supportResistance:sr,overall};
}
