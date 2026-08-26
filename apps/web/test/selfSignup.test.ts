import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * De registratie mag naar buiten toe niet verklappen welke adressen een account
 * hebben, en een zelfgemaakt account mag niet inloggen voor het bevestigd is.
 * Allebei stille regels: gaan ze stuk, dan werkt alles nog gewoon, maar lekt het
 * formulier onze ledenlijst of komt iemand binnen op een adres dat niet van hem is.
 */
const userFindUnique = vi.fn();
const userFindMany = vi.fn();
const userCreate = vi.fn();
const accountCreate = vi.fn();
const transaction = vi.fn();
const tokenUpdateMany = vi.fn();
const tokenCreate = vi.fn();

vi.mock("@vtk/db", () => ({
  prisma: {
    user: { findUnique: userFindUnique, findMany: userFindMany, create: userCreate },
    account: { create: accountCreate },
    accountEmailToken: { updateMany: tokenUpdateMany, create: tokenCreate },
    $transaction: transaction,
  },
}));

vi.mock("@node-rs/argon2", () => ({
  hash: vi.fn(async () => "gehasht"),
  verify: vi.fn(async (_hash: string, password: string) => password === "juist-wachtwoord"),
}));

const {
  registerSelfServiceAccount,
  createPasswordSetupForUser,
  checkLoginBlocked,
  resolveLoginEmail,
  MIN_PASSWORD_LENGTH,
} = await import("@vtk/auth/server");

beforeEach(() => {
  userFindUnique.mockReset();
  userFindMany.mockReset();
  userFindMany.mockResolvedValue([]);
  userCreate.mockReset();
  accountCreate.mockReset();
  tokenUpdateMany.mockReset();
  tokenCreate.mockReset();
  transaction.mockReset();
  // Twee vormen: een callback (de user + account) en een array (de tokens).
  transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === "function"
      ? (arg as (tx: unknown) => Promise<unknown>)({
          user: { create: userCreate },
          account: { create: accountCreate },
        })
      : Promise.all(arg as Promise<unknown>[]),
  );
});

describe("registerSelfServiceAccount", () => {
  const input = {
    firstName: "Jan",
    lastName: "Peeters",
    email: "Jan@Example.com",
    password: "een-lang-wachtwoord",
    locale: "NL" as const,
  };

  it("maakt niets aan wanneer het adres al bezet is, en zegt dat niet", async () => {
    userFindUnique.mockResolvedValue({ id: "bestaand" });

    const result = await registerSelfServiceAccount(input);

    expect(userCreate).not.toHaveBeenCalled();
    // Geen token betekent: er vertrekt geen mail. De oproeper toont hetzelfde
    // scherm als bij een geslaagde registratie.
    expect(result.token).toBeNull();
    expect(result.userId).toBeNull();
    expect(result.email).toBe("jan@example.com");
  });

  it("maakt een account met een credential-rij en een bevestigingstoken", async () => {
    userFindUnique.mockResolvedValue(null);
    userCreate.mockResolvedValue({ id: "nieuw" });

    const result = await registerSelfServiceAccount({ ...input, graduationYear: 2004 });

    expect(userCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "jan@example.com",
          emailVerified: false,
          alumni: true,
          graduationYear: 2004,
          selfRegisteredAt: expect.any(Date),
        }),
      }),
    );
    expect(accountCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ providerId: "credential", userId: "nieuw" }),
      }),
    );
    expect(result.token).toEqual(expect.any(String));
    // Enkel de hash gaat de database in.
    expect(tokenCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tokenHash: expect.any(String) }),
      }),
    );
    const stored = tokenCreate.mock.calls[0]![0].data.tokenHash;
    expect(stored).not.toBe(result.token);
  });

  it("maakt een niet-alumnus account aan wanneer alumni niet aangevinkt is", async () => {
    userFindUnique.mockResolvedValue(null);
    userCreate.mockResolvedValue({ id: "nieuw-extern" });

    const result = await registerSelfServiceAccount({ ...input, alumni: false });

    expect(userCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "jan@example.com",
          emailVerified: false,
          alumni: false,
          notStudying: false,
          graduationYear: null,
          wasInVtk: false,
          alumniMailOptIn: false,
          selfRegisteredAt: expect.any(Date),
        }),
      }),
    );
    expect(result.token).toEqual(expect.any(String));
  });

  it("weigert een te kort wachtwoord", async () => {
    await expect(
      registerSelfServiceAccount({ ...input, password: "a".repeat(MIN_PASSWORD_LENGTH - 1) }),
    ).rejects.toThrow();
    expect(userFindUnique).not.toHaveBeenCalled();
  });
});

describe("createPasswordSetupForUser", () => {
  it("maakt ook zonder bestaand wachtwoord een token voor het persoonlijke adres", async () => {
    userFindUnique.mockResolvedValue({
      id: "alumnus",
      name: "Jan Peeters",
      locale: "NL",
      email: "r0123456@kuleuven.be",
      personalEmail: "jan@example.com",
      active: true,
      deletedAt: null,
    });

    const result = await createPasswordSetupForUser("alumnus");

    expect(result).toMatchObject({ userId: "alumnus", email: "jan@example.com" });
    expect(result?.token).toEqual(expect.any(String));
    expect(tokenCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: "PASSWORD_RESET" }) }),
    );
  });

  it("stuurt nooit een toegangslink naar een KU Leuven-adres", async () => {
    userFindUnique.mockResolvedValue({
      id: "alumnus",
      name: "Jan Peeters",
      locale: "NL",
      email: "r0123456@student.kuleuven.be",
      personalEmail: null,
      active: true,
      deletedAt: null,
    });

    expect(await createPasswordSetupForUser("alumnus")).toBeNull();
    expect(tokenCreate).not.toHaveBeenCalled();
  });
});

describe("checkLoginBlocked", () => {
  it("geeft INVALID voor een onbekend of gedeactiveerd account", async () => {
    userFindUnique.mockResolvedValue(null);
    expect(await checkLoginBlocked("weg@example.com", "wat dan ook")).toBe("INVALID");

    userFindUnique.mockResolvedValue({
      active: false,
      emailVerified: true,
      selfRegisteredAt: null,
      accounts: [],
    });
    expect(await checkLoginBlocked("uit@example.com", "wat dan ook")).toBe("INVALID");
  });

  it("laat een admin-account met onbevestigd adres gewoon door", async () => {
    // `emailVerified` betekent enkel iets bij een zelfgemaakt account; anders
    // zou elk door een beheerder aangemaakt account buitenvliegen.
    userFindUnique.mockResolvedValue({
      active: true,
      emailVerified: false,
      selfRegisteredAt: null,
      accounts: [{ password: "gehasht" }],
    });
    expect(await checkLoginBlocked("admin@example.com", "juist-wachtwoord")).toBe("NONE");
  });

  it("meldt UNVERIFIED enkel wanneer het wachtwoord klopt", async () => {
    userFindUnique.mockResolvedValue({
      active: true,
      emailVerified: false,
      selfRegisteredAt: new Date(),
      accounts: [{ password: "gehasht" }],
    });

    expect(await checkLoginBlocked("nieuw@example.com", "juist-wachtwoord")).toBe("UNVERIFIED");
    // Verkeerd wachtwoord: gewoon INVALID, anders verklapt dit scherm welke
    // adressen een account hebben.
    expect(await checkLoginBlocked("nieuw@example.com", "fout")).toBe("INVALID");
  });
});


/**
 * Het migratiepad voor wie via KU Leuven binnenkomt: dat adres verdwijnt na het
 * afstuderen. Wie zijn persoonlijke adres intikt, hoort binnen te geraken;
 * anders herstelt hij een wachtwoord via een adres waarmee hij niet kan inloggen.
 */
describe("resolveLoginEmail", () => {
  it("laat een bestaand login-adres ongemoeid", async () => {
    userFindUnique.mockResolvedValue({ id: "u1" });
    expect(await resolveLoginEmail("R0123456@KULEUVEN.be")).toBe("r0123456@kuleuven.be");
    expect(userFindMany).not.toHaveBeenCalled();
  });

  it("vertaalt een persoonlijk adres naar het login-adres", async () => {
    userFindUnique.mockResolvedValue(null);
    userFindMany.mockResolvedValue([{ email: "r0123456@kuleuven.be" }]);
    expect(await resolveLoginEmail("jan@example.com")).toBe("r0123456@kuleuven.be");
  });

  it("raadt niet wanneer twee profielen hetzelfde persoonlijke adres dragen", async () => {
    userFindUnique.mockResolvedValue(null);
    userFindMany.mockResolvedValue([{ email: "a@kuleuven.be" }, { email: "b@kuleuven.be" }]);
    // Het ingetikte adres blijft staan; de login faalt dan als een gewone
    // foute login in plaats van iemand in het verkeerde account te zetten.
    expect(await resolveLoginEmail("gedeeld@example.com")).toBe("gedeeld@example.com");
  });
});
