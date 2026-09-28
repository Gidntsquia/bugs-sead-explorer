import { Link } from "react-router-dom";
import { useApi } from "../useApi";
import { fmt } from "../components/ui";

export default function Home() {
  const bugs = useApi<any>("bugs/summary");
  const b = bugs.data;
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="font-display text-4xl font-bold leading-tight md:text-5xl">What beetles buried in the ground tell us about the past</h1>
      <p className="mt-3 max-w-2xl text-lg leading-relaxed text-muted">
        Fossil beetles survive for thousands of years. Because each species needs a particular climate and habitat, finding one tells you what a place was like when it died.
        Explore {b ? <>{fmt(b.sites)} sites and {fmt(b.fossilRecords)} fossil finds</> : "the evidence"} below.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Door to="/map" title="Map of sites" icon="🗺️" tone="bugs">
          See every site on a map. Click one to see what was found there and how old it is.
        </Door>
        <Door to="/species" title="Look up a species" icon="🪲" tone="sead">
          Type a beetle's name. See where and when it turns up, and what climate it needs.
        </Door>
        <Door to="/compare" title="BugsCEP vs SEAD" icon="⚖️" tone="bugs">
          What each database holds, and how much of SEAD's data started life in BugsCEP.
        </Door>
        <Door to="/tables" title="Browse raw tables" icon="📋" tone="sead">
          Every table behind the scenes, if you want to dig further.
        </Door>
      </div>

      <div className="mt-10 rounded-xl border border-line bg-line/30 p-5">
        <div className="text-sm font-semibold uppercase tracking-wide text-muted">Try this first</div>
        <p className="mt-1 text-lg leading-relaxed">
          Look up <Link to="/species/7.005001" className="text-link underline">Helophorus rufipes</Link>, a small water-scavenger beetle, then compare it with{" "}
          <Link to="/species/85.019044" className="text-link underline">Aphodius prodromus</Link>, a dung beetle whose climate range is known.
        </p>
      </div>

      <p className="mt-6 text-sm text-muted">
        Anything with a <span className="term">dotted underline</span> explains itself on hover. Full list in the <Link to="/glossary" className="text-link underline">glossary</Link>.
      </p>
    </div>
  );
}

function Door({ to, title, icon, tone, children }: { to: string; title: string; icon: string; tone: "bugs" | "sead"; children: React.ReactNode }) {
  const border = tone === "bugs" ? "hover:border-bugs/60" : "hover:border-sead/60";
  return (
    <Link to={to} className={`group rounded-xl border border-line bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${border}`}>
      <div className="text-3xl">{icon}</div>
      <div className="mt-2 font-display text-xl font-semibold group-hover:underline">{title} →</div>
      <p className="mt-1 text-sm leading-relaxed text-muted">{children}</p>
    </Link>
  );
}
