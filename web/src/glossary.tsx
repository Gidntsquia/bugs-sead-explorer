import { useState, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

// Every technical word shown on screen should have an entry here, in plain language.
export const GLOSSARY: Record<string, { term: string; text: string }> = {
  bugscep: { term: "BugsCEP", text: "Bugs Coleopteran Ecology Package: a database of fossil beetles (and a few other insects) found at archaeological and natural sites, mostly in Europe, plus what each species needs to live today. Built by Philip Buckland and colleagues." },
  sead: { term: "SEAD", text: "Strategic Environmental Archaeology Database, run from Umeå University in Sweden. A much larger database that gathers many kinds of evidence about past environments: insects, pollen, seeds, tree rings, pottery, soil chemistry and more. BugsCEP's data was imported into it." },
  site: { term: "site", text: "A place where samples were taken: an archaeological dig, a peat bog, a lake core, a riverbank." },
  sample: { term: "sample", text: "One bag or slice of material taken from a site, usually from one layer. Beetles, pollen and so on are picked out of samples and counted." },
  physical_sample: { term: "physical sample", text: "SEAD's word for a sample: one actual piece of material taken from a site." },
  sample_group: { term: "sample group", text: "A set of samples taken together at a site, such as all the samples from one trench or one core." },
  taxon: { term: "taxon", text: "Any named group of living things. Usually here it means a species (e.g. Helophorus rufipes), but it can be a genus or family when the fossil could only be identified that far. Plural: taxa." },
  species: { term: "species", text: "A single kind of organism, written as genus + species name, e.g. Helophorus rufipes." },
  genus: { term: "genus", text: "A group of closely related species; the first word of a scientific name (Helophorus in Helophorus rufipes)." },
  family: { term: "family", text: "A larger group of related genera. Beetle families end in -idae, e.g. CARABIDAE (ground beetles)." },
  indet: { term: "indet. / spp. / sp.", text: "'indet.' = could not be identified further; 'sp.' = one unidentified species of this genus; 'spp.' = several species of this genus." },
  fossil_record: { term: "fossil record", text: "One line in BugsCEP saying 'this taxon was found in this sample, this many times'." },
  abundance: { term: "abundance", text: "How many individuals were counted. For beetles this is the minimum number of individuals, worked out from the body parts found (heads, wing cases...)." },
  habitat: { term: "habitat group", text: "The kind of place a beetle lives today (e.g. woodland, dung, standing water). If a fossil beetle lived in dung, there was probably dung — and animals — around when that layer formed." },
  mcr: { term: "MCR (Mutual Climatic Range)", text: "A method for working out past temperatures from beetles. Each species can only live within certain summer and winter temperatures today. Where the ranges of all species found in one sample overlap is the likely climate when they lived." },
  tmax: { term: "warmest-month temperature", text: "The average temperature of the warmest month (usually July) in places where the species lives today." },
  tmin: { term: "coldest-month temperature", text: "The average temperature of the coldest month (usually January) in places where the species lives today." },
  radiocarbon: { term: "radiocarbon date", text: "An age measured from the decay of carbon-14 in once-living material (wood, peat, bone). Given in 'radiocarbon years BP', which are close to but not the same as calendar years; they must be 'calibrated' to become calendar years." },
  radiometric: { term: "radiometric date", text: "An age measured from the decay of a radioactive element or a related physical effect (radiocarbon, thermoluminescence, uranium series...)." },
  bp: { term: "BP", text: "'Before Present', where 'present' is fixed at the year 1950. 3,000 BP ≈ 1050 BC. We add the years since 1950 to show 'years ago'." },
  calendar_date: { term: "calendar date", text: "An age given as an ordinary year (AD/BC), often from archaeology, historical records or tree rings." },
  period_date: { term: "period date", text: "An age given by naming a period (e.g. 'Late Bronze Age', 'Allerød interstadial') instead of a number. We use the period's usual start and end years." },
  holocene: { term: "Holocene", text: "The current warm period, from about 11,700 years ago to now. Before it came the last Ice Age (the late Pleistocene)." },
  analysis_entity: { term: "analysis entity", text: "SEAD's word for 'one analysis of one sample in one dataset'. For example, counting the beetles in sample 3 is one analysis entity; radiocarbon-dating the same sample is another." },
  dataset: { term: "dataset", text: "In SEAD, a set of results made with one method, usually from one publication or one lab." },
  method: { term: "analysis type (method)", text: "What was done to a sample: beetle counting (palaeoentomology), pollen counting (palynology), tree-ring dating (dendrochronology), soil chemistry, and so on." },
  source: { term: "data source", text: "Where SEAD got a dataset from: BugsCEP, the Umeå environmental archaeology lab, the Lund tree-ring or pottery labs, etc. SEAD calls these 'dataset masters'." },
  palaeoentomology: { term: "palaeoentomology", text: "The study of fossil insects. In practice mostly beetles, which survive well in waterlogged layers." },
  dendrochronology: { term: "dendrochronology", text: "Dating wood by matching its pattern of wide and narrow tree rings to a known sequence. Can give the exact year a tree was felled." },
  palynology: { term: "palynology", text: "The study of pollen (and spores). Pollen in a layer shows which plants grew nearby." },
  macrofossil: { term: "plant macrofossils", text: "Plant remains visible without a microscope: seeds, fruits, leaves, twigs." },
  petrographic: { term: "petrographic microscopy", text: "Looking at a thin slice of pottery under a microscope to see what clay and temper it was made of." },
  proxy: { term: "proxy", text: "Evidence that stands in for something we can't measure directly, e.g. beetles or pollen as a proxy for past climate and landscape." },
  synanthropic: { term: "synanthropic", text: "Living with or near people: in houses, stored grain, rubbish." },
  api: { term: "public API", text: "A web address that returns data to programs instead of web pages. SEAD offers one that anyone can read without logging in; this app asks it questions live." },
  row: { term: "row", text: "One record in a table, e.g. one site or one fossil find." },
  column: { term: "column", text: "One field that every row has, e.g. site name or latitude." },
  lat_lon: { term: "coordinates", text: "Latitude (north–south) and longitude (east–west) in decimal degrees; how a point is placed on the map." },
  sample_code_match: { term: "sample-code match", text: "When BugsCEP data was copied into SEAD, each sample kept its original BugsCEP code (e.g. SAMP000604). Finding the same code in both is an exact link." },
};

export type TermKey = keyof typeof GLOSSARY;

/** A word with a dotted underline; hovering or focusing it shows a plain explanation. */
export function T({ k, children }: { k: TermKey; children?: ReactNode }) {
  const g = GLOSSARY[k];
  const [pos, setPos] = useState<{ x: number; y: number; above: boolean } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const above = r.bottom + 160 > window.innerHeight;
    setPos({ x: Math.min(Math.max(8, r.left), window.innerWidth - 328), y: above ? r.top - 6 : r.bottom + 6, above });
  };
  if (!g) return <>{children}</>;
  return (
    <span ref={ref} tabIndex={0} className="term" onMouseEnter={show} onMouseLeave={() => setPos(null)} onFocus={show} onBlur={() => setPos(null)}>
      {children ?? g.term}
      {pos && createPortal(
        <span role="tooltip" style={{ left: pos.x, top: pos.y, transform: pos.above ? "translateY(-100%)" : undefined }}
          className="fixed z-[2000] w-80 rounded-lg border border-line bg-ink px-3 py-2 text-left text-[13px] font-normal leading-snug text-paper shadow-xl normal-case tracking-normal">
          <b className="font-semibold">{g.term}</b>: {g.text}
        </span>, document.body)}
    </span>
  );
}
