import { writeFileSync } from "node:fs";
import { scrapeYear, type YearPocs } from "./scrape-poc-history";

function slugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type PocHistoryPerson = {
  id: string;
  name: string;
  photoUrl: string | null;
  reps: Array<{
    pocSlug: string;
    pocName: string;
    year: number;
    order: number;
  }>;
};

export type PocHistoryPocDef = {
  slug: string;
  nameNl: string;
  nameEn: string;
  studyProgrammes: string[];
};

export type PocHistoryFile = {
  pocs: PocHistoryPocDef[];
  people: PocHistoryPerson[];
};

const POC_MAPPING: Record<
  string,
  { slug: string; nameNl: string; nameEn: string; studyProgrammes: string[] }
> = {
  Architectuur: {
    slug: "architectuur",
    nameNl: "Architectuur",
    nameEn: "Architecture",
    studyProgrammes: ["ARCHITECTURE"],
  },
  BMT: {
    slug: "biomedisch",
    nameNl: "Biomedische technologie",
    nameEn: "Biomedical Engineering",
    studyProgrammes: ["BIOMEDICAL"],
  },
  BPOC: {
    slug: "bpoc",
    nameNl: "Bachelor 1",
    nameEn: "Bachelor 1",
    studyProgrammes: ["COMMON_BACHELOR"],
  },
  B1: {
    slug: "bpoc",
    nameNl: "Bachelor 1",
    nameEn: "Bachelor 1",
    studyProgrammes: ["COMMON_BACHELOR"],
  },
  BWK: {
    slug: "bouwkunde",
    nameNl: "Bouwkunde",
    nameEn: "Civil Engineering",
    studyProgrammes: ["CIVIL"],
  },
  "BWK Old": {
    slug: "bouwkunde",
    nameNl: "Bouwkunde",
    nameEn: "Civil Engineering",
    studyProgrammes: ["CIVIL"],
  },
  CIT: {
    slug: "chemische-technologie",
    nameNl: "Chemische technologie",
    nameEn: "Chemical Engineering",
    studyProgrammes: ["CHEMICAL"],
  },
  CW: {
    slug: "computerwetenschappen",
    nameNl: "Computerwetenschappen",
    nameEn: "Computer Science",
    studyProgrammes: ["COMPUTER_SCIENCE"],
  },
  Cybersecurity: {
    slug: "cybersecurity",
    nameNl: "Cybersecurity",
    nameEn: "Cybersecurity",
    studyProgrammes: ["CYBERSECURITY"],
  },
  "Digital Humanities": {
    slug: "digital-humanities",
    nameNl: "Digital Humanities",
    nameEn: "Digital Humanities",
    studyProgrammes: ["DIGITAL_HUMANITIES"],
  },
  ELT: {
    slug: "elektrotechniek",
    nameNl: "Elektrotechniek",
    nameEn: "Electrical Engineering",
    studyProgrammes: ["ELECTRICAL"],
  },
  Energie: {
    slug: "energie",
    nameNl: "Energie",
    nameEn: "Energy",
    studyProgrammes: ["ENERGY"],
  },
  "Ir. AI": {
    slug: "ir-ai",
    nameNl: "Ingenieurswetenschappen AI",
    nameEn: "Engineering AI",
    studyProgrammes: ["ARTIFICIAL_INTELLIGENCE"],
  },
  MTM: {
    slug: "materiaalkunde",
    nameNl: "Materiaalkunde",
    nameEn: "Materials Science",
    studyProgrammes: ["MATERIALS"],
  },
  MSCE: {
    slug: "materiaalkunde",
    nameNl: "Materiaalkunde",
    nameEn: "Materials Science",
    studyProgrammes: ["MATERIALS"],
  },
  Nano: {
    slug: "nano",
    nameNl: "Nanowetenschappen",
    nameEn: "Nanoscience",
    studyProgrammes: ["NANO"],
  },
  "Urbanism, Landscape and Planning": {
    slug: "human-settlements",
    nameNl: "Urbanism, Landscape and Planning",
    nameEn: "Urbanism, Landscape and Planning",
    studyProgrammes: ["URBANISM"],
  },
  "Human Settlements": {
    slug: "human-settlements",
    nameNl: "Human Settlements",
    nameEn: "Human Settlements",
    studyProgrammes: ["URBANISM"],
  },
  WIT: {
    slug: "wiskundige-ingenieurstechnieken",
    nameNl: "Wiskundige ingenieurstechnieken",
    nameEn: "Mathematical Engineering",
    studyProgrammes: ["MATHEMATICAL"],
  },
  WTK: {
    slug: "werktuigkunde",
    nameNl: "Werktuigkunde",
    nameEn: "Mechanical Engineering",
    studyProgrammes: ["MECHANICAL"],
  },
  MAI: {
    slug: "mai",
    nameNl: "Master of Artificial Intelligence",
    nameEn: "Master of Artificial Intelligence",
    studyProgrammes: ["ARTIFICIAL_INTELLIGENCE"],
  },
  "Safety Engineering": {
    slug: "safety-engineering",
    nameNl: "Safety Engineering",
    nameEn: "Safety Engineering",
    studyProgrammes: [],
  },
  VLITS: {
    slug: "vlits",
    nameNl: "VLITS",
    nameEn: "VLITS",
    studyProgrammes: [],
  },
};

async function main() {
  const years = [2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016];
  console.log(`Scraping POC history for years: ${years.join(", ")}...`);

  // Map person name (normalized) -> PocHistoryPerson
  const peopleMap = new Map<string, PocHistoryPerson>();
  const pocDefsMap = new Map<string, PocHistoryPocDef>();

  for (const [rawName, def] of Object.entries(POC_MAPPING)) {
    if (!pocDefsMap.has(def.slug)) {
      pocDefsMap.set(def.slug, def);
    }
  }

  for (const y of years) {
    const yearData = await scrapeYear(y);
    console.log(`Scraped year ${yearData.yearStr}: ${yearData.pocs.length} POCs`);

    for (const poc of yearData.pocs) {
      const mapping = POC_MAPPING[poc.name] || {
        slug: slugify(poc.name),
        nameNl: poc.name,
        nameEn: poc.name,
        studyProgrammes: [],
      };

      if (!pocDefsMap.has(mapping.slug)) {
        pocDefsMap.set(mapping.slug, mapping);
      }

      for (const mem of poc.members) {
        const normName = mem.name.trim().toLowerCase();
        let person = peopleMap.get(normName);

        if (!person) {
          const id = slugify(mem.name) || `person-${peopleMap.size + 1}`;
          person = {
            id,
            name: mem.name.trim(),
            photoUrl: mem.photoUrl,
            reps: [],
          };
          peopleMap.set(normName, person);
        } else {
          // If we find a photo in a newer year, prefer it
          if (mem.photoUrl && !person.photoUrl) {
            person.photoUrl = mem.photoUrl;
          }
        }

        person.reps.push({
          pocSlug: mapping.slug,
          pocName: mapping.nameNl,
          year: y,
          order: mem.order,
        });
      }
    }
  }

  // Deduplicate person IDs if any collide
  const seenIds = new Set<string>();
  for (const person of peopleMap.values()) {
    let baseId = person.id;
    let counter = 2;
    while (seenIds.has(person.id)) {
      person.id = `${baseId}-${counter++}`;
    }
    seenIds.add(person.id);
  }

  const peopleList = Array.from(peopleMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "nl")
  );

  const pocList = Array.from(pocDefsMap.values());

  const result: PocHistoryFile = {
    pocs: pocList,
    people: peopleList,
  };

  const totalReps = peopleList.reduce((acc, p) => acc + p.reps.length, 0);
  const totalPhotos = peopleList.filter((p) => p.photoUrl).length;

  console.log(
    `Total: ${peopleList.length} unique people, ${totalReps} memberships across 10 years, ${totalPhotos} photos.`
  );

  writeFileSync("scripts/poc-history.json", JSON.stringify(result, null, 2), "utf8");
  console.log(`Saved to scripts/poc-history.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
