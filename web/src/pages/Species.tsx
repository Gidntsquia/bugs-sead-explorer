import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CircleMarker, Tooltip as LTooltip, useMap } from "react-leaflet";
import L from "leaflet";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api";
import { useApi } from "../useApi";
import { T } from "../glossary";
import { BaseMap } from "../components/BaseMap";
import { AgeList, type AgeItem } from "../components/Ages";
import { Card, ErrorBox, Expandable, Loading, Missing, Stat, fmt } from "../components/ui";
import { AGE_BINS, describeRange, yearsAgo } from "../ages";

type Suggestion = { code: number; family: string; genus: string; species: string; records: number };
const titleCase = (s: string) => (s ?? "").charAt(0) + (s ?? "").slice(1).toLowerCase();

export default function Species() {
  const { code } = useParams();
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <SpeciesSearch />
      {code ? <TaxonView key={code} code={code} /> : <Examples />}
    </div>
  );
}

function Examples() {
  return (
    <ul className="mt-6 space-y-1 text-sm">
      <li><Link className="italic text-link underline" to="/species/7.005001">Helophorus rufipes</Link></li>
      <li><Link className="italic text-link underline" to="/species/85.019044">Aphodius prodromus</Link></li>
      <li><Link className="italic text-link underline" to="/species/91.024002">Dryocoetinus villosus</Link></li>
      <li><Link className="italic text-link underline" to="/species/53.0200013">Prostomis mandibularis</Link></li>
    </ul>
  );
}

function SpeciesSearch() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (q.trim().length < 2) { setItems([]); return; }
    const ctl = new AbortController();
    const t = setTimeout(() => api<Suggestion[]>(`bugs/taxa?q=${encodeURIComponent(q)}`, ctl.signal).then(r => { setItems(r); setActive(0); setOpen(true); }).catch(() => {}), 150);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const pick = (s: Suggestion) => { nav(`/species/${s.code}`); setQ(`${s.genus} ${s.species}`); setOpen(false); };
  return (
    <div ref={box} className="relative max-w-xl">
      <input autoFocus value={q} onChange={e => setQ(e.target.value)} onFocus={() => items.length && setOpen(true)}
        onKeyDown={e => {
          if (e.key === "ArrowDown") { setActive(a => Math.min(a + 1, items.length - 1)); e.preventDefault(); }
          else if (e.key === "ArrowUp") { setActive(a => Math.max(a - 1, 0)); e.preventDefault(); }
          else if (e.key === "Enter" && items[active]) pick(items[active]);
          else if (e.key === "Escape") setOpen(false);
        }}
        placeholder="e.g. Helophorus rufipes" className="w-full rounded-lg border border-line bg-card px-4 py-3 text-lg shadow-sm outline-none focus:border-ink/50" />
      {open && q.trim().length >= 2 && (
        <ul className="absolute z-[1200] mt-1 max-h-96 w-full overflow-auto rounded-lg border border-line bg-card shadow-lg">
          {items.length === 0 && <li className="px-4 py-2 text-sm text-muted">No taxon in BugsCEP matches “{q}”.</li>}
          {items.map((s, i) => (
            <li key={s.code}>
              <button onMouseEnter={() => setActive(i)} onClick={() => pick(s)} className={`flex w-full items-baseline gap-2 px-4 py-2 text-left ${i === active ? "bg-paper" : ""}`}>
                <span className="italic">{s.genus} {s.species}</span>
                <span className="text-xs text-muted">{titleCase(s.family)}</span>
                <span className="ml-auto text-xs tabular-nums text-muted">{s.records ? `${fmt(s.records)} fossil records` : "never found as fossil"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TaxonView({ code }: { code: string }) {
  const { data: d, error, loading } = useApi<any>(`bugs/taxon/${encodeURIComponent(code)}`);
  if (loading) return <Loading what="Loading species" />;
  if (error) return <div className="mt-6"><ErrorBox error={error} /></div>;
  if (!d) return null;
  const t = d.taxon;
  const vague = /indet|spp?\.?$|\//.test(t.species);
  return (
    <div className="mt-6 space-y-5">
      <div>
        <h2 className="font-display text-3xl font-semibold"><i>{t.genus} {t.species}</i> <span className="text-lg font-normal text-muted">{t.authority}</span></h2>
        <p className="text-muted">
          <T k="family">Family</T> {titleCase(t.family)} · BugsCEP code {String(t.code)}
          {d.synonyms.length > 0 && <> · also published as <i>{d.synonyms.slice(0, 4).join(", ")}</i></>}
        </p>
        {vague && <p className="mt-1 text-sm text-muted">This is not a single species: <T k="indet">indet. / spp. / sp.</T> or a slash means the fossils could only be narrowed down to a group.</p>}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat tone="bugs" label={<><T k="site">sites</T> where found</>} value={d.siteCount} />
        <Stat tone="bugs" label={<><T k="sample">samples</T> containing it</>} value={d.sampleCount} />
        <Stat tone="bugs" label={<><T k="abundance">individuals</T> counted</>} value={d.sites.reduce((a: number, s: any) => a + (s.individuals ?? 0), 0)} />
        <Stat tone="bugs" label="samples with a date" value={d.datedSampleCount} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Where it was found" subtitle="Fossil finds by site. Bigger dots = more individuals.">
          {d.sites.length ? (
            <>
              <div className="h-80 overflow-hidden rounded-lg"><SitesMap sites={d.sites} /></div>
              <Expandable label={`List of ${d.sites.length} sites`}>
                <table className="mt-1 w-full"><tbody>{d.sites.map((s: any) => (
                  <tr key={s.code} className="border-t border-line/60"><td className="py-0.5"><Link className="text-link hover:underline" to={`/map?bugs=${s.code}`}>{s.name}</Link> <span className="text-xs text-muted">{s.country}</span></td><td className="text-right tabular-nums">{s.individuals} ind. / {s.samples} samples</td></tr>
                ))}</tbody></table>
              </Expandable>
            </>
          ) : <Missing>This taxon is in BugsCEP's species list but has never been recorded as a fossil at any site.</Missing>}
        </Card>

        <Card title="When it was found" subtitle={<>Age of the dated samples it was found in, as years ago. Each sample is counted once.</>}>
          <WhenChart ages={d.ages} />
        </Card>

        <Card title="Where it lives today" subtitle={<>Its <T k="habitat">habitat groups</T> — the kinds of place this species needs.</>}>
          {d.habitats.length ? (
            <ul className="space-y-2">
              {d.habitats.map((h: any) => (
                <li key={h.code} className="rounded-lg bg-bugs-soft/50 px-3 py-2 text-sm"><b>{h.label}</b> — {h.notes || h.definition}</li>
              ))}
            </ul>
          ) : <Missing>No habitat group is recorded for this taxon in BugsCEP.</Missing>}
          {d.distribution.length > 0 && (
            <Expandable label={`Modern distribution notes (${d.distribution.length})`}>
              <ul className="mt-1 space-y-1">{d.distribution.map((x: any, i: number) => <li key={i}><span className="text-muted">{x.ref}:</span> {x.text}</li>)}</ul>
            </Expandable>
          )}
          {d.biology.length > 0 && (
            <Expandable label={`How it lives — notes from the literature (${d.biology.length})`}>
              <ul className="mt-1 space-y-1">{d.biology.map((x: any, i: number) => <li key={i}><span className="text-muted">{x.ref}:</span> {x.text}</li>)}</ul>
            </Expandable>
          )}
          {d.lengths.length > 0 && <p className="mt-2 text-sm text-muted">Body length: {d.lengths.map((l: any) => `${l.measure} ${Math.round(Number(l.value) * 10) / 10} ${l.units}`).join(", ")}</p>}
        </Card>

        <Card title="Temperature range" subtitle={<>From <T k="mcr">MCR</T>: the temperatures of the places this species lives in today.</>}>
          {d.mcr ? <MCRChart m={d.mcr} /> : <Missing>No temperature range exists for this taxon. BugsCEP only has one for 436 well-studied species, so this doesn't mean it has no preference, just that nobody has measured it.</Missing>}
        </Card>
      </div>
    </div>
  );
}

function SitesMap({ sites }: { sites: any[] }) {
  const pts = sites.filter(s => s.lat != null && s.lon != null && !(s.lat === 0 && s.lon === 0));
  const max = Math.max(1, ...pts.map(s => s.individuals ?? 1));
  return (
    <BaseMap className="h-full w-full">
      {pts.map(s => (
        <CircleMarker key={s.code} center={[s.lat, s.lon]} radius={4 + 10 * Math.sqrt((s.individuals ?? 1) / max)} pathOptions={{ color: "#fff", weight: 1, fillColor: "#c2410c", fillOpacity: 0.8 }}>
          <LTooltip>{s.name}: {s.individuals} individuals in {s.samples} samples</LTooltip>
        </CircleMarker>
      ))}
      <Fit pts={pts} />
    </BaseMap>
  );
}

function Fit({ pts }: { pts: { lat: number; lon: number }[] }) {
  const map = useMap();
  useEffect(() => {
    if (!pts.length) return;
    map.fitBounds(L.latLngBounds(pts.map(p => [p.lat, p.lon] as [number, number])).pad(0.3), { maxZoom: 7 });
  }, [pts, map]);
  return null;
}

function WhenChart({ ages }: { ages: AgeItem[] }) {
  const { bins, bySample, summary } = useMemo(() => {
    // one age per sample: the most precise (narrowest) one available
    const best = new Map<string, AgeItem>();
    for (const a of ages) {
      if (a.olderBP == null) continue;
      const w = a.olderBP - (a.youngerBP ?? a.olderBP), cur = best.get(a.sampleCode ?? a.sample ?? "");
      if (!cur || w < cur.olderBP! - (cur.youngerBP ?? cur.olderBP!)) best.set(a.sampleCode ?? a.sample ?? "", a);
    }
    const bins = AGE_BINS.map(b => ({ label: b.label, samples: 0 }));
    const mids: number[] = [];
    for (const a of best.values()) {
      const mid = yearsAgo((a.olderBP! + (a.youngerBP ?? a.olderBP!)) / 2);
      mids.push(mid);
      bins[AGE_BINS.findIndex(b => mid < b.max)].samples++;
    }
    const olds = [...best.values()];
    return { bins, bySample: best.size, summary: olds.length ? { o: Math.max(...olds.map(a => a.olderBP!)), y: Math.min(...olds.map(a => a.youngerBP ?? a.olderBP!)) } : null };
  }, [ages]);
  if (!bySample) return <Missing>None of the samples this taxon was found in have a date, so we can't say when it lived there.</Missing>;
  return (
    <>
      <p className="text-sm">Found in layers dated <b>{describeRange(summary!.o, summary!.y)}</b>.</p>
      <div className="mt-2 h-52">
        <ResponsiveContainer>
          <BarChart data={bins} margin={{ left: -20, right: 8 }}>
            <CartesianGrid vertical={false} stroke="#e3d9c6" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={44} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v: any) => [`${v} samples`, "dated"]} labelFormatter={(l: any) => `${l} years ago`} />
            <Bar dataKey="samples" fill="var(--color-bugs)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-muted">Years ago (k = thousand). The last Ice Age ended about 11,700 years ago; everything after is the <T k="holocene">Holocene</T>.</p>
      <Expandable label={`All dates (${ages.length})`}><AgeList ages={ages} max={12} /></Expandable>
    </>
  );
}

function MCRChart({ m }: { m: any }) {
  const lo = -40, hi = 35, x = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  const Row = ({ label, a, b, color, k }: { label: string; a: number; b: number; color: string; k: "tmax" | "tmin" }) => (
    <div className="mb-3">
      <div className="text-sm"><T k={k}>{label}</T>: <b>{a}°C to {b}°C</b></div>
      <div className="relative mt-1 h-5 rounded bg-paper">
        <div className="absolute top-0 h-5 rounded" style={{ left: x(a), width: `calc(${x(b)} - ${x(a)})`, background: color }} />
        <div className="absolute top-0 h-5 border-l border-dashed border-ink/40" style={{ left: x(0) }} />
      </div>
    </div>
  );
  return (
    <div>
      <Row label="Warmest month average" a={m.TMaxLo} b={m.TMaxHi} color="#f59e0b" k="tmax" />
      <Row label="Coldest month average" a={m.TMinLo} b={m.TMinHi} color="#3b82f6" k="tmin" />
      <div className="relative h-4 text-[10px] text-muted">{[-40, -30, -20, -10, 0, 10, 20, 30].map(v => <span key={v} className="absolute -translate-x-1/2" style={{ left: x(v) }}>{v}°</span>)}</div>
      <p className="mt-3 text-sm text-muted">Summer–winter tolerance: {m.TRangeLo}–{m.TRangeHi}°C.</p>
    </div>
  );
}
