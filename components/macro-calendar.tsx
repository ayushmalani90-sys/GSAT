"use client";

import { useEffect, useState } from "react";

type MacroEvent={id:string;name:string;shortName:string;impact:string;releaseAtUtc:string;releaseAtIst:string;previous:number|string|null;forecast:number|string|null;actual:number|string|null;unit?:string;status:string;goldBias:string|null;silverBias:string|null;explanation:string};

export default function MacroCalendar(){
  const [events,setEvents]=useState<MacroEvent[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  useEffect(()=>{let alive=true;fetch(`/api/macro?fresh=${Date.now()}`,{cache:"no-store"}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d?.error||"Macro data unavailable");if(alive)setEvents(d.events||[]);}).catch(e=>alive&&setError(e instanceof Error?e.message:"Macro data unavailable")).finally(()=>alive&&setLoading(false));return()=>{alive=false}},[]);
  return <section className="gsat-section"><div className="gsat-section-heading"><div><div className="gsat-kicker">MACRO INTELLIGENCE</div><h2>High-Impact U.S. Economic Calendar</h2></div><div className="gsat-card-subtitle">Upcoming releases · IST</div></div><div className="gsat-card gsat-tech-card">{loading?<div className="gsat-loading">Loading macro calendar…</div>:error?<div className="gsat-error">{error}</div>:<div className="gsat-analysis-grid">{events.map(e=><div className="gsat-subcard" key={e.id}><div className="gsat-card-head"><div><div className="gsat-kicker">{e.shortName}</div><div className="gsat-card-subtitle">{e.name}</div></div><span className={`gsat-bias ${e.impact==="VERY HIGH"?"negative":"neutral"}`}>{e.impact}</span></div><div className="gsat-subcard-value">{e.releaseAtIst}</div><div className="gsat-inline-row"><span>Previous</span><strong>{e.previous??"--"}{e.previous!=null&&e.unit?` ${e.unit}`:""}</strong></div><div className="gsat-inline-row"><span>Forecast</span><strong>{e.forecast??"--"}{e.forecast!=null&&e.unit?` ${e.unit}`:""}</strong></div><div className="gsat-inline-row"><span>Actual</span><strong>{e.actual??"--"}{e.actual!=null&&e.unit?` ${e.unit}`:""}</strong></div><div className="gsat-inline-row"><span>Gold</span><strong>{e.goldBias??"Pending actual"}</strong></div><div className="gsat-inline-row"><span>Silver</span><strong>{e.silverBias??"Pending actual"}</strong></div><div className="gsat-note">{e.explanation}</div></div>)}</div>}</div></section>;
}
