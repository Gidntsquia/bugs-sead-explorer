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
};
type Today = { julyMean: number; years: string; source: string } | null;
type SiteRow = { code: string; name: string; country: string; region: string | null; dated: number };

const iv = (i: Interval) => (i[0] === i[1] ? `${i[0]}` : `${i[0]} to ${i[1]}`);
const bp = (n: number) => `${fmt(n)} BP`;
// One ramp for the whole page: blue (<= 8 C) through pale sand (14 C) to orange (>= 20 C) on a summer midpoint; grey = no MCR.
const STOPS: [number, number, number, number][] = [[8, 37, 99, 200], [11, 120, 170, 230], [14, 246, 226, 130], [17, 240, 160, 70], [20, 214, 74, 12]];
const tintRgb = (t: number) => {
  const x = Math.min(20, Math.max(8, t));
  const i = Math.min(STOPS.length - 2, STOPS.findIndex((st, k) => x <= STOPS[k + 1][0] && k < STOPS.length - 1));
  const [t0, ...c0] = STOPS[i], [t1, ...c1] = STOPS[i + 1], f = (x - t0) / (t1 - t0);
  return c0.map((c, k) => Math.round(c + (c1[k] - c) * f));
};
const tint = (t: number | null, a = 1) => {
  if (t == null) return `rgba(184, 176, 164, ${a})`;
  const [r, g, b] = tintRgb(t);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};
const pale = (t: number) => t > 11.5 && t < 17.5;
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
  const today = useApi<Today>(`bugs/today?site=${encodeURIComponent(code)}`);
  if (error) return <ErrorBox error={error} />;
  if (!d || today.loading) return <Loading what="Loading site" />;
  const s = d.site;
  if (d.oldestBP == null || d.youngestBP == null)
    return <Missing>{s.name} has no dated samples, so there is nothing to slide through.</Missing>;
  return <Loaded d={d} today={today.data} startYear={startYear} />;
}


const Q = ({ tip }: { tip: string }) => <span title={tip} className="ml-1 inline-block h-4 w-4 cursor-help rounded-full border border-line text-center text-[10px] leading-[14px] text-muted">?</span>;
const PLACES: [string, number][] = [["Longyearbyen", 6], ["Nuuk", 8], ["Reykjavík", 11], ["Tromsø", 12], ["Anchorage", 15], ["Edinburgh", 15], ["Oslo", 17], ["Helsinki", 18], ["London", 19], ["Moscow", 19], ["Toronto", 22], ["Madrid", 25], ["Beijing", 27], ["Cairo", 29], ["Dubai", 34]];
// Nearest July mean wins; a tie goes to the colder place.
const place = (t: number) => PLACES.reduce((b, p) => (Math.abs(p[1] - t) < Math.abs(b[1] - t) || (Math.abs(p[1] - t) === Math.abs(b[1] - t) && p[1] < b[1]) ? p : b));
const COLD = 12, WARM = 16;
const bin = (t: number) => (t < COLD ? 0 : t > WARM ? 2 : 1);
const BIN_NAMES = ["Cold-loving", "Mild", "Warm-loving", "No temperature data"];
const BIN_TEXT = ["Mostly cold-loving beetles", "Mostly mild beetles", "Mostly warm-loving beetles"];
const BIN_CENTRE = [6, 14, 20];
// Summer midpoint of an estimate (a range-basis near-miss still has all summers agreeing).
function summerMid(e: ReturnType<typeof estimate>, codes: string[], mcr: Record<string, Mcr>): number | null {
  if (e.status === "none") return null;
  if (e.status === "ok") return (e.summer[0] + e.summer[1]) / 2;
  if (e.basis === "summer") return (e.agree[0] + e.agree[1]) / 2;
  const lo = Math.max(...codes.map(c => mcr[c].tMaxLo)), hi = Math.min(...codes.map(c => mcr[c].tMaxHi));
  return (lo + hi) / 2;
}
const INDICATIVE = "MCR covers 436 of 11,420 taxa; dates are mixed-precision.";
const GRID_RULE = (terms: string[]) => `Faded tiles: the beetle's recorded modern range never mentions ${terms.join(", ") || "the site's country"} (a text match, so check the tooltip). Tinted by summer temperature from MCR; grey = no MCR data.`;

function Loaded({ d, today, startYear }: { d: Payload; today: Today; startYear: number | null }) {
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
  const heat = summerMid(est, mcrCodes, d.mcr);

  // Tiles into fixed bins by the taxon's own summer midpoint.
  const tiles = useMemo(() => {
    const t = slice.taxa.map(x => {
      const m = d.mcr[x.code];
      const dist = d.distrib[x.code];
      return { ...x, name: name(x.code), m, dist, ghost: !!dist && isGhost(dist, terms) };
    });
    const cols: typeof t[] = [[], [], [], []];
    for (const x of t) cols[x.m ? bin(mid(x.m)) : 3].push(x);
    for (let i = 0; i < 3; i++) cols[i].sort((a, b) => mid(a.m) - mid(b.m) || a.name.localeCompare(b.name));
    cols[3].sort((a, b) => a.name.localeCompare(b.name));
    return cols;
  }, [slice, d.mcr, d.distrib]); // eslint-disable-line react-hooks/exhaustive-deps

  // Headline: warmer or colder than today, or the biggest bin when there is no estimate.
  const big = tiles[0].length === 0 && tiles[1].length === 0 && tiles[2].length === 0 ? -1
    : [0, 1, 2].reduce((b, i) => (tiles[i].length > tiles[b].length ? i : b), 0);
  const useNumber = heat != null && today != null;
  const diff = useNumber ? Math.round(heat! - today!.julyMean) : 0;
  const same = useNumber && Math.abs(heat! - today!.julyMean) < 1;
  const line2 = !useNumber ? (big < 0 ? "No beetles with temperature data" : BIN_TEXT[big])
    : same ? "About the same as today" : `${Math.abs(diff)} °C ${diff < 0 ? "colder" : "warmer"} than today`;
  const bgT = useNumber ? heat : big >= 0 ? BIN_CENTRE[big] : null;
  const pl = useNumber ? place(heat!) : null;
  const winter = est.status === "ok" ? est.winter : est.status === "nearmiss" ? est.winter : null;
  const line2Tip = !useNumber
    ? est.status === "none" ? `Fewer than ${MIN_MCR} beetles with temperature data (${est.n} of ${MIN_MCR})` : "Today's climate unavailable"
    : [`Summer then ${iv(est.status === "ok" ? est.summer : est.status === "nearmiss" ? est.agree : [0, 0])} °C`, `today ${today!.julyMean} °C (${today!.years})`,
       `${est.n} beetle kinds with temperature data`, winter ? `winter then ${iv(winter)} °C` : "", est.status === "nearmiss" ? `Left out: ${est.excluded.join(", ")}` : ""].filter(Boolean).join(" · ");
  const dark = bgT == null || !pale(bgT) ? "text-white" : "text-ink";

  // Strip: one row per sample, each bar tinted by that sample's own estimate.
  const strip = useMemo(() => {
    const items = d.samples.map(sa => {
      const codes = sa.taxa.map(t => t.code).filter(c => d.mcr[c]);
      const e = estimate(codes, d.mcr, c => c);
      return { sa, older: Math.max(...sa.ranges.map(r => r.older)), younger: Math.min(...sa.ranges.map(r => r.younger)), heat: summerMid(e, codes, d.mcr) };
    }).sort((a, b) => b.older - a.older);
    const rowEnd: number[] = [];
    return items.map(it => {
      let r = rowEnd.findIndex(e => it.older <= e); // a row is free once its last bar (older first) has ended
      if (r < 0) { r = rowEnd.length; rowEnd.push(it.younger); } else rowEnd[r] = it.younger;
      return { ...it, row: r };
    });
  }, [d.samples, d.mcr]);
  const rows = Math.max(1, ...strip.map(x => x.row + 1));
  const ends = useMemo(() => {
    let w: (typeof strip)[number] | null = null, c: (typeof strip)[number] | null = null;
    for (const code of d.samples.map(x => x.code)) {
      const it = strip.find(x => x.sa.code === code)!;
      if (it.heat == null) continue;
      if (!w || it.heat > w.heat!) w = it;
      if (!c || it.heat < c.heat!) c = it;
    }
    return w && c && w !== c ? { w, c } : null;
  }, [strip, d.samples]);
  const ticks = useMemo(() => {
    const step = [50, 100, 200, 250, 500, 1000, 2000, 5000].find(t => span / t <= 7) ?? 10000;
    const out: number[] = [];
    for (let t = Math.ceil(youngest / step) * step; t <= oldest; t += step) out.push(t);
    return out;
  }, [span, oldest, youngest]);

  const go = (i: number) => setIdx(Math.min(stops.length - 1, Math.max(0, i)));
  const jump = (it: (typeof strip)[number]) => go(nearestIdx(Math.round((it.older + it.younger) / 2)));
  const fmtDepth = (sa: TMSample) => (sa.depthTop == null ? "no depth" : `depth ${sa.depthTop}${sa.depthBot != null && sa.depthBot !== sa.depthTop ? `–${sa.depthBot}` : ""}`);
  const barTip = (sa: TMSample, h: number | null) => `${sa.code}, ${fmtDepth(sa)}${h != null ? `, summer ~${Math.round(h)} °C` : ""}\n` + sa.ranges.map(r => `${r.kind}: ${fmt(r.younger)}–${fmt(r.older)} BP${r.detail ? ` (${r.detail})` : ""}`).join("\n");
  const endLabel = (it: (typeof strip)[number], text: string) => (
    <button key={text} onClick={() => jump(it)} className="absolute -translate-x-1/2 whitespace-nowrap text-[11px] font-medium text-ink underline decoration-dotted"
      style={{ left: pct(Math.round((it.older + it.younger) / 2)) }}>{text}</button>
  );

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-x-6">
        <h2 className="font-display text-lg font-semibold"><Link to={`/map?bugs=${s.code}`} className="hover:underline">{s.name}</Link> <span className="text-sm font-normal text-muted">{[s.region, s.country].filter(Boolean).join(", ")}</span><Q tip={INDICATIVE} /></h2>
      </div>

      <div data-testid="headline" className={`px-6 py-5 ${dark}`} style={{ background: tint(bgT) }}>
        <div className="tab text-lg font-medium opacity-90">{fmt(year)} BP</div>
        <div className="font-display text-4xl font-bold leading-tight" title={line2Tip} data-testid="line2">
          {line2}{est.status === "nearmiss" && useNumber && <span className="ml-3 border border-dashed border-current px-1.5 align-middle text-xs font-normal">best fit</span>}
        </div>
        {pl && <div className="text-lg opacity-90" title={`${pl[0]} July mean ${pl[1]} °C`}>Summers like {pl[0]} today</div>}
      </div>

      <div>
        <div className="relative h-4">{ends && <>{endLabel(ends.w, "warmest")}{endLabel(ends.c, "coldest")}</>}</div>
        <div className="relative border border-line bg-card" style={{ height: rows * 12 + 10 }} data-testid="strip">
          {ticks.map(t => <div key={t} className="absolute inset-y-0 border-l border-dashed border-line" style={{ left: pct(t) }} />)}
          {strip.map(it => (
            <div key={it.sa.code} data-sample={it.sa.code} title={barTip(it.sa, it.heat)} onClick={() => jump(it)} className="cursor-pointer">
              {it.sa.ranges.map((r, i) => (
                <div key={i} className="absolute h-2.5 rounded-sm" style={{ left: pct(r.older), width: `max(3px, ${(100 * (r.older - r.younger)) / span}%)`, top: 5 + it.row * 12, background: tint(it.heat) }} />
              ))}
            </div>
          ))}
          <div className="pointer-events-none absolute inset-y-0 w-0.5" style={{ left: pct(year), background: "#2b2118" }} />
          {d.undated > 0 && <span className="absolute right-1 top-0 bg-card/80 px-1 text-[10px] text-muted">{d.undated} undated</span>}
        </div>
        <div className="relative h-4 text-[10px] text-muted">
          {ticks.map(t => <span key={t} className="absolute -translate-x-1/2" style={{ left: pct(t) }}>{fmt(t)}</span>)}
          {today && <span className="absolute right-0 top-0 font-medium text-ink" title={`July mean ${today.years}`}>today {today.julyMean} °C</span>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => go(idx - 1)} disabled={idx === 0} aria-label="Older stop" className="border border-line px-2 py-0.5 disabled:opacity-30">‹</button>
          <input type="range" aria-label="Year" className="min-w-0 flex-1 accent-[#c2410c]" min={0} max={stops.length - 1} step={1} value={idx} onChange={e => go(Number(e.target.value))} />
          <button onClick={() => go(idx + 1)} disabled={idx === stops.length - 1} aria-label="Younger stop" className="border border-line px-2 py-0.5 disabled:opacity-30">›</button>
        </div>
      </div>

      <div className="grid grid-cols-4 items-start gap-2" data-testid="grid">
        {tiles.map((col, ci) => (
          <div key={ci} data-col={ci} className="min-w-0 space-y-1.5">
            <h3 className="border-b border-line pb-1 text-sm font-semibold">{BIN_NAMES[ci]} · {col.length}{ci === 0 && <Q tip={GRID_RULE(terms)} />}</h3>
            {col.map(t => (
              <Link key={t.code} to={`/species/${t.code}`} data-ghost={t.ghost ? 1 : 0} data-mcr={t.m ? 1 : 0} data-mid={t.m ? mid(t.m) : ""}
                title={`${t.name}\n${t.m ? `Summer ${t.m.tMaxLo}–${t.m.tMaxHi} °C today` : "No temperature data for this beetle"}${t.ghost ? `\nNot here today: ${t.dist}` : ""}`}
                className={`relative block min-h-14 px-2 py-1.5 text-sm italic ${t.m && !pale(mid(t.m)) ? "text-white" : "text-ink"} ${t.ghost ? "border border-dashed border-ink/60 opacity-45" : "border border-transparent"}`}
                style={{ background: tint(t.m ? mid(t.m) : null) }}>
                {t.name}
                <span className="absolute right-1 top-0.5 text-[10px] not-italic opacity-80">{fmt(t.n)}</span>
                {t.ghost && <span className="absolute bottom-0.5 right-1 text-[9px] not-italic">not here today</span>}
              </Link>
            ))}
          </div>
        ))}
      </div>

      {s.lat != null && s.lon != null && (
        <div className="h-40 w-64 overflow-hidden border border-line">
          <BaseMap center={[s.lat, s.lon]} zoom={7} className="h-full w-full">
            <CircleMarker center={[s.lat, s.lon]} radius={8} pathOptions={{ color: "#fff", weight: 3, fillColor: tint(bgT), fillOpacity: 1 }} />
          </BaseMap>
        </div>
      )}
    </>
  );
}
