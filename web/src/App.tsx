import { NavLink, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";
import { api } from "./api";
import Home from "./pages/Home";
import MapPage from "./pages/MapPage";
import Species from "./pages/Species";
import Tables from "./pages/Tables";
import Compare from "./pages/Compare";
import Glossary from "./pages/Glossary";

type Status = { bugs: { available: boolean; message: string | null }; sead: { reachable: boolean; message?: string } };

export function useStatus() {
  const [s, setS] = useState<Status | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => api<Status>("status").then(x => alive && setS(x)).catch(() => alive && setS(null));
    load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  return s;
}

const nav = [
  ["/", "Home"], ["/map", "Map of sites"], ["/species", "Look up a species"], ["/tables", "Browse tables"], ["/compare", "BugsCEP vs SEAD"], ["/glossary", "Glossary"],
] as const;

export default function App() {
  const status = useStatus();
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-[1000] border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <NavLink to="/" className="flex items-center gap-2">
            <img src="/beetle.svg" alt="" className="h-7 w-7" />
            <span className="font-display text-lg font-bold">Beetles &amp; Buried Time</span>
          </NavLink>
          <nav className="flex flex-wrap gap-1 text-sm">
            {nav.map(([to, label]) => (
              <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => `rounded-md px-2.5 py-1.5 ${isActive ? "bg-ink text-paper" : "hover:bg-line/60"}`}>{label}</NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-xs">
            <Dot ok={status?.bugs.available} label="BugsCEP" okText="loaded from local file" badText={status?.bugs.message ?? "not loaded"} />
            <Dot ok={status?.sead.reachable} label="SEAD" okText="live connection works" badText="unreachable right now" />
          </div>
        </div>
        {status && !status.sead.reachable && (
          <div className="border-t border-sead/30 bg-sead-soft px-4 py-1.5 text-center text-sm text-sead">
            SEAD can't be reached right now, so SEAD parts will show an "unreachable" message. Everything from BugsCEP still works.
          </div>
        )}
        {status && !status.bugs.available && (
          <div className="border-t border-bugs/30 bg-bugs-soft px-4 py-1.5 text-center text-sm text-bugs">{status.bugs.message}</div>
        )}
      </header>
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/species" element={<Species />} />
          <Route path="/species/:code" element={<Species />} />
          <Route path="/tables" element={<Tables />} />
          <Route path="/tables/:db/:name" element={<Tables />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/glossary" element={<Glossary />} />
          <Route path="*" element={<div className="p-8">Page not found.</div>} />
        </Routes>
      </main>
    </div>
  );
}

function Dot({ ok, label, okText, badText }: { ok: boolean | undefined; label: string; okText: string; badText: string }) {
  const c = ok === undefined ? "bg-gray-300" : ok ? "bg-green-600" : "bg-red-600";
  return <span className="flex items-center gap-1.5" title={ok === undefined ? "checking…" : ok ? okText : badText}><span className={`h-2 w-2 rounded-full ${c}`} />{label}{ok === false && <span className="text-red-700"> offline</span>}</span>;
}
