/** Validate scripts/praesidium-history.json against the exact zod schema
 *  used by scripts/import-praesidium-history.ts (mirrored here, since the
 *  script does not export its schemas). Run with: npx tsx scripts/validate-praesidium-json.ts */
import { readFileSync } from "node:fs";
import { z } from "zod";

const membershipSchema = z.object({
  post: z.string().min(1),
  year: z.number().int().gte(1950).lte(2100),
  role: z.enum(["MEMBER", "LEAD"]).default("MEMBER"),
  titleNl: z.string().min(1).optional(),
  titleEn: z.string().min(1).optional(),
  order: z.number().int().default(0),
});

const personSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  photo: z.string().url().optional(),
  memberships: z.array(membershipSchema).min(1),
});

const postDefSchema = z.object({
  name: z.string().min(1),
  nameEn: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  active: z.boolean().optional(),
});

const fileSchema = z.object({
  posts: z.array(postDefSchema).default([]),
  people: z.array(personSchema).min(1),
});

const raw = JSON.parse(readFileSync("scripts/praesidium-history.json", "utf8"));
const parsed = fileSchema.safeParse(raw);
if (!parsed.success) {
  console.error("VALIDATION FAILED:");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".") || "(root)"}: ${issue.message}`);
  }
  process.exit(1);
}

// Duplicate id check (same rule as the import script).
const seen = new Set<string>();
const dups = new Set<string>();
for (const p of parsed.data.people) {
  if (seen.has(p.id)) dups.add(p.id);
  seen.add(p.id);
}
if (dups.size > 0) {
  console.error("VALIDATION FAILED: duplicate person ids:", [...dups].join(", "));
  process.exit(1);
}

// Duplicate (id, year, post) memberships within one person (would collide on
// the DB unique index userId_groupId_year -> the import would silently merge).
let colliding = 0;
for (const p of parsed.data.people) {
  const keyed = new Set<string>();
  for (const m of p.memberships) {
    const k = `${m.year}|${m.post.toLowerCase()}`;
    if (keyed.has(k)) {
      colliding++;
      console.error(`  !! ${p.id} ${p.name}: duplicate membership ${m.year} ${m.post}`);
    }
    keyed.add(k);
  }
}

const years = new Set<number>();
let titles = 0;
for (const p of parsed.data.people) for (const m of p.memberships) { years.add(m.year); if (m.titleNl) titles++; }
console.log(`VALIDATION OK: ${parsed.data.people.length} people, ` +
  `${parsed.data.people.reduce((n, p) => n + p.memberships.length, 0)} memberships, ` +
  `${titles} with titleNl, years ${Math.min(...years)}-${Math.max(...years)}`);
if (colliding > 0) process.exit(1);
