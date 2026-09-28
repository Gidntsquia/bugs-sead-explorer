import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useApi } from "../useApi";
import { T } from "../glossary";
import { Card, ErrorBox, Loading, Stat, fmt } from "../components/ui";
import { MatchHow } from "../components/SitePanels";

const SOURCE_COLORS: Record<number, string> = { 1: "#c2410c", 10: "#0f766e", 3: "#7c3aed", 2: "#2563eb", 12: "#db2777" };
const SHORT: Record<number, string> = { 1: "BugsCEP", 10: "Lund tree-ring lab", 3: "Lund ceramics lab", 2: "Umeå environmental archaeology lab", 12: "SciLifeLab ancient DNA" };

export default function Compare() {
  const bugs = useApi<any>("bugs/summary");
  const cmp = useApi<any>("compare");
  const b = bugs.data, c = cmp.data;
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="font-display text-3xl font-bold">BugsCEP vs SEAD</h1>
      <p className="mt-1 max-w-3xl text-muted">
        BugsCEP is one specialist database about fossil beetles. SEAD is a bigger store of many kinds of evidence, and BugsCEP's data was copied into it.
        This page shows what each holds, how much of SEAD came from BugsCEP, and what SEAD adds on top.
      </p>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <Card title={<span className="text-bugs">BugsCEP (local file)</span>}>
          {bugs.error ? <ErrorBox error={bugs.error} /> : !b ? <Loading /> : (
            <div className="grid grid-cols-2 gap-2">
              <Stat tone="bugs" label={<T k="site">sites</T>} value={b.sites} />
              <Stat tone="bugs" label={<T k="sample">samples</T>} value={b.samples} />
              <Stat tone="bugs" label={<T k="fossil_record">fossil records</T>} value={b.fossilRecords} />
              <Stat tone="bugs" label={<><T k="taxon">taxa</T> listed</>} value={b.taxa} />
              <Stat tone="bugs" label="samples with a date" value={b.datedSamples} />
              <Stat tone="bugs" label={<>species with an <T k="mcr">MCR</T></>} value={b.taxaWithMCR} />
            </div>
          )}
          <p className="mt-3 text-sm text-muted">Mostly beetles. Kinds of evidence: insect counts, plus dates for the samples (<T k="radiocarbon">radiocarbon</T>, <T k="calendar_date">calendar</T>, <T k="period_date">period</T>), and a description of every species' <T k="habitat">habitat</T>.</p>
        </Card>
        <Card title={<span className="text-sead">SEAD (live from the internet)</span>}>
          {cmp.error ? <ErrorBox error={cmp.error} what="The SEAD side of this comparison" /> : !c ? <Loading what="Asking SEAD (the first time takes ~20 seconds; after that it is saved)" /> : (
            <div className="grid grid-cols-2 gap-2">
              <Stat tone="sead" label={<T k="site">sites</T>} value={c.sead.sites} />
              <Stat tone="sead" label={<T k="physical_sample">samples</T>} value={c.sead.samples} />
              <Stat tone="sead" label={<>counts of <T k="taxon">taxa</T> (abundances)</>} value={c.sead.abundances} />
              <Stat tone="sead" label={<><T k="taxon">taxa</T> listed</>} value={c.sead.taxa} />
              <Stat tone="sead" label={<T k="dataset">datasets</T>} value={c.sead.datasets} />
              <Stat tone="sead" label={<T k="analysis_entity">analyses</T>} value={c.sead.analysisEntities} />
            </div>
          )}
          <p className="mt-3 text-sm text-muted">Many kinds of evidence from several labs: beetles, pollen, seeds, <T k="dendrochronology">tree rings</T>, pottery, soil chemistry, dates.</p>
        </Card>
      </div>

      {c && (
        <>
          <h2 className="mt-10 font-display text-2xl font-semibold">How much of SEAD came from BugsCEP?</h2>
          <div className="mt-3 grid gap-5 lg:grid-cols-[1fr_1.3fr]">
            <Card title="Where SEAD's datasets came from" subtitle={<>Each <T k="dataset">dataset</T> in SEAD is marked with its <T k="source">source</T>.</>}>
              <div className="h-64">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={c.sources} dataKey="datasets" nameKey="id" innerRadius={50} outerRadius={95} paddingAngle={1}>
                      {c.sources.map((s: any) => <Cell key={s.id} fill={SOURCE_COLORS[s.id] ?? "#94a3b8"} />)}
                    </Pie>
                    <Tooltip formatter={(v: any, _n: any, p: any) => [`${fmt(v)} datasets`, SHORT[p.payload.id] ?? p.payload.name]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-2 space-y-1 text-sm">
                {c.sources.map((s: any) => (
                  <li key={s.id} className="flex items-center gap-2" title={s.name}>
                    <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: SOURCE_COLORS[s.id] ?? "#94a3b8" }} />
                    <span className="flex-1">{SHORT[s.id] ?? s.name}</span>
                    <span className="tabular-nums">{fmt(s.datasets)}</span>
                    <span className="w-12 text-right tabular-nums text-muted">{Math.round((100 * s.datasets) / c.sead.datasets)}%</span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card title="The short answer">
              <p className="text-lg leading-relaxed">
                <b className="text-bugs">{fmt(c.bugsOriginDatasets)}</b> of SEAD's {fmt(c.sead.datasets)} datasets ({Math.round((100 * c.bugsOriginDatasets) / c.sead.datasets)}%) came from BugsCEP.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
                <li><b>Sites:</b> {fmt(c.matching.seadSitesLinked)} SEAD sites can be tied to {fmt(c.matching.bugsSitesLinked)} BugsCEP sites (some BugsCEP sites were split into several SEAD sites). The other <b>{fmt(c.matching.seadOnlySites)}</b> SEAD sites are not in BugsCEP.</li>
                <li><b>Species names:</b> SEAD lists {fmt(c.taxa.seadDistinctNames)} distinct names; {fmt(c.taxa.shared)} of BugsCEP's {fmt(c.taxa.bugsNames)} names are among them. So SEAD adds about {fmt(c.taxa.seadDistinctNames - c.taxa.shared)} names that BugsCEP doesn't have.</li>
                <li><b>Most of SEAD by count is new:</b> the Lund tree-ring lab alone supplied {fmt(c.sources.find((s: any) => s.id === 10)?.datasets)} datasets, more than twice BugsCEP's contribution.</li>
              </ul>
            </Card>
          </div>

          <h2 className="mt-10 font-display text-2xl font-semibold">What SEAD adds: types of analysis</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted">Every dataset uses one <T k="method">analysis type</T>. Orange = datasets copied from BugsCEP, teal = from SEAD's other sources. Hover a bar for what the analysis is.</p>
          <Card className="mt-3">
            <MethodsChart methods={c.methods.slice(0, 14)} />
          </Card>

          <h2 className="mt-10 font-display text-2xl font-semibold">How sites were matched between the two</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            The two databases don't share site IDs, so the app links them in three ways, from most to least trustworthy. Every link shown on the map says which way it was made.
          </p>
          <div className="mt-3 overflow-hidden rounded-xl border border-line bg-card">
            <table className="w-full text-sm">
              <thead className="bg-paper text-left text-xs text-muted"><tr><th className="px-3 py-2 font-medium">How</th><th className="px-3 py-2 font-medium">How reliable</th><th className="px-3 py-2 text-right font-medium">SEAD sites</th><th className="px-3 py-2 text-right font-medium">BugsCEP sites</th></tr></thead>
              <tbody>
                {c.matching.summary.map((m: any) => (
                  <tr key={m.how} className="border-t border-line/70 align-top">
                    <td className="px-3 py-2">{HOW[m.how].title}<div className="text-xs text-muted">{HOW[m.how].text}</div><div className="mt-0.5"><MatchHow m={{ how: m.how, reliability: m.reliability, distanceKm: m.how === "name+place" ? 1 : 0.1 }} /></div></td>
                    <td className="px-3 py-2"><Reliability r={m.reliability} /></td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(m.seadSites)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(m.bugsSites)}</td>
                  </tr>
                ))}
                <tr className="border-t border-line/70 bg-paper/50"><td className="px-3 py-2">Not matched: only in SEAD</td><td /><td className="px-3 py-2 text-right tabular-nums">{fmt(c.matching.seadOnlySites)}</td><td /></tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted">SEAD numbers fetched live{c.cachedAt ? ` and saved ${new Date(c.cachedAt).toLocaleString()}` : ""}. <Link to="/map" className="underline">See the matches on the map →</Link></p>
        </>
      )}
    </div>
  );
}

const HOW: Record<string, { title: string; text: string }> = {
  "sample-code": { title: "Same sample codes", text: "SEAD kept BugsCEP's original sample codes (SAMP…) when it copied the data. If a SEAD site's samples carry a BugsCEP sample code, we know exactly which BugsCEP site it is." },
  "name+place": { title: "Same name, same place", text: "No sample code, but the site name is the same (ignoring case and punctuation) and the two points are within 2 km." },
  "place-only": { title: "Same place only", text: "Different names but the points are within 200 m. Could be the same site, could be neighbours: check by hand." },
};

function Reliability({ r }: { r: "high" | "medium" | "low" }) {
  const map = { high: ["bg-emerald-100 text-emerald-800", "High — exact"], medium: ["bg-amber-100 text-amber-800", "Medium — likely"], low: ["bg-rose-100 text-rose-800", "Low — check"] } as const;
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[r][0]}`}>{map[r][1]}</span>;
}

function MethodsChart({ methods }: { methods: any[] }) {
  const data = methods.map(m => ({ ...m, label: m.name.length > 34 ? m.name.slice(0, 32) + "…" : m.name }));
  return (
    <div style={{ height: data.length * 30 + 60 }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20 }}>
          <CartesianGrid horizontal={false} stroke="#e3d9c6" />
          <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => fmt(v)} />
          <YAxis type="category" dataKey="label" width={240} tick={{ fontSize: 12 }} interval={0} />
          <Tooltip content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const m = payload[0].payload;
            return (
              <div className="max-w-sm rounded-lg border border-line bg-card p-3 text-xs shadow-lg">
                <div className="font-semibold">{m.name}</div>
                {m.group && <div className="text-muted">{m.group}</div>}
                {m.description && <p className="mt-1 line-clamp-4">{m.description}</p>}
                <div className="mt-1">From BugsCEP: <b>{fmt(m.fromBugs)}</b> · from other sources: <b>{fmt(m.fromOthers)}</b></div>
              </div>
            );
          }} />
          <Legend formatter={v => (v === "fromBugs" ? "copied from BugsCEP" : "from SEAD's other sources")} />
          <Bar dataKey="fromBugs" stackId="a" fill="#c2410c" />
          <Bar dataKey="fromOthers" stackId="a" fill="#0f766e" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
