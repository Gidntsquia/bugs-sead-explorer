// Slice, MCR-estimate and ghost-species logic shared by the server (precomputed curve) and the page (instant slider).
export const MIN_MCR = 5;

export type Range = { kind: string; label: string; detail?: string; older: number; younger: number };
export type TMSample = { code: string; depthTop: number | null; depthBot: number | null; ranges: Range[]; taxa: { code: string; n: number }[] };
export type Mcr = { tMaxLo: number; tMaxHi: number; tRangeLo: number; tRangeHi: number };
export type Interval = [number, number];

export type Estimate =
  | { status: "none"; n: number; species: string[] }
  | { status: "ok"; n: number; species: string[]; summer: Interval; winter: Interval }
  | { status: "nearmiss"; n: number; k: number; basis: "summer" | "range"; agree: Interval; winter: Interval | null; included: string[]; excluded: string[] };

export const sampleContains = (s: TMSample, year: number) => s.ranges.some(r => year <= r.older && year >= r.younger);

function intersect(iv: Interval[]): Interval | null {
  const lo = Math.max(...iv.map(i => i[0])), hi = Math.min(...iv.map(i => i[1]));
  return lo <= hi ? [lo, hi] : null;
}

// The interval shared by the largest number of the given intervals (first one wins a tie).
function bestOverlap(iv: Interval[]): { k: number; agree: Interval; members: number[] } {
  let best = { k: 0, agree: [0, 0] as Interval, members: [] as number[] };
  for (const [x] of iv) {
    const members = iv.map((v, i) => (v[0] <= x && x <= v[1] ? i : -1)).filter(i => i >= 0);
    if (members.length > best.k) best = { k: members.length, agree: intersect(members.map(i => iv[i]))!, members };
  }
  return best;
}

export function estimate(mcrCodes: string[], mcr: Record<string, Mcr>, name: (c: string) => string): Estimate {
  const n = mcrCodes.length;
  const species = mcrCodes.map(name);
  if (n < MIN_MCR) return { status: "none", n, species };
  const summers = mcrCodes.map(c => [mcr[c].tMaxLo, mcr[c].tMaxHi] as Interval);
  const ranges = mcrCodes.map(c => [mcr[c].tRangeLo, mcr[c].tRangeHi] as Interval);
  const s = intersect(summers), r = intersect(ranges);
  if (s && r) return { status: "ok", n, species, summer: s, winter: [s[0] - r[1], s[1] - r[0]] };
  // No full overlap: report the interval the most species agree on (summer, or range when summers all agree).
  const bs = bestOverlap(summers), br = bestOverlap(ranges);
  const useSummer = !s || bs.k <= br.k;
  const b = useSummer ? bs : br;
  const inc = new Set(b.members);
  let winter: Interval | null = null;
  if (useSummer) {
    const rr = intersect(b.members.map(i => ranges[i]));
    if (rr) winter = [b.agree[0] - rr[1], b.agree[1] - rr[0]];
  }
  return { status: "nearmiss", n, k: b.k, basis: useSummer ? "summer" : "range", agree: b.agree, winter,
    included: mcrCodes.filter((_, i) => inc.has(i)).map(name), excluded: mcrCodes.filter((_, i) => !inc.has(i)).map(name) };
}

export function sliceAt(year: number, samples: TMSample[]) {
  const inSlice = samples.filter(s => sampleContains(s, year));
  const counts = new Map<string, number>();
  for (const s of inSlice) for (const t of s.taxa) counts.set(t.code, (counts.get(t.code) ?? 0) + t.n);
  return { samples: inSlice, taxa: [...counts].map(([code, n]) => ({ code, n })) };
}

// Terms whose presence in a TDistrib text means "still lives around here".
export function localTerms(country: string | null, region: string | null): string[] {
  const c = (country ?? "").trim().toLowerCase();
  const t: string[] = [];
  if (country) t.push(country.trim());
  if (region) t.push(region.trim());
  if (["england", "scotland", "wales"].includes(c)) t.push("British Isles", "Britain", "Great Britain", "UK");
  else if (c === "ireland") t.push("British Isles", "Ireland");
  else if (c === "northern ireland") t.push("British Isles", "Ireland", "UK");
  return t;
}

export const isGhost = (text: string, terms: string[]) =>
  !terms.some(t => new RegExp(`(^|[^a-z])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`, "i").test(text));
