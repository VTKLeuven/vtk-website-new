import "server-only";

import { prisma } from "@vtk/db";
import { REFERENCE_PATTERN, SCAN_EXCLUDED_TABLES, tableScanSql } from "@/lib/storage-cleanup-plan";

/**
 * Alle `<map>/<24 hex>` die ergens in de database staan, in welke tabel of
 * kolom ook. Bewust generiek en niet per kolom: een nieuwe feature met een
 * eigen key-kolom of een markdownveld zit er zo vanzelf in, en een lijst per
 * kolom zou daar stil achter lopen (die van `storage-insights.ts` kent geen
 * enkele markdowntekst).
 *
 * Faalt één tabel, dan faalt de hele scan: een onvolledige lijst verwijzingen
 * zou levende bestanden als wees aanmerken.
 */
export async function collectReferencedStems(): Promise<{ stems: Set<string>; tables: number }> {
  const columns = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = current_schema()
      AND t.table_type = 'BASE TABLE'
      AND c.data_type IN ('text', 'character varying', 'character', 'json', 'jsonb', 'ARRAY', 'USER-DEFINED')
    ORDER BY c.table_name, c.ordinal_position
  `;

  const byTable = new Map<string, string[]>();
  for (const { table_name: table, column_name: column } of columns) {
    if (SCAN_EXCLUDED_TABLES.has(table)) continue;
    const list = byTable.get(table) ?? [];
    list.push(column);
    byTable.set(table, list);
  }

  const stems = new Set<string>();
  // Na elkaar en niet tegelijk: dit draait naast de site, en de pool is klein.
  for (const [table, tableColumns] of byTable) {
    const rows = await prisma.$queryRawUnsafe<Array<{ stem: string }>>(
      tableScanSql(table, tableColumns),
      REFERENCE_PATTERN,
    );
    for (const row of rows) stems.add(row.stem);
  }
  return { stems, tables: byTable.size };
}
