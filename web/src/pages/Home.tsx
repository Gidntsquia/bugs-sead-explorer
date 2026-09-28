import { Link } from "react-router-dom";
import { T } from "../glossary";
import { useApi } from "../useApi";
import { Stat, fmt } from "../components/ui";

export default function Home() {
  const bugs = useApi<any>("bugs/summary");
  const b = bugs.data;
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="font-display text-4xl font-bold leading-tight md:text-5xl">What beetles buried in the ground can tell us about the past</h1>
      <p className="mt-3 max-w-3xl text-lg leading-relaxed text-muted">
        Beetle wing cases and heads survive for thousands of years in wet soil, peat and old rubbish. Each species lives only in certain places and climates,
        so finding them in an old layer tells you what the landscape, the climate and the people were like when that layer formed.
        This app lets you look around two databases of that kind of evidence.
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border-2 border-bugs/30 bg-card p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-bugs">Database 1 · read from a file on this computer</div>
          <h2 className="mt-1 font-display text-2xl font-semibold">BugsCEP</h2>
          <p className="mt-2 leading-relaxed">
            A database of <b>fossil beetles</b>. For about 1,400 <T k="site">sites</T> (mostly in Britain and northern Europe) it lists which beetles were found in which
            layer (<T k="sample">sample</T>), and how old those layers are. It also describes every beetle <T k="species">species</T> as it lives today: its{" "}
            <T k="habitat">habitat</T>, where it is found, and for some species the temperatures it can survive (<T k="mcr">MCR</T>).
          </p>
          {b && (
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Stat tone="bugs" label="sites" value={b.sites} />
              <Stat tone="bugs" label="samples" value={b.samples} />
              <Stat tone="bugs" label={<T k="fossil_record">fossil records</T>} value={b.fossilRecords} />
            </div>
          )}
          {bugs.error && <p className="mt-3 text-sm text-red-700">{bugs.error.message}</p>}
        </div>
        <div className="rounded-xl border-2 border-sead/30 bg-card p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-sead">Database 2 · read live from the internet</div>
          <h2 className="mt-1 font-display text-2xl font-semibold">SEAD</h2>
          <p className="mt-2 leading-relaxed">
            The Strategic Environmental Archaeology Database (Umeå University, Sweden). A bigger, broader collection: beetles (BugsCEP was copied into it), but also
            pollen, seeds, <T k="dendrochronology">tree rings</T>, pottery, soil chemistry and <T k="radiocarbon">radiocarbon dates</T>, from several labs.
            This app asks SEAD's <T k="api">public API</T> each time, so you always see its current data.
          </p>
          <p className="mt-3 text-sm text-muted">SEAD numbers load on the <Link className="text-link underline" to="/compare">comparison page</Link>.</p>
        </div>
      </div>

      <h2 className="mt-10 font-display text-2xl font-semibold">Four ways in</h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Door to="/map" title="Map of sites" icon="🗺️">Every site from both databases on one map. Click one to see what was found there and how old it is.</Door>
        <Door to="/species" title="Look up a species" icon="🪲">Type a beetle's name. See where and when it was found, where it lives today, and what temperatures it tolerates.</Door>
        <Door to="/tables" title="Browse the raw tables" icon="📋">Every table in both databases, what it holds, and its rows. Filter and sort to poke around.</Door>
        <Door to="/compare" title="BugsCEP vs SEAD" icon="⚖️">What each database holds, how much of SEAD came from BugsCEP, and what SEAD adds.</Door>
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        <Idea title="Try this first">Open the map, type <b>Thorne</b> in the search box, and click <i>Thorne Moors Trackway Site</i>: a Bronze Age wooden trackway across a bog in Yorkshire.</Idea>
        <Idea title="Then this">Look up <Link to="/species/7.005001" className="text-link underline">Helophorus rufipes</Link>, a small water-scavenger beetle, and see where and when it turns up. Then try the dung beetle <Link to="/species/85.019044" className="text-link underline">Aphodius prodromus</Link> to see a temperature range.</Idea>
        <Idea title="Words you don't know">Anything with a <span className="term">dotted underline</span> explains itself when you hover over it. All terms are also in the <Link to="/glossary" className="text-link underline">glossary</Link>.</Idea>
      </div>

      {b && (
        <p className="mt-10 text-sm text-muted">
          In BugsCEP: {fmt(b.taxa)} <T k="taxon">taxa</T> listed, {fmt(b.taxaFound)} of them actually found as fossils; {fmt(b.taxaWithMCR)} species have a temperature range;
          {" "}{fmt(b.datedSamples)} of {fmt(b.samples)} samples have some kind of date.
        </p>
      )}
    </div>
  );
}

function Door({ to, title, icon, children }: { to: string; title: string; icon: string; children: React.ReactNode }) {
  return (
    <Link to={to} className="group rounded-xl border border-line bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-ink/40 hover:shadow-md">
      <div className="text-2xl">{icon}</div>
      <div className="mt-1 font-display text-lg font-semibold group-hover:underline">{title}</div>
      <p className="mt-1 text-sm leading-relaxed text-muted">{children}</p>
    </Link>
  );
}

function Idea({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-line/40 p-4 text-sm leading-relaxed">
      <div className="mb-1 font-semibold">{title}</div>
      {children}
    </div>
  );
}
