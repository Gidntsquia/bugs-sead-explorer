import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CircleMarker } from "react-leaflet";
import { useApi } from "../useApi";
import { BaseMap } from "../components/BaseMap";
import { ErrorBox, Loading, Missing, fmt } from "../components/ui";
import { MIN_MCR, estimate, isGhost, localTerms, sliceAt, type Interval, type Mcr, type TMSample } from "../../../shared/timemachine";

type Payload = {
  site: { code: string; name: string; region: string | null; country: string | null; lat: number | null; lon: number | null };
  samples: TMSample[]; undated: number; oldestBP: number | null; youngestBP: number | null;
  taxa: Record<string, { name: string; family: string }>; mcr: Record<string, Mcr>; distrib: Record<string, string>;
  curve: { year: number; samples: number; n: number; status: string; summer: Interval | null; winter: Interval | null; nearSummer: Interval | null; k: number | null }[];
};
type SiteRow = { code: string; name: string; country: string; region: string | null; dated: number };

const iv = (i: Interval) => (i[0] === i[1] ? `${i[0]}` : `${i[0]} to ${i[1]}`);
const bp = (n: number) => `${fmt(n)} BP`;
// One ramp for the whole page: blue (<= 8 C) through pale sand (14 C) to orange (>= 20 C) on a summer midpoint; grey = no MCR.
const STOPS: [number, number, number][] = [[37, 99, 200], [226, 220, 205], [224, 92, 16]];
const tintRgb = (t: number) => {
  const x = Math.min(1, Math.max(0, (t - 8) / 12)) * 2, i = Math.min(1, Math.floor(x)), f = x - i;
  return STOPS[i].map((c, k) => Math.round(c + (STOPS[i + 1][k] - c) * f));
};
const tint = (t: number | null, a = 1) => {
  if (t == null) return `rgba(184, 176, 164, ${a})`;
  const [r, g, b] = tintRgb(t);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};
const pale = (t: number) => Math.abs(t - 14) < 3.5;
const mid = (m: Mcr) => (m.tMaxLo + m.tMaxHi) / 2;

export default function TimeMachine() {
  const [params, setParams] = useSearchParams();
  const site = params.get("site");
  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Time machine</h1>
      </div>
      <Chooser current={site} onPick={c => setParams({ site: c })} />
      {site && <SiteView key={site} code={site} startYear={Number(params.get("year")) || null} />}
    </div>
  );
}

function Chooser({ current, onPick }: { current: string | null; onPick: (c: string) => void }) {
  const { data } = useApi<SiteRow[]>("bugs/timemachine/sites");
  const [text, setText] = useState("");
  const shown = useMemo(() => {
    const t = text.trim().toLowerCase();
    if (!t || !data) return [];
    const hits = data.filter(s => `${s.name} ${s.country} ${s.region ?? ""}`.toLowerCase().includes(t));
    return [...hits.filter(s => s.name.toLowerCase().startsWith(t)), ...hits.filter(s => !s.name.toLowerCase().startsWith(t))].slice(0, 12);
  }, [data, text]);
  return (
    <div>
      <input value={text} onChange={e => setText(e.target.value)} placeholder={data ? `Search ${fmt(data.length)} sites with at least one dated sample` : "Loading sites…"}
        className="w-full border border-line bg-card px-3 py-2 text-sm" />
      {shown.length > 0 && (
        <ul className="border border-t-0 border-line bg-card text-sm">
          {shown.map(s => (
            <li key={s.code}>
              <button onClick={() => { onPick(s.code); setText(""); }} className={`w-full px-3 py-1.5 text-left hover:bg-paper ${s.code === current ? "font-medium" : ""}`}>
                {s.name} <span className="text-muted">{[s.region, s.country].filter(Boolean).join(", ")} · {s.dated} dated samples</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {text.trim() && data && shown.length === 0 && <p className="mt-1 text-sm text-muted">No site with dated samples matches “{text}”.</p>}
    </div>
  );
}

function SiteView({ code, startYear }: { code: string; startYear: number | null }) {
  const { data: d, error } = useApi<Payload>(`bugs/timemachine?site=${encodeURIComponent(code)}`);
  if (error) return <ErrorBox error={error} />;
  if (!d) return <Loading what="Loading site" />;
  const s = d.site;
  if (d.oldestBP == null || d.youngestBP == null)
    return <Missing>{s.name} has no dated samples, so there is nothing to slide through.</Missing>;
  return <Loaded d={d} startYear={startYear} />;
}


const Q = ({ tip }: { tip: string }) => <span title={tip} className="ml-1 inline-block h-4 w-4 cursor-help rounded-full border border-line text-center text-[10px] leading-[14px] text-muted">?</span>;
const INDICATIVE = "MCR covers 436 of 11,420 taxa; dates are mixed-precision.";
const GRID_RULE = (terms: string[]) => `Faded tiles: the beetle's recorded modern range never mentions ${terms.join(", ") || "the site's country"} (a text match, so check the tooltip). Tinted by summer temperature from MCR; grey = no MCR data.`;

const T_LO = -20, T_HI = 32;
function Thermometer({ est }: { est: ReturnType<typeof estimate> }) {
  const W = 56, H = 120, y = (t: number) => H - ((Math.min(T_HI, Math.max(T_LO, t)) - T_LO) / (T_HI - T_LO)) * H;
  const band = (x: number, i: Interval, fill: string, hatch: boolean) => (
    <rect x={x} y={y(i[1])} width={14} height={Math.max(3, y(i[0]) - y(i[1]))} fill={hatch ? "url(#hatch)" : fill} stroke={fill} strokeWidth={1.5} strokeDasharray={hatch ? "3 2" : undefined} rx={2} />
  );
  const tip = est.status === "none" ? `Only ${est.n} of ${MIN_MCR} MCR species: not enough for a temperature`
    : est.status === "ok" ? `${est.n} MCR species all agree`
    : `Best fit: ${est.k} of ${est.n} MCR species agree. Left out: ${est.excluded.join(", ")}`;
  return (
    <svg width={W} height={H + 4} viewBox={`0 -2 ${W} ${H + 4}`} role="img" aria-label="Temperature estimate">
      <title>{tip}</title>
      <defs><pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="#fff" /><line x1="0" y1="0" x2="0" y2="5" stroke="#c2410c" strokeWidth="2" /></pattern></defs>
      <line x1={9} x2={9} y1={0} y2={H} stroke="#d6cbb8" strokeWidth={2} />
      {[-10, 0, 10, 20, 30].map(t => <g key={t}><line x1={6} x2={12} y1={y(t)} y2={y(t)} stroke="#9a8d78" /><text x={0} y={y(t) + 3} fontSize={7} fill="#9a8d78" style={{ display: "none" }}>{t}</text></g>)}
      {est.status === "ok" && <>{band(20, est.summer, "#ea580c", false)}{band(38, est.winter, "#2563eb", false)}</>}
      {est.status === "nearmiss" && <>{band(20, est.agree, "#ea580c", true)}{est.winter && band(38, est.winter, "#2563eb", true)}</>}
      {est.status === "none" && <text x={34} y={H / 2 + 14} textAnchor="middle" fontSize={40} fill="#b8ab94">?</text>}
    </svg>
  );
}

function Loaded({ d, startYear }: { d: Payload; startYear: number | null }) {
  const s = d.site;
  const name = (c: string) => d.taxa[c]?.name ?? c;
  // Snap stops: every range boundary and range midpoint of every sample (each lies inside its own range, so every stop is covered), oldest first.
  const stops = useMemo(() => {
    const set = new Set<number>();
    for (const sa of d.samples) for (const r of sa.ranges) { set.add(r.older); set.add(r.younger); set.add(Math.round((r.older + r.younger) / 2)); }
    return [...set].sort((a, b) => b - a);
  }, [d.samples]);
  const nearestIdx = (y: number) => stops.reduce((b, v, i) => (Math.abs(v - y) < Math.abs(stops[b] - y) ? i : b), 0);
  const [idx, setIdx] = useState(() => nearestIdx(startYear ?? (stops[0] + stops[stops.length - 1]) / 2));
  const year = stops[idx];
  const oldest = stops[0], youngest = stops[stops.length - 1], span = Math.max(1, oldest - youngest);
  const pct = (y: number) => `${(100 * (oldest - y)) / span}%`;

  const slice = useMemo(() => sliceAt(year, d.samples), [year, d.samples]);
  const mcrCodes = slice.taxa.map(t => t.code).filter(c => d.mcr[c]);
  const est = useMemo(() => estimate(mcrCodes, d.mcr, name), [slice]); // eslint-disable-line react-hooks/exhaustive-deps
  const terms = localTerms(s.country, s.region);
  const heat = est.status === "ok" ? (est.summer[0] + est.summer[1]) / 2 : est.status === "nearmiss" ? (est.agree[0] + est.agree[1]) / 2 : null;

  // Strip: one row per sample (rows shared by samples that do not overlap), a segment per dating range.
  const strip = useMemo(() => {
    const items = d.samples.map(sa => {
      const e = estimate(sa.taxa.map(t => t.code).filter(c => d.mcr[c]), d.mcr, c => c);
      return { sa, older: Math.max(...sa.ranges.map(r => r.older)), younger: Math.min(...sa.ranges.map(r => r.younger)), heat: e.status === "ok" ? (e.summer[0] + e.summer[1]) / 2 : null };
    }).sort((a, b) => b.older - a.older);
    const rowEnd: number[] = [];
    return items.map(it => {
      let r = rowEnd.findIndex(e => it.older <= e); // a row is free once its last bar (older first) has ended
      if (r < 0) { r = rowEnd.length; rowEnd.push(it.younger); } else rowEnd[r] = it.younger;
      return { ...it, row: r };
    });
  }, [d.samples, d.mcr]);
  const rows = Math.max(1, ...strip.map(x => x.row + 1));
  const ticks = useMemo(() => {
    const step = [50, 100, 200, 250, 500, 1000, 2000, 5000].find(t => span / t <= 7) ?? 10000;
    const out: number[] = [];
    for (let t = Math.ceil(youngest / step) * step; t <= oldest; t += step) out.push(t);
    return out;
  }, [span, oldest, youngest]);

  const tiles = useMemo(() => {
    const t = slice.taxa.map(x => {
      const m = d.mcr[x.code];
      const dist = d.distrib[x.code];
      return { ...x, name: name(x.code), m, dist, ghost: !!dist && isGhost(dist, terms) };
    });
    const warm = t.filter(x => x.m).sort((a, b) => mid(b.m) - mid(a.m) || a.name.localeCompare(b.name));
    const rest = t.filter(x => !x.m).sort((a, b) => a.name.localeCompare(b.name));
    return [...warm, ...rest];
  }, [slice, d.mcr, d.distrib]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (i: number) => setIdx(Math.min(stops.length - 1, Math.max(0, i)));
  const fmtDepth = (sa: TMSample) => (sa.depthTop == null ? "no depth" : `depth ${sa.depthTop}${sa.depthBot != null && sa.depthBot !== sa.depthTop ? `–${sa.depthBot}` : ""}`);
  const barTip = (sa: TMSample) => `${sa.code}, ${fmtDepth(sa)}\n` + sa.ranges.map(r => `${r.kind}: ${fmt(r.younger)}–${fmt(r.older)} BP${r.detail ? ` (${r.detail})` : ""}`).join("\n");
  const summerLine = est.status === "none" ? `${est.n} of ${MIN_MCR} MCR species`
    : est.status === "ok" ? `Summer ${iv(est.summer)} °C · Winter ${iv(est.winter)} °C`
    : `Summer ${iv(est.agree)} °C${est.winter ? ` · Winter ${iv(est.winter)} °C` : ""}`;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-x-6">
        <div className="tab font-display text-5xl font-bold leading-none">{fmt(year)} <span className="text-xl font-medium text-muted">BP</span></div>
        <h2 className="font-display text-lg font-semibold"><Link to={`/map?bugs=${s.code}`} className="hover:underline">{s.name}</Link> <span className="text-sm font-normal text-muted">{[s.region, s.country].filter(Boolean).join(", ")}</span></h2>
      </div>

      <div>
        <div className="relative border border-line bg-card" style={{ height: rows * 12 + 10 }} data-testid="strip">
          {ticks.map(t => <div key={t} className="absolute inset-y-0 border-l border-dashed border-line" style={{ left: pct(t) }} />)}
          {strip.map(it => (
            <div key={it.sa.code} data-sample={it.sa.code} title={barTip(it.sa)} onClick={() => go(nearestIdx(Math.round((it.older + it.younger) / 2)))} className="cursor-pointer">
              {it.sa.ranges.map((r, i) => (
                <div key={i} className="absolute h-2.5 rounded-sm" style={{ left: pct(r.older), width: `max(3px, ${(100 * (r.older - r.younger)) / span}%)`, top: 5 + it.row * 12, background: tint(it.heat) }} />
              ))}
            </div>
          ))}
          <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-ink" style={{ left: pct(year), background: "#2b2118" }} />
          {d.undated > 0 && <span className="absolute right-1 top-0 bg-card/80 px-1 text-[10px] text-muted">{d.undated} undated</span>}
        </div>
        <div className="relative h-4 text-[10px] text-muted">
          {ticks.map(t => <span key={t} className="absolute -translate-x-1/2" style={{ left: pct(t) }}>{fmt(t)}</span>)}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => go(idx - 1)} disabled={idx === 0} aria-label="Older stop" className="border border-line px-2 py-0.5 disabled:opacity-30">‹</button>
          <input type="range" aria-label="Year" className="min-w-0 flex-1 accent-[#c2410c]" min={0} max={stops.length - 1} step={1} value={idx} onChange={e => go(Number(e.target.value))} />
          <button onClick={() => go(idx + 1)} disabled={idx === stops.length - 1} aria-label="Younger stop" className="border border-line px-2 py-0.5 disabled:opacity-30">›</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <Thermometer est={est} />
        <div>
          <div className="tab text-lg font-semibold" title={est.status === "nearmiss" ? `Best fit: ${est.k} of ${est.n} agree. Left out: ${est.excluded.join(", ")}` : undefined}>
            {summerLine}<Q tip={INDICATIVE} />
          </div>
          {est.status === "nearmiss" && <span className="border border-dashed border-line px-1.5 text-xs text-muted" title={`Left out: ${est.excluded.join(", ")}`}>best fit</span>}
          {est.status === "none" && <div className="mt-1 flex gap-1" title={`Only ${est.n} of ${MIN_MCR} MCR species`}>{Array.from({ length: MIN_MCR }, (_, i) => <span key={i} className="h-3 w-3 rounded-full border border-line" style={{ background: i < est.n ? "#9a8d78" : "transparent" }} />)}</div>}
        </div>
        {s.lat != null && s.lon != null && (
          <div className="ml-auto h-48 w-48 shrink-0 overflow-hidden border border-line">
            <BaseMap center={[s.lat, s.lon]} zoom={7} className="h-full w-full">
              <CircleMarker center={[s.lat, s.lon]} radius={8} pathOptions={{ color: "#fff", weight: 3, fillColor: tint(heat), fillOpacity: 1 }} />
            </BaseMap>
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Beetles in this slice<Q tip={GRID_RULE(terms)} /></h3>
        {tiles.length === 0 ? <Missing>No beetles at this year.</Missing> : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-1.5" data-testid="grid">
            {tiles.map(t => (
              <Link key={t.code} to={`/species/${t.code}`} data-ghost={t.ghost ? 1 : 0} data-mcr={t.m ? 1 : 0}
                title={`${t.name}\n${t.m ? `Summer ${t.m.tMaxLo}–${t.m.tMaxHi} °C today` : "No temperature data for this beetle"}${t.ghost ? `\nNot here today: ${t.dist}` : ""}`}
                className={`relative block min-h-14 px-2 py-1.5 text-sm italic ${t.m && !pale(mid(t.m)) ? "text-white" : "text-ink"} ${t.ghost ? "border border-dashed border-ink/60 opacity-45" : "border border-transparent"}`}
                style={{ background: tint(t.m ? mid(t.m) : null) }}>
                {t.name}
                <span className="absolute right-1 top-0.5 text-[10px] not-italic opacity-80">{fmt(t.n)}</span>
                {t.ghost && <span className="absolute bottom-0.5 right-1 text-[9px] not-italic">not here today</span>}
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
