import { useState } from "react";
import { GLOSSARY } from "../glossary";

export default function Glossary() {
  const [q, setQ] = useState("");
  const items = Object.entries(GLOSSARY)
    .filter(([, g]) => !q.trim() || `${g.term} ${g.text}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort(([, a], [, b]) => a.term.localeCompare(b.term, "en", { sensitivity: "base" }));
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="font-display text-3xl font-bold">Glossary</h1>
      <p className="mt-1 text-muted">Every technical word used in the app, in plain language. The same text appears when you hover a <span className="term">dotted-underlined</span> word.</p>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search terms" className="mt-4 w-full rounded-lg border border-line bg-card px-3 py-2 outline-none focus:border-ink/50" />
      <dl className="mt-4 divide-y divide-line rounded-xl border border-line bg-card">
        {items.map(([k, g]) => (
          <div key={k} id={k} className="px-4 py-3">
            <dt className="font-semibold">{g.term}</dt>
            <dd className="mt-0.5 text-sm leading-relaxed text-ink/85">{g.text}</dd>
          </div>
        ))}
        {!items.length && <p className="px-4 py-3 text-sm text-muted">No term matches “{q}”.</p>}
      </dl>
    </div>
  );
}
