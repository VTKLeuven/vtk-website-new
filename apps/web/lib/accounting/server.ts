import "server-only";

import { prisma } from "@vtk/db";
import {
  MEMBERSHIP_DEFAULT_ACCOUNTING_CODE,
  orderAccountingCodes,
  type AccountingCodeOption,
} from "./codes";

/** Alle codes, in de volgorde van het rekeningstelsel. */
export async function listAccountingCodes(): Promise<AccountingCodeOption[]> {
  const rows = await prisma.accountingCode.findMany({
    select: { id: true, code: true, name: true, parentId: true, sortOrder: true },
  });
  return orderAccountingCodes(rows);
}

/**
 * De code die met het lidgeld meegaat: de gekozen code uit `leden.config`, of
 * anders 730000 zolang die bestaat. Null wanneer geen van beide er (nog) is;
 * dan vertrekt de betaling zonder code, net als vroeger.
 */
export async function membershipAccountingCode(
  accountingCodeId: string | null,
): Promise<{ code: string; name: string } | null> {
  const select = { code: true, name: true } as const;
  const chosen = accountingCodeId
    ? await prisma.accountingCode.findUnique({ where: { id: accountingCodeId }, select })
    : null;
  return (
    chosen ??
    (await prisma.accountingCode.findUnique({
      where: { code: MEMBERSHIP_DEFAULT_ACCOUNTING_CODE },
      select,
    }))
  );
}
