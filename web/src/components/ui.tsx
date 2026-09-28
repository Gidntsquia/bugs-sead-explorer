import { useState, type ReactNode } from "react";
import { ApiError } from "../api";

/** Like <details>, but children are only mounted when open — so a collapsed
 *  section adds one button to the page, not a hidden table full of links. */
export function Expandable({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={className}>
      <button onClick={() => setOpen(o => !o)} className="mt-2 text-sm font-medium text-link hover:underline">
        {open ? "▾ " : "▸ "}{label}
      </button>
      {open && <div className="mt-1 text-sm">{children}</div>}
    </div>
  );
}

export function Card({ title, subtitle, children, className = "", right }: { title?: ReactNode; subtitle?: ReactNode; children: ReactNode; className?: string; right?: ReactNode }) {
  return (
    <section className={`rounded-xl border border-line bg-card p-4 shadow-sm ${className}`}>
      {(title || right) && (
        <div className="mb-2 flex items-start justify-between gap-3">
          <div>
            {title && <h3 className="font-display text-lg font-semibold leading-tight">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, tone }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: "bugs" | "sead" }) {
  const c = tone === "bugs" ? "text-bugs" : tone === "sead" ? "text-sead" : "text-ink";
  return (
    <div className="rounded-lg border border-line bg-card px-3 py-2">
      <div className={`font-display text-2xl font-semibold ${c}`}>{typeof value === "number" ? value.toLocaleString("en-GB") : value}</div>
      <div className="text-sm text-ink">{label}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}

/** Used whenever a piece of information does not exist, so the user never sees an empty box. */
export function Missing({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-line bg-paper px-3 py-2 text-sm text-muted">⌀ {children}</div>;
}

export function Loading({ what = "Loading" }: { what?: string }) {
  return <div className="animate-pulse px-1 py-3 text-sm text-muted">{what}…</div>;
}

export function ErrorBox({ error, what }: { error: ApiError | Error; what?: string }) {
  const sead = (error as ApiError).seadUnreachable;
  return (
    <div className={`rounded-lg border px-3 py-2 text-sm ${sead ? "border-sead/40 bg-sead-soft text-sead" : "border-red-300 bg-red-50 text-red-800"}`}>
      {sead ? <><b>SEAD is unreachable.</b> {what ? `This part (${what.charAt(0).toLowerCase() + what.slice(1)}) comes live from SEAD's public server, which isn't answering right now.` : "This part comes live from SEAD's public server, which isn't answering right now."} Check your internet connection; BugsCEP parts keep working.</> : <><b>Something went wrong.</b> {error.message}</>}
    </div>
  );
}

export function Badge({ tone, children }: { tone: "bugs" | "sead" | "plain"; children: ReactNode }) {
  const c = tone === "bugs" ? "bg-bugs-soft text-bugs" : tone === "sead" ? "bg-sead-soft text-sead" : "bg-paper text-muted border border-line";
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${c}`}>{children}</span>;
}

export const fmt = (n: number | null | undefined) => (n == null ? "–" : Number(n).toLocaleString("en-GB"));

export function Explain({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-sm leading-relaxed text-muted">{children}</p>;
}
