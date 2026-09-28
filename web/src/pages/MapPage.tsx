import { useEffect, useMemo, useRef, useState } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { useSearchParams } from "react-router-dom";
import { BaseMap } from "../components/BaseMap";
import { BugsSitePanel, SeadSitePanel } from "../components/SitePanels";
import { useApi } from "../useApi";
import { T } from "../glossary";
import { ErrorBox, fmt } from "../components/ui";

type BugsSite = { code: string; name: string; country: string; lat: number; lon: number; samples: number };
type SeadSite = { id: number; name: string; lat: number; lon: number; bugsLink: "high" | "medium" | "low" | null };
type Sel = { db: "bugs"; code: string } | { db: "sead"; id: number } | null;

const EMPTY: never[] = [];
const COLORS = { bugs: "#c2410c", seadLinked: "#5eaaa3", seadOnly: "#0f766e" };

export default function MapPage() {
  const bugs = useApi<BugsSite[]>("bugs/sites");
  const sead = useApi<SeadSite[]>("sead/sites");
  const [params, setParams] = useSearchParams();
  const [show, setShow] = useState({ bugs: true, seadLinked: true, seadOnly: true });
  const [flyTo, setFlyTo] = useState<[number, number] | null>(null);
  const sel: Sel = params.get("bugs") ? { db: "bugs", code: params.get("bugs")! } : params.get("sead") ? { db: "sead", id: Number(params.get("sead")) } : null;
  const select = (s: Sel, fly = false) => {
    setParams(s ? (s.db === "bugs" ? { bugs: s.code } : { sead: String(s.id) }) : {}, { replace: false });
    if (fly && s) {
      const p = s.db === "bugs" ? bugs.data?.find(b => b.code === s.code) : sead.data?.find(x => x.id === s.id);
      if (p) setFlyTo([p.lat, p.lon]);
    }
  };
  const seadLinked = useMemo(() => sead.data?.filter(s => s.bugsLink) ?? EMPTY, [sead.data]);
  const seadOnly = useMemo(() => sead.data?.filter(s => !s.bugsLink) ?? EMPTY, [sead.data]);

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <div className="relative min-h-[50vh] flex-1">
        <BaseMap className="h-full w-full">
          <Dots groups={[
            { data: show.seadOnly ? seadOnly : EMPTY, color: COLORS.seadOnly, label: p => `${p.name} (SEAD only)`, onClick: p => select({ db: "sead", id: (p as SeadSite).id }) },
            { data: show.seadLinked ? seadLinked : EMPTY, color: COLORS.seadLinked, label: p => `${p.name} (SEAD, also in BugsCEP)`, onClick: p => select({ db: "sead", id: (p as SeadSite).id }) },
            { data: show.bugs ? bugs.data ?? EMPTY : EMPTY, color: COLORS.bugs, label: p => `${p.name} (BugsCEP)`, onClick: p => select({ db: "bugs", code: (p as BugsSite).code }) },
          ]} />
          <Highlight sel={sel} bugs={bugs.data} sead={sead.data} />
          <FlyTo to={flyTo} />
        </BaseMap>
        <div className="absolute left-14 top-3 z-[500] w-72 space-y-2">
          <SiteSearch bugs={bugs.data ?? []} sead={sead.data ?? []} onPick={s => select(s, true)} />
          <div className="rounded-lg border border-line bg-card/95 p-3 text-sm shadow">
            <Toggle color={COLORS.bugs} on={show.bugs} set={v => setShow({ ...show, bugs: v })} label="BugsCEP" n={bugs.data?.length} loading={bugs.loading} />
            <Toggle color={COLORS.seadLinked} on={show.seadLinked} set={v => setShow({ ...show, seadLinked: v })} label="SEAD (in BugsCEP)" n={sead.error ? undefined : seadLinked.length} loading={sead.loading} />
            <Toggle color={COLORS.seadOnly} on={show.seadOnly} set={v => setShow({ ...show, seadOnly: v })} label="SEAD only" n={sead.error ? undefined : seadOnly.length} loading={sead.loading} />
            {sead.error && <div className="mt-2"><ErrorBox error={sead.error} what="The SEAD sites" /></div>}
          </div>
        </div>
      </div>
      <aside className="h-[50vh] w-full overflow-y-auto border-t border-line bg-card p-5 lg:h-auto lg:w-[440px] lg:border-l lg:border-t-0">
        {!sel && <div className="text-sm text-muted">Pick a <T k="site">site</T>: search above or click a dot.</div>}
        {sel?.db === "bugs" && <BugsSitePanel key={sel.code} code={sel.code} onOpenSead={id => select({ db: "sead", id }, true)} />}
        {sel?.db === "sead" && <SeadSitePanel key={sel.id} id={sel.id} onOpenBugs={code => select({ db: "bugs", code }, true)} />}
      </aside>
    </div>
  );
}

function Toggle({ color, on, set, label, n, loading }: { color: string; on: boolean; set: (v: boolean) => void; label: string; n?: number; loading?: boolean }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 py-0.5">
      <input type="checkbox" checked={on} onChange={e => set(e.target.checked)} className="accent-ink" />
      <span className="inline-block h-3 w-3 rounded-full border border-white shadow" style={{ background: color }} />
      <span className="flex-1">{label}</span>
      <span className="tabular-nums text-muted">{loading ? "…" : n != null ? fmt(n) : "–"}</span>
    </label>
  );
}

type Pt = { lat: number; lon: number; name: string };
type Group = { data: Pt[]; color: string; label: (p: Pt) => string; onClick: (p: Pt) => void };
/** All dots go into one layer, added in the order given, so later groups (BugsCEP) are always drawn on top
 *  no matter which data arrived first. */
function Dots({ groups }: { groups: Group[] }) {
  const map = useMap();
  const latest = useRef(groups);
  latest.current = groups;
  const datas = groups.map(g => g.data);
  useEffect(() => {
    const layer = L.layerGroup();
    latest.current.forEach((g, gi) => {
      for (const p of g.data) {
        L.circleMarker([p.lat, p.lon], { radius: 4, color: "#fff", weight: 1, fillColor: g.color, fillOpacity: 0.9 })
          .bindTooltip(g.label(p), { direction: "top", offset: [0, -4] })
          .on("click", () => latest.current[gi].onClick(p))
          .addTo(layer);
      }
    });
    layer.addTo(map);
    return () => { layer.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, ...datas]);
  return null;
}

function Highlight({ sel, bugs, sead }: { sel: Sel; bugs: BugsSite[] | null; sead: SeadSite[] | null }) {
  const map = useMap();
  const p = useMemo(() => sel?.db === "bugs" ? bugs?.find(b => b.code === sel.code) : sel?.db === "sead" ? sead?.find(s => s.id === sel.id) : undefined, [sel, bugs, sead]);
  useEffect(() => {
    if (!p) return;
    const ring = L.circleMarker([p.lat, p.lon], { radius: 11, color: "#2b2118", weight: 3, fill: false, interactive: false }).addTo(map);
    return () => { ring.remove(); };
  }, [p, map]);
  return null;
}

function FlyTo({ to }: { to: [number, number] | null }) {
  const map = useMap();
  useEffect(() => { if (to) map.flyTo(to, Math.max(map.getZoom(), 9), { duration: 0.8 }); }, [to, map]);
  return null;
}

function SiteSearch({ bugs, sead, onPick }: { bugs: BugsSite[]; sead: SeadSite[]; onPick: (s: Sel) => void }) {
  const [q, setQ] = useState("");
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return [];
    const b = bugs.filter(s => s.name?.toLowerCase().includes(t)).slice(0, 8).map(s => ({ key: "b" + s.code, name: s.name, where: s.country, db: "bugs" as const, sel: { db: "bugs", code: s.code } as Sel }));
    const s = sead.filter(s => s.name?.toLowerCase().includes(t)).slice(0, 8).map(s => ({ key: "s" + s.id, name: s.name, where: s.bugsLink ? "also in BugsCEP" : "SEAD only", db: "sead" as const, sel: { db: "sead", id: s.id } as Sel }));
    return [...b, ...s];
  }, [q, bugs, sead]);
  return (
    <div className="relative">
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a site by name, e.g. Thorne" className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm shadow outline-none focus:border-ink/50" />
      {hits.length > 0 && (
        <ul className="absolute mt-1 max-h-80 w-full overflow-auto rounded-lg border border-line bg-card text-sm shadow-lg">
          {hits.map(h => (
            <li key={h.key}>
              <button className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-paper" onClick={() => { onPick(h.sel); setQ(""); }}>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: h.db === "bugs" ? COLORS.bugs : COLORS.seadOnly }} />
                <span className="flex-1">{h.name}</span><span className="text-xs text-muted">{h.db === "bugs" ? "BugsCEP" : "SEAD"} · {h.where}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
