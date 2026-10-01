import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Area, CartesianGrid, ComposedChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CircleMarker } from "react-leaflet";
import { useApi } from "../useApi";
import { T } from "../glossary";
import { BaseMap } from "../components/BaseMap";
import { Card, ErrorBox, Loading, Missing, fmt } from "../components/ui";
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
// cold blue (-5 C) to hot orange (25 C)
const tint = (t: number | null, a = 1) => {
  const x = Math.min(1, Math.max(0, ((t ?? 10) + 5) / 30));
  return `hsla(${x < 0.5 ? 215 : 20}, ${Math.round(15 + 65 * Math.abs(2 * x - 1))}%, 46%, ${a})`;
};
const era = (y: number) => (y >= 11700 ? "Pleistocene (Late Glacial)" : "Holocene");

export default function TimeMachine() {
  const [params, setParams] = useSearchParams();
  const site = params.get("site");
  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Time machine</h1>
        <p className="text-sm text-muted">Indicative only: <T k="mcr">MCR</T> covers 436 of 11,420 taxa and dates are mixed-precision.</p>
      </div>
      <Chooser current={site} onPick={c => setParams({ site: c })} />
      {site && <SiteView key={site} code={site} />}
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

function SiteView({ code }: { code: string }) {
  const { data: d, error } = useApi<Payload>(`bugs/timemachine?site=${encodeURIComponent(code)}`);
  const [year, setYear] = useState<number | null>(null);
  if (error) return <ErrorBox error={error} />;
  if (!d) return <Loading what="Loading site" />;
  const s = d.site;
  if (d.oldestBP == null || d.youngestBP == null)
    return <Missing>{s.name} has no dated samples, so there is nothing to slide through.</Missing>;
  return <Loaded d={d} year={year ?? Math.round((d.oldestBP + d.youngestBP) / 2 / 5) * 5} setYear={setYear} />;
}

function Loaded({ d, year, setYear }: { d: Payload; year: number; setYear: (y: number) => void }) {
  const s = d.site;
  const oldest = d.oldestBP!, youngest = d.youngestBP!;
  const name = (c: string) => d.taxa[c]?.name ?? c;
  const slice = useMemo(() => sliceAt(year, d.samples), [year, d.samples]);
  const mcrCodes = slice.taxa.map(t => t.code).filter(c => d.mcr[c]);
  const est = useMemo(() => estimate(mcrCodes, d.mcr, name), [slice]); // eslint-disable-line react-hooks/exhaustive-deps
  const terms = localTerms(s.country, s.region);
  const withDistrib = slice.taxa.filter(t => d.distrib[t.code]);
  const ghosts = withDistrib.filter(t => isGhost(d.distrib[t.code], terms));
  const noDistrib = slice.taxa.length - withDistrib.length;
  const anyMcr = Object.keys(d.mcr).length > 0;
  const nearest = d.curve.reduce((b, c) => (Math.abs(c.year - year) < Math.abs(b.year - year) ? c : b), d.curve[0]);
  const heat = est.status === "ok" ? (est.summer[0] + est.summer[1]) / 2 : est.status === "nearmiss" ? (est.agree[0] + est.agree[1]) / 2 : null;
  const chart = d.curve.map(c => ({ ...c, summerBand: c.summer, winterBand: c.winter, nearBand: c.nearSummer }));

  return (
    <>
      <div className="overflow-hidden border border-line" style={{ background: `linear-gradient(135deg, ${tint(heat, 0.28)}, ${tint(heat, 0.05)} 70%)`, transition: "background 400ms" }}>
        <div className="grid gap-0 md:grid-cols-[1fr_15rem]">
          <div className="p-4">
            <div className="text-xs uppercase tracking-widest text-muted">{era(year)}</div>
            <div className="tab font-display text-5xl font-bold leading-none sm:text-6xl">{fmt(year)} <span className="text-xl font-medium text-muted">BP</span></div>
            <h2 className="mt-2 font-display text-lg font-semibold"><Link to={`/map?bugs=${s.code}`} className="hover:underline">{s.name}</Link> <span className="text-sm font-normal text-muted">{[s.region, s.country].filter(Boolean).join(", ")}</span></h2>
            <div className="mt-3 flex flex-wrap gap-3">
              {est.status === "none"
                ? <div className="border border-dashed border-line px-3 py-2 text-sm text-muted">No temperature estimate<br />{est.n} of {MIN_MCR} MCR species</div>
                : <>
                    <div className="px-3 py-2 text-white" style={{ background: tint(est.status === "ok" ? (est.summer[0] + est.summer[1]) / 2 : (est.agree[0] + est.agree[1]) / 2) }}>
                      <div className="text-xs uppercase tracking-wide opacity-80">Summer{est.status === "nearmiss" ? " (best fit)" : ""}</div>
                      <div className="tab text-2xl font-bold">{iv(est.status === "ok" ? est.summer : est.agree)} °C</div>
                    </div>
                    {est.winter && <div className="px-3 py-2 text-white" style={{ background: tint((est.winter[0] + est.winter[1]) / 2) }}>
                      <div className="text-xs uppercase tracking-wide opacity-80">Winter</div>
                      <div className="tab text-2xl font-bold">{iv(est.winter)} °C</div>
                    </div>}
                  </>}
              <div className="px-3 py-2 text-sm"><div className="tab text-2xl font-bold">{slice.samples.length}</div>samples</div>
              <div className="px-3 py-2 text-sm"><div className="tab text-2xl font-bold">{slice.taxa.length}</div>beetle kinds</div>
            </div>
          </div>
          {s.lat != null && s.lon != null && (
            <div className="h-48 md:h-auto md:min-h-48">
              <BaseMap center={[s.lat, s.lon]} zoom={8} className="h-full w-full">
                <CircleMarker center={[s.lat, s.lon]} radius={9} pathOptions={{ color: "#fff", weight: 3, fillColor: tint(heat), fillOpacity: 1 }} />
              </BaseMap>
            </div>
          )}
        </div>
        <div className="px-4 pb-3">
          <input type="range" className="w-full accent-[#c2410c]" min={-oldest} max={-youngest} step={5} value={-year} onChange={e => setYear(-Number(e.target.value))} />
          <div className="flex justify-between text-xs text-muted"><span>{bp(oldest)} (oldest)</span><span><T k="bp">BP</T> = years before 1950</span><span>{bp(youngest)} (youngest)</span></div>
          <p className="mt-1 text-xs text-muted">{fmt(d.samples.length)} dated samples; {fmt(d.undated)} undated not shown. A sample is in a slice when any of its dates ranges over this year; a period label (e.g. “Late Glacial”) is used only when a sample has no radiocarbon or calendar date.</p>
        </div>
      </div>

      <Card title="Temperature over time" subtitle="click a point to move the slider there">
        {!anyMcr ? <Missing>None of the beetles found at {s.name} has MCR data, so there is no temperature curve.</Missing> : (
          <>
            <div className="h-80">
              <ResponsiveContainer>
                <ComposedChart data={chart} onClick={(e: any) => { if (e?.activeLabel != null) setYear(Number(e.activeLabel)); }}>
                  <defs>
                    <linearGradient id="gs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ea580c" stopOpacity={0.7} /><stop offset="1" stopColor="#fbbf24" stopOpacity={0.2} /></linearGradient>
                    <linearGradient id="gw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#60a5fa" stopOpacity={0.2} /><stop offset="1" stopColor="#1d4ed8" stopOpacity={0.65} /></linearGradient>
                  </defs>
                  <CartesianGrid stroke="#e3d9c6" strokeDasharray="2 4" />
                  <XAxis type="category" dataKey="year" tick={{ fontSize: 11 }} interval="preserveStartEnd" tickFormatter={v => fmt(v)} />
                  <YAxis tick={{ fontSize: 11 }} unit="°" />
                  <Tooltip content={<Tip />} />
                  <Area dataKey="summerBand" stroke="#c2410c" fill="url(#gs)" strokeWidth={2} isAnimationActive={false} connectNulls={false} />
                  <Area dataKey="winterBand" stroke="#2563eb" fill="url(#gw)" strokeWidth={2} isAnimationActive={false} connectNulls={false} />
                  <Area dataKey="nearBand" stroke="#c2410c" strokeDasharray="3 3" fill="none" isAnimationActive={false} connectNulls={false} />
                  <ReferenceLine x={nearest.year} stroke="#2b2118" strokeWidth={2} label={{ value: fmt(nearest.year), position: "top", fontSize: 11 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-muted">Orange = summer range, blue = winter range, dashed = best-agreeing summer range when species disagree. Gaps = fewer than {MIN_MCR} MCR species (or, for winter, no full overlap). Points are at each date boundary, evenly spaced in order, not by year (oldest left).</p>
          </>
        )}
      </Card>

      <Card title="Beetles found" subtitle={`${slice.samples.length} samples, ${slice.taxa.length} kinds of beetle in this slice`}>
        {slice.samples.length === 0 ? <Missing>No sample has a date range covering {bp(year)}.</Missing> : (
          <>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted"><th className="py-1">Sample</th><th>Depth</th><th>How it was dated</th></tr></thead>
              <tbody>
                {slice.samples.map(sa => (
                  <tr key={sa.code} className="border-t border-line align-top">
                    <td className="tab py-1 pr-3">{sa.code}</td>
                    <td className="pr-3">{sa.depthTop == null ? "–" : `${sa.depthTop}${sa.depthBot != null && sa.depthBot !== sa.depthTop ? `–${sa.depthBot}` : ""}`}</td>
                    <td>{sa.ranges.map((r, i) => <div key={i} className={year <= r.older && year >= r.younger ? "" : "text-muted"}>{r.kind}: {fmt(r.younger)}–{fmt(r.older)} BP{r.detail ? ` (${r.detail})` : ""}</div>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 max-h-72 space-y-0.5 overflow-y-auto text-sm">
              {(() => { const top = [...slice.taxa].sort((a, b) => b.n - a.n); const mx = top[0]?.n || 1; return top.map(t => (
                <div key={t.code} className="relative flex justify-between gap-2 px-1.5 py-0.5">
                  <div className="absolute inset-y-0 left-0" style={{ width: `${Math.max(2, (100 * t.n) / mx)}%`, background: d.mcr[t.code] ? "hsla(20,75%,50%,0.22)" : "hsla(35,20%,50%,0.15)" }} />
                  <Link to={`/species/${t.code}`} className="relative italic text-link hover:underline">{name(t.code)}{d.mcr[t.code] && <span className="ml-1 not-italic text-[10px] text-muted">MCR</span>}</Link><span className="tab relative text-muted">{fmt(t.n)}</span>
                </div>)); })()}
            </div>
            <p className="mt-1 text-xs text-muted">Counts are individuals summed over the samples above.</p>
          </>
        )}
      </Card>

      <Card title="Temperature then" subtitle="from beetles that live in a narrow band of temperatures today">
        {est.status === "none" && <p className="text-sm">Not enough MCR species ({est.n} of {MIN_MCR}){est.n > 0 && <span className="text-muted"> — found: {est.species.join(", ")}</span>}</p>}
        {est.status === "ok" && (
          <>
            <p className="text-lg"><T k="tmax">Summer</T> {iv(est.summer)} °C, <T k="tmin">Winter</T> {iv(est.winter)} °C <span className="text-sm text-muted">from {est.n} MCR species</span></p>
            <p className="mt-1 text-sm italic text-muted">{est.species.join(", ")}</p>
          </>
        )}
        {est.status === "nearmiss" && (
          <>
            <p className="text-lg">No full overlap; {est.k} of {est.n} species agree on {iv(est.agree)} °C {est.basis === "summer" ? "in summer" : "for the summer–winter range"}</p>
            {est.winter && <p className="text-sm">Winter for those {est.k}: {iv(est.winter)} °C</p>}
            <p className="mt-1 text-sm text-muted">Left out: <span className="italic">{est.excluded.join(", ")}</span></p>
          </>
        )}
        <p className="mt-2 text-xs text-muted">Needs at least {MIN_MCR} MCR species. Summer = where all species’ warmest-month ranges overlap; winter = summer minus the overlap of their summer–winter ranges.</p>
      </Card>

      <Card title="Beetles no longer living here" subtitle={`${ghosts.length} of ${withDistrib.length} with a recorded modern range`}>
        {ghosts.length === 0 ? <Missing>None flagged in this slice.</Missing> : (
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            {ghosts.map(t => (
              <li key={t.code} className="border border-dashed border-line bg-paper/60 p-2.5 opacity-90">
                <div><span className="mr-1">👻</span><Link to={`/species/${t.code}`} className="italic text-link hover:underline">{name(t.code)}</Link></div>
                <div className="mt-1 text-xs text-muted">{d.distrib[t.code]}</div>
                <Link to={`/species/${t.code}`} className="mt-1 inline-block text-xs text-link hover:underline">see distribution</Link>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted">{fmt(noDistrib)} taxa have no modern distribution recorded. Flagged when the distribution text never mentions {terms.join(", ") || "the site’s country"}; it is a text match, so read it yourself.</p>
      </Card>

    </>
  );
}

function Tip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const c = payload[0].payload;
  return (
    <div className="border border-line bg-card p-2 text-xs">
      <div className="font-semibold">{bp(c.year)}</div>
      <div>{c.samples} samples, {c.n} MCR species</div>
      {c.summer && <div>Summer {iv(c.summer)} °C, winter {iv(c.winter)} °C</div>}
      {c.nearSummer && <div>No full overlap: {c.k} agree on {iv(c.nearSummer)} °C summer</div>}
      {!c.summer && !c.nearSummer && <div>Not enough MCR species</div>}
    </div>
  );
}
