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
  const chart = d.curve.map(c => ({ ...c, summerBand: c.summer, winterBand: c.winter, nearBand: c.nearSummer }));

  return (
    <>
      {s.lat != null && s.lon != null && (
        <div className="h-48 border border-line">
          <BaseMap center={[s.lat, s.lon]} zoom={8} className="h-full w-full">
            <CircleMarker center={[s.lat, s.lon]} radius={8} pathOptions={{ color: "#2b2118", weight: 2, fillColor: "#c2410c", fillOpacity: 0.9 }} />
          </BaseMap>
        </div>
      )}
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-xl font-semibold"><Link to={`/map?bugs=${s.code}`} className="hover:underline">{s.name}</Link> <span className="text-sm font-normal text-muted">{[s.region, s.country].filter(Boolean).join(", ")}</span></h2>
          <div className="tab text-lg font-semibold">{bp(year)}</div>
        </div>
        <input type="range" className="mt-2 w-full" min={-oldest} max={-youngest} step={5} value={-year} onChange={e => setYear(-Number(e.target.value))} />
        <div className="flex justify-between text-xs text-muted"><span>{bp(oldest)} (oldest)</span><span><T k="bp">BP</T> = years before 1950</span><span>{bp(youngest)} (youngest)</span></div>
        <p className="mt-1 text-xs text-muted">{fmt(d.samples.length)} dated samples; {fmt(d.undated)} undated samples not shown. A sample is in a slice when any of its dates ranges over this year; a period label (e.g. “Late Glacial”) is used only when a sample has no radiocarbon or calendar date.</p>
      </div>

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
            <div className="mt-3 max-h-60 columns-2 gap-6 overflow-y-auto text-sm">
              {[...slice.taxa].sort((a, b) => b.n - a.n).map(t => (
                <div key={t.code} className="flex justify-between gap-2 break-inside-avoid"><Link to={`/species/${t.code}`} className="italic text-link hover:underline">{name(t.code)}</Link><span className="tab text-muted">{fmt(t.n)}</span></div>
              ))}
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
          <ul className="space-y-2 text-sm">
            {ghosts.map(t => (
              <li key={t.code}><Link to={`/species/${t.code}`} className="italic text-link hover:underline">{name(t.code)}</Link> — {d.distrib[t.code]} <Link to={`/species/${t.code}`} className="text-link hover:underline">see distribution</Link></li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted">{fmt(noDistrib)} taxa have no modern distribution recorded. Flagged when the distribution text never mentions {terms.join(", ") || "the site’s country"}; it is a text match, so read it yourself.</p>
      </Card>

      <Card title="Temperature over time" subtitle="click a point to move the slider there">
        {!anyMcr ? <Missing>None of the beetles found at {s.name} has MCR data, so there is no temperature curve.</Missing> : (
          <>
            <div className="h-72">
              <ResponsiveContainer>
                <ComposedChart data={chart} onClick={(e: any) => { if (e?.activeLabel != null) setYear(Number(e.activeLabel)); }}>
                  <CartesianGrid stroke="#e3d9c6" />
                  <XAxis type="category" dataKey="year" tick={{ fontSize: 11 }} interval="preserveStartEnd" tickFormatter={v => fmt(v)} />
                  <YAxis tick={{ fontSize: 11 }} unit="°" />
                  <Tooltip content={<Tip />} />
                  <Area dataKey="summerBand" stroke="#c2410c" fill="#c2410c" fillOpacity={0.25} isAnimationActive={false} connectNulls={false} />
                  <Area dataKey="winterBand" stroke="#2563eb" fill="#2563eb" fillOpacity={0.25} isAnimationActive={false} connectNulls={false} />
                  <Area dataKey="nearBand" stroke="#c2410c" strokeDasharray="3 3" fill="none" isAnimationActive={false} connectNulls={false} />
                  <ReferenceLine x={nearest.year} stroke="#2b2118" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-muted">Orange = summer range, blue = winter range, dashed = best-agreeing summer range when species disagree. Gaps = fewer than {MIN_MCR} MCR species (or, for winter, no full overlap). Points are at each date boundary, evenly spaced in order, not by year (oldest left).</p>
          </>
        )}
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
