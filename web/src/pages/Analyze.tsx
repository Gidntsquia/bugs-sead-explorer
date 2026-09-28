import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useApi } from "../useApi";
import { api } from "../api";
import { T } from "../glossary";
import { Card, ErrorBox, Loading, Missing, Stat, fmt } from "../components/ui";

type Filters = { countries: { code: string; label: string; sites: number }[]; periods: { code: string; label: string; begin: number; end: number; samples: number }[]; habitats: { code: string; label: string }[] };
type AnalyzeResult = {
  siteCount: number; sites: { code: string; name: string; country: string; lat: number; lon: number }[];
  records: number; individuals: number; taxa: number; sampleCount: number;
  byFamily: { name: string; individuals: number }[]; byPeriod: { name: string; begin: number; samples: number }[]; byHabitat: { name: string; individuals: number }[];
};

const TABS = [["filter", "Filter & chart"], ["time", "Change over time"], ["habitat", "Habitat mix"]] as const;
const PIE_COLORS = ["#c2410c", "#0f766e", "#7c3aed", "#2563eb", "#db2777", "#65a30d", "#ea580c", "#0891b2", "#a16207", "#be123c", "#4338ca", "#15803d"];

export default function Analyze() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") ?? "filter") as (typeof TABS)[number][0];
  const setTab = (t: string) => setParams(p => { p.set("tab", t); return p; });
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex gap-1 border-b border-line text-sm">
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-3 py-2 ${tab === k ? "border-ink font-medium" : "border-transparent text-muted hover:text-ink"}`}>{label}</button>
        ))}
      </div>
      <div className="mt-5">
        {tab === "filter" && <FilterChart />}
        {tab === "time" && <TimeSeries initialKind={params.get("kind") as any} initialCode={params.get("code")} />}
        {tab === "habitat" && <HabitatMix initialSite={params.get("site")} />}
      </div>
    </div>
  );
}

// ---------------- Filter & chart ----------------
function FilterChart() {
  const filters = useApi<Filters>("bugs/filters");
  const [country, setCountry] = useState("");
  const [period, setPeriod] = useState("");
  const [habitat, setHabitat] = useState("");
  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (country) p.set("country", country);
    if (period) p.set("period", period);
    if (habitat) p.set("habitat", habitat);
    return p.toString();
  }, [country, period, habitat]);
  const result = useApi<AnalyzeResult>(`bugs/analyze${qs ? `?${qs}` : ""}`);
  const r = result.data;
  const any = country || period || habitat;

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Country">
          <select value={country} onChange={e => setCountry(e.target.value)} className="sel">
            <option value="">All countries</option>
            {filters.data?.countries.map(c => <option key={c.code} value={c.code}>{c.label} ({fmt(c.sites)})</option>)}
          </select>
        </Field>
        <Field label="Period">
          <select value={period} onChange={e => setPeriod(e.target.value)} className="sel">
            <option value="">All periods</option>
            {filters.data?.periods.map(p => <option key={p.code} value={p.code}>{p.label} ({fmt(p.samples)})</option>)}
          </select>
        </Field>
        <Field label="Habitat group">
          <select value={habitat} onChange={e => setHabitat(e.target.value)} className="sel">
            <option value="">All habitats</option>
            {filters.data?.habitats.map(h => <option key={h.code} value={h.code}>{h.label}</option>)}
          </select>
        </Field>
        {any && <button onClick={() => { setCountry(""); setPeriod(""); setHabitat(""); }} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-paper">Clear filters</button>}
      </div>
      <p className="mt-2 text-xs text-muted">Counts are read directly from `bugs.sqlite`, filtered to the choices above; clearing filters shows every BugsCEP site with coordinates.</p>

      {result.error && <div className="mt-4"><ErrorBox error={result.error} /></div>}
      {!r && !result.error && <Loading />}
      {r && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat tone="bugs" label={<T k="site">sites</T>} value={r.siteCount} />
            <Stat tone="bugs" label={<T k="sample">samples</T>} value={r.sampleCount} />
            <Stat tone="bugs" label="individuals" value={r.individuals} />
            <Stat tone="bugs" label={<T k="taxon">taxa</T>} value={r.taxa} />
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <Card title="By family" subtitle="individuals, top 12">
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={r.byFamily} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid horizontal={false} stroke="#e3d9c6" />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => fmt(v)} />
                    <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} interval={0} />
                    <Tooltip formatter={(v: any) => [fmt(v), "individuals"]} />
                    <Bar dataKey="individuals" fill="#c2410c" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card title="By habitat group" subtitle="individuals of taxa carrying that code (a taxon may carry more than one)">
              {r.byHabitat.length === 0 ? <Missing>No habitat-coded finds match this filter.</Missing> : (
                <div className="h-64">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={r.byHabitat} dataKey="individuals" nameKey="name" innerRadius={45} outerRadius={90} paddingAngle={1}>
                        {r.byHabitat.map((h, i) => <Cell key={h.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: any, _n: any, p: any) => [fmt(v), p.payload.name]} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </div>

          <Card title="By period" subtitle="samples with a date in this period, top 20 by start year" className="mt-5">
            <div style={{ height: Math.max(180, r.byPeriod.length * 26 + 40) }}>
              <ResponsiveContainer>
                <BarChart data={r.byPeriod} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid horizontal={false} stroke="#e3d9c6" />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => fmt(v)} />
                  <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 11 }} interval={0} />
                  <Tooltip formatter={(v: any) => [fmt(v), "samples"]} />
                  <Bar dataKey="samples" fill="#0f766e" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="Matching sites" subtitle={`${fmt(r.siteCount)} sites — see them on the map`} className="mt-5">
            <div className="max-h-64 overflow-y-auto text-sm">
              <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-3">
                {r.sites.slice(0, 90).map(s => (
                  <li key={s.code}><Link to={`/map?bugs=${s.code}`} className="text-link hover:underline">{s.name}</Link></li>
                ))}
              </ul>
              {r.sites.length > 90 && <p className="mt-2 text-xs text-muted">…and {fmt(r.sites.length - 90)} more. <Link to="/map" className="underline">Open the map</Link> to see them all as dots.</p>}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      {children}
    </label>
  );
}

// ---------------- Change over time ----------------
type TimeSeriesResult = { kind: string; code: string; binYears: number; bins: { fromBP: number; toBP: number; individuals: number; samples: number }[]; undatedSamples: number; totalSamples: number };

function TimeSeries({ initialKind, initialCode }: { initialKind?: "taxon" | "habitat" | "country" | null; initialCode?: string | null }) {
  const filters = useApi<Filters>("bugs/filters");
  const [kind, setKind] = useState<"taxon" | "habitat" | "country">(initialKind ?? "habitat");
  const [code, setCode] = useState(initialCode ?? "");
  const [binYears, setBinYears] = useState(500);
  const [taxonQuery, setTaxonQuery] = useState("");
  const [taxonHits, setTaxonHits] = useState<{ code: string; genus: string; species: string }[]>([]);

  const path = code ? `bugs/timeseries?kind=${kind}&code=${encodeURIComponent(code)}&binYears=${binYears}` : null;
  const result = useApi<TimeSeriesResult>(path);
  const r = result.data;
  const data = useMemo(() => r?.bins.map(b => ({ ...b, mid: Math.round((b.fromBP + b.toBP) / 2), label: `${fmt(b.fromBP)}–${fmt(b.toBP)} BP` })) ?? [], [r]);

  const options = kind === "habitat" ? filters.data?.habitats.map(h => ({ code: h.code, label: h.label }))
    : kind === "country" ? filters.data?.countries.map(c => ({ code: c.code, label: c.label }))
    : null;

  const taxonLabel = useApi<any>(kind === "taxon" && code && !taxonQuery ? `bugs/taxon/${encodeURIComponent(code)}` : null);
  const shownQuery = taxonQuery || (taxonLabel.data ? `${taxonLabel.data.taxon.genus} ${taxonLabel.data.taxon.species}` : "");

  async function searchTaxa(q: string) {
    setTaxonQuery(q);
    if (q.trim().length < 2) { setTaxonHits([]); return; }
    try { const hits = await api<{ code: string; genus: string; species: string }[]>(`bugs/taxa?q=${encodeURIComponent(q)}`); setTaxonHits(hits.slice(0, 8)); }
    catch { setTaxonHits([]); }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Show change for a…">
          <select value={kind} onChange={e => { setKind(e.target.value as any); setCode(""); }} className="sel">
            <option value="habitat">Habitat group</option>
            <option value="taxon">Species / taxon</option>
            <option value="country">Country / region</option>
          </select>
        </Field>
        {kind === "taxon" ? (
          <Field label="Species">
            <div className="relative">
              <input value={shownQuery} onChange={e => searchTaxa(e.target.value)} placeholder="e.g. Aphodius" className="sel w-56" />
              {taxonHits.length > 0 && (
                <ul className="absolute z-10 mt-1 w-64 rounded-lg border border-line bg-card text-sm shadow-lg">
                  {taxonHits.map(h => (
                    <li key={h.code}><button className="block w-full px-3 py-1.5 text-left hover:bg-paper" onClick={() => { setCode(h.code); setTaxonQuery(`${h.genus} ${h.species}`); setTaxonHits([]); }}>{h.genus} {h.species}</button></li>
                  ))}
                </ul>
              )}
            </div>
          </Field>
        ) : (
          <Field label={kind === "habitat" ? "Habitat group" : "Country"}>
            <select value={code} onChange={e => setCode(e.target.value)} className="sel w-56">
              <option value="">Pick one…</option>
              {options?.map(o => <option key={o.code} value={o.code}>{o.label}</option>)}
            </select>
          </Field>
        )}
        <Field label="Time bin width">
          <select value={binYears} onChange={e => setBinYears(Number(e.target.value))} className="sel">
            <option value={100}>100 years</option>
            <option value={250}>250 years</option>
            <option value={500}>500 years</option>
            <option value={1000}>1,000 years</option>
          </select>
        </Field>
      </div>
      <p className="mt-2 text-xs text-muted">Each dated sample gets one age: a calendar date if it has one, else a radiocarbon/radiometric midpoint, else its period's midpoint. Samples are then grouped into {fmt(binYears)}-year bins (oldest at left) and their individuals summed. Bins with no data in between are skipped, so the axis is spaced by bin order, not literal years — check a bin's label for its actual date range. Undated samples are left out and counted below.</p>

      {!code && <div className="mt-4"><Missing>Choose something to see its change over time.</Missing></div>}
      {code && result.error && <div className="mt-4"><ErrorBox error={result.error} /></div>}
      {code && !r && !result.error && <Loading />}
      {code && r && (
        <>
          {kind === "taxon" && <p className="mt-3 text-sm"><Link to={`/species/${code}`} className="text-link hover:underline">Open this species' page</Link> for its sites and temperature range.</p>}
          <div className="mt-4 grid grid-cols-3 gap-3 sm:w-96">
            <Stat label="dated samples" value={r.totalSamples - r.undatedSamples} />
            <Stat label="undated (left out)" value={r.undatedSamples} />
            <Stat label="total samples" value={r.totalSamples} />
          </div>
          {data.length === 0 ? <div className="mt-4"><Missing>No dated samples for this choice.</Missing></div> : (
            <Card className="mt-5">
              <div className="h-72">
                <ResponsiveContainer>
                  <LineChart data={data} margin={{ left: 10, right: 20, top: 10 }}>
                    <CartesianGrid stroke="#e3d9c6" />
                    {/* bins are spaced evenly by category, not by true year gaps, so one far-off outlier bin (e.g. a Pliocene sample) doesn't squash the rest of the timeline */}
                    <XAxis dataKey="label" type="category" interval={Math.ceil(data.length / 16)} angle={-30} textAnchor="end" height={50} tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmt(v)} />
                    <Tooltip labelFormatter={(_v, p: any) => p?.[0]?.payload?.label ?? ""} formatter={(v: any, n: any) => [fmt(v), n === "individuals" ? "individuals" : "samples"]} />
                    <Legend />
                    <Line type="monotone" dataKey="individuals" stroke="#c2410c" dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="samples" stroke="#0f766e" dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ---------------- Habitat mix ----------------
type HabitatMixResult = { site: { code: string; name: string }; total: number; uncoded: number; uncodedShare: number; habitats: { code: string; label: string; individuals: number; share: number }[]; samples: { sampleCode: string; total: number; uncoded: number; habitats: { label: string; individuals: number; share: number }[] }[] };

function HabitatMix({ initialSite }: { initialSite?: string | null }) {
  const [siteA, setSiteA] = useState(initialSite ?? "");
  const [siteB, setSiteB] = useState("");
  const codes = [siteA, siteB].filter(Boolean).join(",");
  const result = useApi<HabitatMixResult[]>(codes ? `bugs/habitatmix?sites=${encodeURIComponent(codes)}` : null);

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Site"><SiteSearchBox value={siteA} onPick={setSiteA} /></Field>
        <Field label="Compare with (optional)"><SiteSearchBox value={siteB} onPick={setSiteB} /></Field>
        <p className="text-xs text-muted">Try Thorne Moors for the checked round-3 numbers.</p>
      </div>
      {!siteA && <div className="mt-4"><Missing>Pick a site by name to see its habitat mix.</Missing></div>}
      {siteA && result.error && <div className="mt-4"><ErrorBox error={result.error} /></div>}
      {siteA && !result.data && !result.error && <Loading />}
      {result.data && (
        <div className={`mt-5 grid gap-5 ${result.data.length > 1 ? "lg:grid-cols-2" : ""}`}>
          {result.data.map(site => <SiteMix key={site.site.code} data={site} />)}
        </div>
      )}
    </div>
  );
}

function SiteMix({ data }: { data: HabitatMixResult }) {
  return (
    <Card title={<Link to={`/map?bugs=${data.site.code}`} className="hover:underline">{data.site.name}</Link>} subtitle={`${fmt(data.total)} individuals · ${data.samples.length} samples`}>
      <p className="text-xs text-muted">Share = individuals of taxa carrying that habitat code ÷ all individuals at the site (a taxon may carry more than one code, so shares can add to more than 100%).</p>
      <div className="mt-3 h-56">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={[...data.habitats, { code: "none", label: "No habitat code", individuals: data.uncoded, share: data.uncodedShare }]} dataKey="individuals" nameKey="label" innerRadius={40} outerRadius={85} paddingAngle={1}>
              {[...data.habitats, { code: "none" }].map((h, i) => <Cell key={h.code} fill={h.code === "none" ? "#94a3b8" : PIE_COLORS[i % PIE_COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(v: any, _n: any, p: any) => [`${fmt(v)} (${Math.round(p.payload.share * 100)}%)`, p.payload.label]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-1 space-y-0.5 text-sm">
        {data.habitats.map((h, i) => (
          <li key={h.code} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
            <span className="flex-1">{h.label}</span><span className="tabular-nums">{fmt(h.individuals)}</span><span className="w-10 text-right tabular-nums text-muted">{Math.round(h.share * 100)}%</span>
          </li>
        ))}
        <li className="flex items-center gap-2 text-muted">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-slate-400" />
          <span className="flex-1">No habitat code</span><span className="tabular-nums">{fmt(data.uncoded)}</span><span className="w-10 text-right tabular-nums">{Math.round(data.uncodedShare * 100)}%</span>
        </li>
      </ul>

      {data.samples.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-medium">Per sample</h4>
          <div className="mt-2 space-y-2">
            {data.samples.map(s => (
              <div key={s.sampleCode} className="text-xs">
                <div className="mb-0.5 flex items-center justify-between text-muted"><span>{s.sampleCode}</span><span>{fmt(s.total)} individuals</span></div>
                {s.total === 0 ? <Missing>No fossil records.</Missing> : (
                  <div className="flex h-4 w-full overflow-hidden rounded">
                    {s.habitats.map((h, i) => <div key={h.label} title={`${h.label}: ${fmt(h.individuals)} (${Math.round(h.share * 100)}%)`} style={{ width: `${h.share * 100}%`, background: PIE_COLORS[i % PIE_COLORS.length] }} />)}
                    {s.uncoded > 0 && <div title={`No habitat code: ${fmt(s.uncoded)}`} style={{ width: `${(s.uncoded / s.total) * 100}%`, background: "#94a3b8" }} />}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function SiteSearchBox({ value, onPick }: { value: string; onPick: (code: string) => void }) {
  const [q, setQ] = useState("");
  const sites = useApi<{ code: string; name: string }[]>("bugs/sites");
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return [];
    return (sites.data ?? []).filter(s => s.name?.toLowerCase().includes(t)).slice(0, 8);
  }, [q, sites.data]);
  const picked = sites.data?.find(s => s.code === value);
  return (
    <div className="relative">
      <input value={picked ? picked.name : q} onChange={e => { setQ(e.target.value); if (value) onPick(""); }} placeholder="Site name…" className="sel w-56" />
      {hits.length > 0 && (
        <ul className="absolute z-10 mt-1 w-64 rounded-lg border border-line bg-card text-sm shadow-lg">
          {hits.map(h => <li key={h.code}><button className="block w-full px-3 py-1.5 text-left hover:bg-paper" onClick={() => { onPick(h.code); setQ(""); }}>{h.name}</button></li>)}
        </ul>
      )}
    </div>
  );
}
