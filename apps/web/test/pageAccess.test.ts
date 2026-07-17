import { describe, expect, it } from "vitest";
import type { SessionPayload } from "@vtk/auth";
import { canEditPageContent, losesOwnPageAccess } from "@/lib/pageAccess";

/** Minimale sessie; enkel de velden die de toegangscheck leest. */
function session(opts: {
  isSuperAdmin?: boolean;
  permissions?: string[];
  roleIds?: string[];
}): SessionPayload {
  return {
    user: { isSuperAdmin: opts.isSuperAdmin ?? false },
    permissions: opts.permissions ?? [],
    roleIds: opts.roleIds ?? [],
  } as unknown as SessionPayload;
}

const page = (...roleIds: string[]) => ({ editorRoles: roleIds.map((roleId) => ({ roleId })) });

describe("canEditPageContent", () => {
  it("laat een superadmin en pages.editAll overal aan", () => {
    expect(canEditPageContent(session({ isSuperAdmin: true }), page())).toBe(true);
    expect(canEditPageContent(session({ permissions: ["pages.editAll"] }), page("x"))).toBe(true);
  });

  it("laat pages.edit enkel aan een pagina met een rol die hij draagt", () => {
    const s = session({ permissions: ["pages.edit"], roleIds: ["cudi"] });
    expect(canEditPageContent(s, page("cudi"))).toBe(true);
    expect(canEditPageContent(s, page("theokot"))).toBe(false);
  });

  it("vergrendelt een pagina zonder bewerkrollen voor gewone bewerkers", () => {
    const s = session({ permissions: ["pages.edit"], roleIds: ["cudi"] });
    expect(canEditPageContent(s, page())).toBe(false);
  });

  it("geeft zonder pages.edit geen toegang, ook niet met de juiste rol", () => {
    expect(canEditPageContent(session({ roleIds: ["cudi"] }), page("cudi"))).toBe(false);
  });
});

describe("losesOwnPageAccess", () => {
  it("waarschuwt wanneer geen van de overblijvende rollen van hem is", () => {
    expect(
      losesOwnPageAccess({ canEditAll: false, myRoleIds: ["cudi"], nextRoleIds: ["theokot"] }),
    ).toBe(true);
  });

  it("waarschuwt wanneer alle rollen weg zijn", () => {
    expect(losesOwnPageAccess({ canEditAll: false, myRoleIds: ["cudi"], nextRoleIds: [] })).toBe(
      true,
    );
  });

  it("zwijgt zolang één van zijn eigen rollen blijft staan", () => {
    expect(
      losesOwnPageAccess({
        canEditAll: false,
        myRoleIds: ["cudi", "it"],
        nextRoleIds: ["theokot", "it"],
      }),
    ).toBe(false);
  });

  it("zwijgt voor editAll/superadmin: die verliezen niets", () => {
    expect(losesOwnPageAccess({ canEditAll: true, myRoleIds: ["cudi"], nextRoleIds: [] })).toBe(
      false,
    );
  });

  // De waarschuwing moet exact overeenkomen met wat de server daarna toelaat:
  // waarschuwen we niet terwijl de toegang wél weg is, dan botst het lid op een
  // foutmelding in plaats van op een dialoog.
  it("komt overeen met canEditPageContent op de pagina zoals ze na het opslaan is", () => {
    const roles = ["cudi", "theokot", "it"];
    const s = session({ permissions: ["pages.edit"], roleIds: ["cudi"] });
    for (let mask = 0; mask < 1 << roles.length; mask += 1) {
      const next = roles.filter((_, i) => mask & (1 << i));
      const warned = losesOwnPageAccess({ canEditAll: false, myRoleIds: ["cudi"], nextRoleIds: next });
      const stillAllowed = canEditPageContent(s, page(...next));
      expect(warned, `next=[${next.join(",")}]`).toBe(!stillAllowed);
    }
  });
});
