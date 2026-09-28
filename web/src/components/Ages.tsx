import { T } from "../glossary";
import { describeBP, describeRange } from "../ages";
import { Missing } from "./ui";

export type AgeItem = { kind: string; label: string; olderBP: number | null; youngerBP: number | null; sample?: string; sampleCode?: string; detail?: string };

const KIND: Record<string, { title: React.ReactNode; order: number }> = {
  radiocarbon: { title: <T k="radiocarbon">Radiocarbon dates</T>, order: 1 },
  radiometric: { title: <T k="radiometric">Other measured dates</T>, order: 2 },
  calendar: { title: <T k="calendar_date">Calendar dates</T>, order: 3 },
  period: { title: <T k="period_date">Dated by period</T>, order: 4 },
  estimate: { title: "SEAD's age estimates", order: 5 },
};

export function AgeSummary({ summary }: { summary: { oldestBP: number; youngestBP: number } | null }) {
  if (!summary) return <Missing>No dates recorded for this site, so we can't say how old it is.</Missing>;
  return <p className="text-base"><b>Roughly {describeRange(summary.oldestBP, summary.youngestBP)}</b><span className="text-sm text-muted"> — the span covered by all its dates (<T k="bp">BP</T> converted to years ago)</span></p>;
}

export function AgeList({ ages, max = 8 }: { ages: AgeItem[]; max?: number }) {
  if (!ages.length) return null;
  const groups = Object.entries(Object.groupBy(ages, a => a.kind)).sort((a, b) => (KIND[a[0]]?.order ?? 9) - (KIND[b[0]]?.order ?? 9));
  return (
    <div className="mt-2 space-y-2">
      {groups.map(([kind, items]) => {
        // collapse identical labels (e.g. the same period used for many samples)
        const uniq = [...new Map(items!.map(i => [i.label, { ...i, n: items!.filter(j => j.label === i.label).length }])).values()];
        return (
          <div key={kind}>
            <div className="text-sm font-semibold">{KIND[kind]?.title ?? kind} <span className="font-normal text-muted">({items!.length})</span></div>
            <ul className="mt-0.5 space-y-0.5 text-sm">
              {uniq.slice(0, max).map((a, i) => (
                <li key={i} className="flex flex-wrap gap-x-2">
                  <span>{a.label}{a.n > 1 && <span className="text-muted"> ×{a.n}</span>}</span>
                  {a.olderBP != null && <span className="text-muted">→ {a.youngerBP != null && a.youngerBP !== a.olderBP ? describeRange(a.olderBP, a.youngerBP) : describeBP(a.olderBP)}</span>}
                  {a.detail && <span className="text-xs text-muted">({a.detail.length > 90 ? a.detail.slice(0, 90) + "…" : a.detail})</span>}
                </li>
              ))}
              {uniq.length > max && <li className="text-xs text-muted">…and {uniq.length - max} more</li>}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
