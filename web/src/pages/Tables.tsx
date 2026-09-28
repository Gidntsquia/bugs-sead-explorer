import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { useApi } from "../useApi";
import { ErrorBox, Loading, fmt } from "../components/ui";

type Db = "bugs" | "sead";
type TableInfo = { name: string; rows?: number; description: string | null };

export default function Tables() {
  const { db, name } = useParams();
  if (db && name) return <TableView db={db as Db} name={name} />;
  return <TableLists />;
}

function TableLists() {
  const [q, setQ] = useState("");
  const [onlyDescribed, setOnlyDescribed] = useState(false);
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mt-2 flex flex-wrap items-center gap-4">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter tables by name or description" className="w-80 rounded-lg border border-line bg-card px-3 py-2 text-sm outline-none focus:border-ink/50" />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyDescribed} onChange={e => setOnlyDescribed(e.target.checked)} /> only tables with a description</label>
      </div>
      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <BugsList q={q} onlyDescribed={onlyDescribed} />
        <SeadList q={q} onlyDescribed={onlyDescribed} />
      </div>
    </div>
  );
}

const matchQ = (t: TableInfo, q: string) => !q.trim() || `${t.name} ${t.description ?? ""}`.toLowerCase().includes(q.trim().toLowerCase());

function BugsList({ q, onlyDescribed }: { q: string; onlyDescribed: boolean }) {
  const { data, error, loading } = useApi<TableInfo[]>("bugs/tables");
  const [expanded, setExpanded] = useState(false);
  const shown = (data ?? []).filter(t => matchQ(t, q) && (!onlyDescribed || t.description));
  return (
    <section>
      <h2 className="font-display text-xl font-semibold text-bugs">BugsCEP <span className="text-sm font-normal text-muted">{data && `${data.length} tables, read from the local file`}</span></h2>
      {loading && <Loading what="Reading BugsCEP tables" />}
      {error && <ErrorBox error={error} />}
      <TableRows db="bugs" tables={shown} limited={!q.trim() && !expanded} onShowAll={() => setExpanded(true)} />
    </section>
  );
}

function SeadList({ q, onlyDescribed }: { q: string; onlyDescribed: boolean }) {
  const { data, error, loading } = useApi<TableInfo[]>("sead/tables");
  const [counts, setCounts] = useState<Record<string, number | "err">>({});
  const [expanded, setExpanded] = useState(false);
  // Row counts are one small request per table; fetched two at a time and cached by the server.
  // Only counted for the tables actually shown, so collapsing the list also cuts requests.
  const shownNames = useMemo(() => (data ?? []).filter(t => matchQ(t, q) && (!onlyDescribed || t.description)).slice(0, expanded || q.trim() ? undefined : 10).map(t => t.name), [data, q, onlyDescribed, expanded]);
  useEffect(() => {
    const ctl = new AbortController();
    const queue = shownNames.filter(n => counts[n] === undefined);
    const worker = async () => {
      while (queue.length && !ctl.signal.aborted) {
        const n = queue.shift()!;
        try { const r = await api<{ rows: number }>(`sead/count/${encodeURIComponent(n)}`, ctl.signal); setCounts(c => ({ ...c, [n]: r.rows })); }
        catch (e) { if (!ctl.signal.aborted) setCounts(c => ({ ...c, [n]: "err" })); if (e instanceof ApiError && e.seadUnreachable) queue.length = 0; }
      }
    };
    void Promise.all([worker(), worker()]);
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownNames.join(",")]);
  const shown = (data ?? []).filter(t => matchQ(t, q) && (!onlyDescribed || t.description)).map(t => ({ ...t, rows: counts[t.name] }));
  return (
    <section>
      <h2 className="font-display text-xl font-semibold text-sead">SEAD <span className="text-sm font-normal text-muted">{data && `${data.length} tables, read live`}</span></h2>
      {loading && <Loading what="Asking SEAD for its table list" />}
      {error && <ErrorBox error={error} what="The SEAD table list" />}
      <TableRows db="sead" tables={shown as any} limited={!q.trim() && !expanded} onShowAll={() => setExpanded(true)} />
    </section>
  );
}

function TableRows({ db, tables, limited, onShowAll }: { db: Db; tables: (Omit<TableInfo, "rows"> & { rows?: number | "err" })[]; limited?: boolean; onShowAll?: () => void }) {
  if (!tables.length) return null;
  const visible = limited ? tables.slice(0, 10) : tables;
  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-line bg-card">
      <table className="w-full text-sm">
        <thead className="bg-paper text-left text-xs text-muted"><tr><th className="px-3 py-2 font-medium">Table</th><th className="px-3 py-2 text-right font-medium">Rows</th></tr></thead>
        <tbody>
          {visible.map(t => (
            <tr key={t.name} className="border-t border-line/70 align-top">
              <td className="px-3 py-1.5">
                <Link to={`/tables/${db}/${encodeURIComponent(t.name)}`} className="font-mono text-[13px] text-link hover:underline">{t.name}</Link>
                {t.description ? <div className="text-xs leading-snug text-muted">{t.description}</div> : <div className="text-xs italic text-muted/70">no description</div>}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">{t.rows === "err" ? <span className="text-xs text-muted" title="Could not count">?</span> : t.rows == null ? <span className="text-muted">…</span> : fmt(t.rows)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {limited && tables.length > visible.length && (
        <button onClick={onShowAll} className="block w-full border-t border-line/70 px-3 py-2 text-left text-xs text-link hover:underline">
          Show all {tables.length} tables
        </button>
      )}
    </div>
  );
}

type TableData = { name: string; description: string | null; total: number | null; page: number; pageSize: number; columns: { name: string; type: string; description: string | null }[]; rows: Record<string, unknown>[] };

function TableView({ db, name }: { db: Db; name: string }) {
  const [params, setParams] = useSearchParams();
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries([...params].filter(([k]) => k.startsWith("f.")).map(([k, v]) => [k.slice(2), v])));
  // Debounce filter typing into the URL so each keystroke doesn't fire a query.
  useEffect(() => {
    const t = setTimeout(() => {
      const next = new URLSearchParams(params);
      for (const k of [...next.keys()]) if (k.startsWith("f.")) next.delete(k);
      for (const [k, v] of Object.entries(draft)) if (v.trim()) next.set(`f.${k}`, v);
      next.delete("page");
      if (next.toString() !== params.toString()) setParams(next, { replace: true });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);
  const qs = params.toString();
  const path = `${db}/table/${encodeURIComponent(name)}${qs ? `?${qs}` : ""}`;
  const { data, error, loading } = useApi<TableData>(path);
  const [last, setLast] = useState<TableData | null>(null);
  useEffect(() => { if (data) setLast(data); }, [data]);
  const d = data ?? last;
  const sort = params.get("sort"), dir = params.get("dir") ?? "asc", page = Number(params.get("page") ?? 0);
  const setP = (k: Record<string, string | null>) => { const n = new URLSearchParams(params); for (const [a, b] of Object.entries(k)) b == null ? n.delete(a) : n.set(a, b); setParams(n); };
  const pages = d?.total != null ? Math.max(1, Math.ceil(d.total / d.pageSize)) : 1;
  const tone = db === "bugs" ? "text-bugs" : "text-sead";
  const hasFilter = Object.values(draft).some(v => v.trim());
  return (
    <div className="px-4 py-6">
      <Link to="/tables" className="text-sm text-link hover:underline">← all tables</Link>
      <h1 className="mt-1 font-display text-3xl font-bold"><span className={`${tone}`}>{db === "bugs" ? "BugsCEP" : "SEAD"}</span> · <span className="font-mono text-2xl">{name}</span></h1>
      {d?.description && <p className="mt-1 max-w-4xl text-muted">{d.description}</p>}
      {error && <div className="mt-3"><ErrorBox error={error} what={db === "sead" ? "SEAD tables" : undefined} /></div>}
      {!d && loading && <Loading what="Loading rows" />}
      {d && (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <span><b>{fmt(d.total)}</b> {hasFilter ? "matching " : ""}rows{d.total != null && d.total > 0 && <> · showing {fmt(page * d.pageSize + 1)}–{fmt(Math.min(d.total, (page + 1) * d.pageSize))}</>}</span>
            {loading && <span className="text-muted">updating…</span>}
            <div className="ml-auto flex items-center gap-1">
              <button disabled={page <= 0} onClick={() => setP({ page: "0" })} className="rounded border border-line px-2 py-1 disabled:opacity-40">«</button>
              <button disabled={page <= 0} onClick={() => setP({ page: String(page - 1) })} className="rounded border border-line px-2 py-1 disabled:opacity-40">‹ Prev</button>
              <span className="px-2">page {fmt(page + 1)} of {fmt(pages)}</span>
              <button disabled={page >= pages - 1} onClick={() => setP({ page: String(page + 1) })} className="rounded border border-line px-2 py-1 disabled:opacity-40">Next ›</button>
              <button disabled={page >= pages - 1} onClick={() => setP({ page: String(pages - 1) })} className="rounded border border-line px-2 py-1 disabled:opacity-40">»</button>
            </div>
            {hasFilter && <button onClick={() => setDraft({})} className="rounded border border-line px-2 py-1">Clear filters</button>}
          </div>
          <div className={`mt-2 overflow-auto rounded-xl border border-line bg-card ${loading ? "opacity-60" : ""}`} style={{ maxHeight: "calc(100vh - 260px)" }}>
            <table className="min-w-full text-[13px]">
              <thead className="sticky top-0 z-10 bg-paper">
                <tr>
                  {d.columns.map(c => (
                    <th key={c.name} className="whitespace-nowrap border-b border-line px-2 pt-2 text-left font-semibold">
                      <button onClick={() => setP({ sort: c.name, dir: sort === c.name && dir === "asc" ? "desc" : "asc", page: null })} className="hover:underline">
                        <ColName c={c} />{sort === c.name ? (dir === "asc" ? " ▲" : " ▼") : ""}
                      </button>
                      <div className="text-[10px] font-normal text-muted">{c.type}</div>
                    </th>
                  ))}
                </tr>
                <tr>
                  {d.columns.map(c => (
                    <th key={c.name} className="border-b border-line px-1 py-1">
                      <input value={draft[c.name] ?? ""} onChange={e => setDraft({ ...draft, [c.name]: e.target.value })} placeholder="filter" className="w-full min-w-16 rounded border border-line bg-card px-1.5 py-0.5 text-xs font-normal outline-none focus:border-ink/50" />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.rows.map((r, i) => (
                  <tr key={i} className="border-t border-line/60 odd:bg-paper/40">
                    {d.columns.map(c => <Cell key={c.name} v={r[c.name]} />)}
                  </tr>
                ))}
              </tbody>
            </table>
            {d.rows.length === 0 && <p className="p-4 text-sm text-muted">No rows match these filters.</p>}
          </div>
        </>
      )}
    </div>
  );
}

function ColName({ c }: { c: { name: string; description: string | null } }) {
  const [open, setOpen] = useState(false);
  if (!c.description) return <>{c.name}</>;
  return (
    <span className="term relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      {c.name}
      {open && <span className="absolute left-0 top-full z-30 mt-1 w-64 whitespace-normal rounded-lg bg-ink px-3 py-2 text-left text-xs font-normal text-paper shadow-xl">{c.description}</span>}
    </span>
  );
}

function Cell({ v }: { v: unknown }) {
  const s = useMemo(() => (v == null ? null : typeof v === "object" ? JSON.stringify(v) : String(v)), [v]);
  if (s == null) return <td className="px-2 py-1 text-muted/60">—</td>;
  const long = s.length > 80;
  return <td className="max-w-md px-2 py-1 align-top" title={long ? s : undefined}><span className={long ? "line-clamp-2" : "whitespace-nowrap"}>{s}</span></td>;
}
