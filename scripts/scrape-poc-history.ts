export type ScrapedPocMember = {
  name: string;
  photoUrl: string | null;
  order: number;
};

export type ScrapedPoc = {
  name: string;
  email: string | null;
  members: ScrapedPocMember[];
};

export type YearPocs = {
  year: number;
  yearStr: string;
  pocs: ScrapedPoc[];
};

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function scrapeYear(year: number): Promise<YearPocs> {
  const yearStr = `${year}-${year + 1}`;
  const url = `https://vtk.be/nl/poc/overview/${yearStr}/`;

  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
  });

  if (!resp.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${resp.status}`);
  }

  const html = await resp.text();

  // Split by whitesmoke containers (each POC is a container)
  const pocs: ScrapedPoc[] = [];

  // Match each <div class="container" style="...background: whitesmoke...">...</div>
  // Or match h3 within container
  const containerRegex = /<div\s+class="container"[^>]*background:\s*whitesmoke[^>]*>([\s\S]*?)(?=<div\s+class="container"[^>]*background:\s*whitesmoke|<\/body|$)/gi;
  let containerMatch: RegExpExecArray | null;

  while ((containerMatch = containerRegex.exec(html)) !== null) {
    const containerContent = containerMatch[1];

    // Extract H3 header: <h3[^>]*>([\s\S]*?)<\/h3>
    const h3Match = /<h3[^>]*>([\s\S]*?)<\/h3>/i.exec(containerContent);
    if (!h3Match) continue;

    const rawH3 = h3Match[1];

    // Extract email if present: href="mailto:..."
    const mailtoMatch = /href=["']mailto:([^"']+)["']/i.exec(rawH3);
    const email = mailtoMatch ? mailtoMatch[1].trim().toLowerCase() : null;

    // Extract title text without tags and without parentheses
    let pocName = rawH3.replace(/<[^>]+>/g, "").replace(/\(.*?\)/g, "").trim();
    pocName = pocName.replace(/^POC\s+/i, "").trim();
    pocName = decodeHtmlEntities(pocName);

    // Extract members within <div class="member" ...>...</div>
    const members: ScrapedPocMember[] = [];
    const memberRegex = /<div\s+class="member"[^>]*>([\s\S]*?)<\/div>\s*(?=<div\s+class="member"|<\/div|$)/gi;
    let memberMatch: RegExpExecArray | null;
    let order = 0;

    while ((memberMatch = memberRegex.exec(containerContent)) !== null) {
      const memberHtml = memberMatch[1];

      // Extract name from <h5>...</h5>
      const h5Match = /<h5[^>]*>([\s\S]*?)<\/h5>/i.exec(memberHtml);
      if (!h5Match) continue;

      let name = h5Match[1].replace(/<[^>]+>/g, "").trim();
      name = decodeHtmlEntities(name);
      if (!name) continue;

      // Extract photo URL if present
      let photoUrl: string | null = null;
      const photoMatch = /background-image:\s*url\(([^)]+)\)/i.exec(memberHtml);
      if (photoMatch) {
        let rawPhoto = photoMatch[1].replace(/['"]/g, "").trim();
        rawPhoto = decodeHtmlEntities(rawPhoto);
        if (rawPhoto.startsWith("/")) {
          rawPhoto = `https://vtk.be${rawPhoto}`;
        }
        if (!rawPhoto.includes("generic_profile.png") && rawPhoto.startsWith("http")) {
          photoUrl = rawPhoto;
        }
      }

      members.push({
        name,
        photoUrl,
        order: order++,
      });
    }

    if (pocName && (members.length > 0 || email)) {
      pocs.push({
        name: pocName,
        email,
        members,
      });
    }
  }

  return {
    year,
    yearStr,
    pocs,
  };
}

async function run() {
  const years = [2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016];
  const allData: YearPocs[] = [];

  for (const y of years) {
    try {
      const data = await scrapeYear(y);
      console.log(`Year ${data.yearStr}: found ${data.pocs.length} POCs, total ${data.pocs.reduce((acc, p) => acc + p.members.length, 0)} members`);
      for (const p of data.pocs) {
        console.log(`  - POC "${p.name}" (${p.email ?? "no email"}): ${p.members.length} members (${p.members.filter(m => m.photoUrl).length} with photo)`);
      }
      allData.push(data);
    } catch (err) {
      console.error(`Error scraping ${y}:`, err);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run();
}
