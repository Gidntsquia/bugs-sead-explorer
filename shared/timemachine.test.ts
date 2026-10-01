import { expect, test } from "bun:test";
import { estimate, isGhost, localTerms, type Mcr } from "./timemachine";

const m = (a: number, b: number, c: number, d: number): Mcr => ({ tMaxLo: a, tMaxHi: b, tRangeLo: c, tRangeHi: d });
const name = (c: string) => `sp${c}`;

test("fewer than 5 MCR species gives no temperature", () => {
  const e = estimate(["1", "2"], { "1": m(10, 20, 10, 30), "2": m(12, 22, 10, 30) }, name);
  expect(e.status).toBe("none");
});

test("full overlap: summer intersection, winter = summer - range", () => {
  const mcr = Object.fromEntries(["1", "2", "3", "4", "5"].map(c => [c, m(10 + Number(c), 20 + Number(c), 10, 30)]));
  const e = estimate(Object.keys(mcr), mcr, name);
  expect(e).toMatchObject({ status: "ok", summer: [15, 21], winter: [-15, 11] });
});

test("conflicting envelopes give near-miss with the odd one out named", () => {
  const mcr: Record<string, Mcr> = { "1": m(10, 20, 10, 30), "2": m(12, 22, 10, 30), "3": m(11, 21, 10, 30), "4": m(13, 19, 10, 30), "5": m(25, 30, 10, 30) };
  const e = estimate(Object.keys(mcr), mcr, name);
  expect(e).toMatchObject({ status: "nearmiss", k: 4, agree: [13, 19], excluded: ["sp5"] });
});

test("ghost rule", () => {
  const t = localTerms("Wales", "Powys");
  expect(isGhost("British Isles: Widespread. Ireland: 1 old record.", t)).toBe(false);
  expect(isGhost("Norway: N. Sweden: Skåne. Ukraine.", t)).toBe(true);
});
