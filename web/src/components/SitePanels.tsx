import { Link } from "react-router-dom";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useApi } from "../useApi";
import { T } from "../glossary";
import { AgeList, AgeSummary } from "./Ages";
import { Badge, ErrorBox, Loading, Missing, fmt } from "./ui";

const titleCase = (s: string) => (s ?? "").charAt(0) + (s ?? "").slice(1).toLowerCase();

export function BugsSitePanel({ code, onOpenSead }: { code: string; onOpenSead: (id: number) => void }) {
  const { data: d, error, loading } = useApi<any>(`bugs/site/${encodeURIComponent(code)}`);
  if (loading) return <Loading what="Loading site from BugsCEP" />;
  if (error) return <ErrorBox error={error} />;
  if (!d) return null;
  const s = d.site;
  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap gap-1.5"><Badge tone="bugs">BugsCEP site</Badge><Badge tone="plain">{s.code}</Badge></div>
        <h2 className="mt-1 font-display text-2xl font-semibold leading-tight">{s.name}</h2>
        <p className="text-sm text-muted">{[s.region, s.country].filter(Boolean).join(", ")}{s.altitude != null && ` · ${s.altitude} m above sea level`}</p>
        {s.interpretation && <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{s.interpretation}</p>}
        <p className="mt-1 text-sm"><Link to={`/analyze?tab=habitat&site=${encodeURIComponent(code)}`} className="text-link hover:underline">See its habitat mix</Link> · <Link to={`/view3d?site=${encodeURIComponent(code)}`} className="text-link hover:underline">find it in 3D</Link> · <Link to={`/timemachine?site=${encodeURIComponent(code)}`} className="text-link hover:underline">Time machine</Link></p>
      </div>

      <SeadCrossLink code={code} onOpenSead={onOpenSead} />

      <div>
        <h3 className="font-semibold">How old is it?</h3>
        <AgeSummary summary={d.ageSummary} />
        <AgeList ages={d.ages} />
      </div>

      <div>
        <h3 className="font-semibold">What was found</h3>
        <p className="text-sm text-muted">
          {fmt(d.individuals)} beetles (<T k="abundance">individuals</T>) of {fmt(d.taxonCount)} different <T k="taxon">taxa</T>, from {fmt(d.sampleCount)} <T k="sample">samples</T>.
        </p>
        {d.topTaxa.length ? (
          <table className="mt-2 w-full text-sm">
            <thead><tr className="text-left text-xs text-muted"><th className="font-medium"><T k="taxon">Taxon</T> (<T k="family">family</T>)</th><th className="text-right font-medium"><T k="abundance">Individuals</T></th><th className="text-right font-medium">Samples</th></tr></thead>
            <tbody>
              {d.topTaxa.map((t: any) => (
                <tr key={t.code} className="border-t border-line/70">
                  <td className="py-1"><Link className="italic text-link hover:underline" to={`/species/${t.code}`}>{t.genus} {t.species}</Link> <span className="text-xs text-muted">{titleCase(t.family)}</span></td>
                  <td className="text-right tabular-nums">{fmt(t.individuals)}</td><td className="text-right tabular-nums">{t.samples}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Missing>No beetle records for this site.</Missing>}
        {d.topTaxa.some((t: any) => /indet|spp?\.?$/.test(t.species)) && <p className="mt-1 text-xs text-muted">Names ending in <T k="indet">indet. / spp.</T> are fossils that could only be identified to a group.</p>}
      </div>

      <div>
        <h3 className="font-semibold">What it says about the environment</h3>
        <p className="text-sm text-muted">How many of the taxa found here belong to each <T k="habitat">habitat group</T> today.</p>
        {d.habitats.length ? (
          <div style={{ height: Math.max(120, d.habitats.length * 22) }} className="mt-1">
            <ResponsiveContainer>
              <BarChart data={d.habitats} layout="vertical" margin={{ left: 0, right: 16 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="label" width={170} tick={{ fontSize: 11 }} interval={0} />
                <Tooltip formatter={(v: any) => [`${v} taxa`, "found here"]} labelFormatter={(l: any) => d.habitats.find((h: any) => h.label === l)?.definition ?? l} />
                <Bar dataKey="taxa" fill="var(--color-bugs)" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : <Missing>None of the taxa found here have a habitat group recorded.</Missing>}
      </div>

      {d.otherEvidence.length > 0 && (
        <div><h3 className="font-semibold">Other evidence studied here</h3><p className="text-sm">{d.otherEvidence.join(", ")}</p></div>
      )}
      {d.references.length > 0 && (
        <details className="text-sm"><summary className="cursor-pointer font-semibold">Publications ({d.references.length})</summary>
          <ul className="mt-1 list-disc space-y-1 pl-5">{d.references.map((r: any, i: number) => <li key={i}>{r.author ?? r.ref} {r.title}</li>)}</ul>
        </details>
      )}
    </div>
  );
}

function SeadCrossLink({ code, onOpenSead }: { code: string; onOpenSead: (id: number) => void }) {
  const sm = useApi<any[]>(`sead/matches/${encodeURIComponent(code)}`);
  if (sm.loading) return <Loading what="Checking whether SEAD has this site too" />;
  if (sm.error) return <div className="rounded-lg bg-sead-soft/60 px-3 py-2 text-sm text-sead">Can't check whether SEAD also has this site: SEAD is unreachable.</div>;
  if (!sm.data) return null;
  if (!sm.data.length) return <div className="rounded-lg bg-paper px-3 py-2 text-sm text-muted">No matching site found in SEAD.</div>;
  return (
    <div className="rounded-lg bg-sead-soft/60 px-3 py-2 text-sm">
      <b className="text-sead">Also in SEAD:</b>{" "}
      {sm.data.map((m: any, i: number) => (
        <span key={m.seadId}>{i > 0 && ", "}<button className="text-link underline" onClick={() => onOpenSead(m.seadId)}>{m.seadName ?? `site ${m.seadId}`}</button> <MatchHow m={m} /></span>
      ))}
    </div>
  );
}

export function MatchHow({ m }: { m: { how: string; reliability: string; distanceKm: number | null } }) {
  const text = m.how === "sample-code" ? <><T k="sample_code_match">same sample codes</T>, reliable</> : m.how === "name+place" ? <>same name, {m.distanceKm != null ? `${m.distanceKm.toFixed(1)} km apart` : "nearby"}, likely</> : <>different name but {m.distanceKm != null ? `${Math.round(m.distanceKm * 1000)} m` : "very close"} apart, check by hand</>;
  return <span className="text-xs text-muted">({text})</span>;
}

export function SeadSitePanel({ id, onOpenBugs }: { id: number; onOpenBugs: (code: string) => void }) {
  const { data: d, error, loading } = useApi<any>(`sead/site/${id}`);
  if (loading) return <Loading what="Asking SEAD about this site (live)" />;
  if (error) return <ErrorBox error={error} what="Information on SEAD sites" />;
  if (!d) return null;
  const s = d.site;
  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap gap-1.5"><Badge tone="sead">SEAD site</Badge><Badge tone="plain">site_id {s.id}</Badge></div>
        <h2 className="mt-1 font-display text-2xl font-semibold leading-tight">{s.name}</h2>
        <p className="text-sm text-muted">{[...d.regions, d.country].filter(Boolean).join(", ") || "Country not recorded"}{s.altitude != null && ` · ${Number(s.altitude)} m above sea level`}</p>
        {s.description && <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{s.description}</p>}
      </div>

      {d.bugsLinks.length > 0 ? (
        <div className="rounded-lg bg-bugs-soft/60 px-3 py-2 text-sm">
          <b className="text-bugs">Also in BugsCEP:</b>{" "}
          {d.bugsLinks.map((m: any, i: number) => (
            <span key={m.bugsCode}>{i > 0 && ", "}<button className="text-link underline" onClick={() => onOpenBugs(m.bugsCode)}>{m.name ?? m.bugsCode}</button> <MatchHow m={m} /></span>
          ))}
        </div>
      ) : <div className="rounded-lg bg-paper px-3 py-2 text-sm text-muted">Only in SEAD — no matching BugsCEP site.</div>}

      <div>
        <h3 className="font-semibold">How old is it?</h3>
        <AgeSummary summary={d.ageSummary} />
        <AgeList ages={d.ages} />
      </div>

      <div>
        <h3 className="font-semibold">What was studied here</h3>
        <p className="text-sm text-muted">
          {d.sampleCount != null ? `${fmt(d.sampleCount)} ` : ""}<T k="physical_sample">samples</T>, {fmt(d.analysisCount)} <T k="analysis_entity">analyses</T> in {fmt(d.datasetCount)} <T k="dataset">datasets</T>.
        </p>
        {d.analysisTypes.length ? (
          <table className="mt-2 w-full text-sm">
            <thead><tr className="text-left text-xs text-muted"><th className="font-medium"><T k="method">Analysis type</T></th><th className="text-right font-medium">Analyses</th><th className="text-right font-medium">Samples</th></tr></thead>
            <tbody>
              {d.analysisTypes.map((a: any) => (
                <tr key={a.method} className="border-t border-line/70" title={a.description ?? ""}>
                  <td className="py-1">{a.method} {a.group && <span className="text-xs text-muted">· {a.group}</span>}</td>
                  <td className="text-right tabular-nums">{fmt(a.analyses)}</td><td className="text-right tabular-nums">{fmt(a.samples)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Missing>SEAD has no analyses recorded for this site.</Missing>}
        {d.sources.length > 0 && <p className="mt-2 text-xs text-muted"><T k="source">Data from</T>: {d.sources.map((x: any) => `${x.name} (${fmt(x.analyses)})`).join("; ")}</p>}
      </div>

      <div>
        <h3 className="font-semibold">Most common finds</h3>
        {d.topTaxa.length ? (
          <>
            <p className="text-sm text-muted">{fmt(d.taxonCount)} different <T k="taxon">taxa</T> counted (beetles, pollen, seeds, …). Top by total count:</p>
            <table className="mt-2 w-full text-sm">
              <tbody>
                {d.topTaxa.map((t: any) => (
                  <tr key={t.taxonId} className="border-t border-line/70">
                    <td className="py-1"><i>{t.name}</i> <span className="text-xs text-muted">{t.family ? titleCase(t.family) : ""}</span></td>
                    <td className="text-right tabular-nums">{fmt(t.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : <Missing>No counts of organisms (beetles, pollen, seeds…) for this site — its data is other kinds of measurement or dates.</Missing>}
      </div>
      <p className="text-xs text-muted">Fetched live from SEAD{d.cachedAt ? `, saved ${new Date(d.cachedAt).toLocaleString()}` : ""}. <a className="underline" href={`https://browser.sead.se/site/${s.id}`} target="_blank" rel="noreferrer">Open in SEAD's own browser ↗</a></p>
    </div>
  );
}
