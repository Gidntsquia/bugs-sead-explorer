import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";
import { api } from "./api";
import MapPage from "./pages/MapPage";
import Species from "./pages/Species";
import Tables from "./pages/Tables";
import Compare from "./pages/Compare";
import Glossary from "./pages/Glossary";
import Analyze from "./pages/Analyze";
import View3D from "./pages/View3D";

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
  ["/map", "Map"], ["/species", "Species"], ["/analyze", "Analyze"], ["/view3d", "3D"], ["/tables", "Tables"], ["/compare", "Compare"], ["/glossary", "Glossary"],
] as const;

export default function App() {
  const status = useStatus();
  return (
    <div className="flex h-full">
      <aside className="flex w-40 shrink-0 flex-col border-r border-line bg-card sm:w-48">
        <div className="border-b border-line px-4 py-3">
          <span className="tab text-xs text-muted">bugscep / sead</span>
        </div>
        <nav className="flex flex-1 flex-col py-1 text-sm">
          {nav.map(([to, label]) => (
            <NavLink key={to} to={to} className={({ isActive }) => `border-l-2 px-4 py-2 ${isActive ? "border-ink bg-paper font-medium" : "border-transparent text-muted hover:bg-paper/60"}`}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-line px-4 py-2 text-xs">
          <Dot ok={status?.bugs.available} label="BugsCEP" okText="loaded from local file" badText={status?.bugs.message ?? "not loaded"} />
          <Dot ok={status?.sead.reachable} label="SEAD" okText="live connection works" badText="unreachable right now" />
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<Navigate to="/map" replace />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/species" element={<Species />} />
          <Route path="/species/:code" element={<Species />} />
          <Route path="/analyze" element={<Analyze />} />
          <Route path="/view3d" element={<View3D />} />
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
  const c = ok === undefined ? "bg-gray-300" : ok ? "bg-green-700" : "bg-red-700";
  return (
    <div className="flex items-center gap-1.5 py-0.5" title={ok === undefined ? "checking…" : ok ? okText : badText}>
      <span className={`h-1.5 w-1.5 rounded-full ${c}`} />
      <span className="text-muted">{label}</span>
      {ok === false && <span className="text-red-700">offline</span>}
    </div>
  );
}
