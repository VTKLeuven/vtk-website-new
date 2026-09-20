<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Een veld toevoegen aan een rit

`UitleenTransportBooking` draagt ritten die jaren blijven staan. Een nieuwe kolom
verandert niets aan wat er al is: beslis wat ze betekent voor een rit van vorig
jaar en schrijf dat in de comment van de migratie. `docs/uitleendienst.md`,
"Een veld toevoegen aan een rit", geeft de zes gevallen;
`test/rit-kolommen.test.ts` faalt tot de kolom daar geclassificeerd is. De
volledige regel staat in de root-`CLAUDE.md` onder "Ritten van de uitleendienst".
