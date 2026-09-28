// Ages from both databases are stored as "years before 1950" (BP). We show them as years ago.
export const NOW_OFFSET = new Date().getFullYear() - 1950;

export const yearsAgo = (bp: number) => Math.max(0, Math.round(bp + NOW_OFFSET));

const fmt = (n: number) => n.toLocaleString("en-GB");

export function roundNice(n: number) {
  if (n >= 100_000) return Math.round(n / 1000) * 1000;
  if (n >= 10_000) return Math.round(n / 100) * 100;
  if (n >= 1_000) return Math.round(n / 50) * 50;
  return Math.round(n / 10) * 10;
}

/** "about 3,000 years ago (around 1000 BC)" */
export function describeBP(bp: number) {
  const ago = roundNice(yearsAgo(bp));
  const year = 1950 - bp;
  const cal = ago > 12_000 ? "" : year > 0 ? ` (around AD ${fmt(Math.round(year))})` : ` (around ${fmt(Math.round(1 - year))} BC)`;
  return `about ${fmt(ago)} years ago${cal}`;
}

export function describeRange(oldestBP: number, youngestBP: number) {
  if (Math.abs(oldestBP - youngestBP) < 30) return describeBP(oldestBP);
  const a = roundNice(yearsAgo(oldestBP)), b = roundNice(yearsAgo(youngestBP));
  if (a === b) return describeBP(oldestBP);
  return `between about ${fmt(b)} and ${fmt(a)} years ago`;
}

export const AGE_BINS: { label: string; max: number }[] = [
  { label: "< 500", max: 500 }, { label: "500–1k", max: 1000 }, { label: "1k–2k", max: 2000 }, { label: "2k–4k", max: 4000 },
  { label: "4k–8k", max: 8000 }, { label: "8k–12k", max: 12000 }, { label: "12k–20k", max: 20000 }, { label: "20k–50k", max: 50000 },
  { label: "50k–130k", max: 130000 }, { label: "> 130k", max: Infinity },
];
