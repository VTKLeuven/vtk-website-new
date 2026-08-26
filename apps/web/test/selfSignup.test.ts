import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * De registratie mag naar buiten toe niet verklappen welke adressen een account
 * hebben, en een zelfgemaakt account mag niet inloggen voor het bevestigd is.
 * Allebei stille regels: gaan ze stuk, dan werkt alles nog gewoon, maar lekt het
 * formulier onze ledenlijst of komt iemand binnen op een adres dat niet van hem is.
 */
const userFindUnique = vi.fn();
const userCreate = vi.fn();
const accountCreate = vi.fn();
const transaction = vi.fn();
const tokenUpdateMany = vi.fn();
const tokenCreate = vi.fn();

vi.mock("@vtk/db", () => ({
  prisma: {
    user: { findUnique: userFindUnique, create: userCreate },
    account: { create: accountCreate },
    accountEmailToken: { updateMany: tokenUpdateMany, create: tokenCreate },
    $transaction: transaction,
  },
}));

vi.mock("@node-rs/argon2", () => ({
  hash: vi.fn(async () => "gehasht"),
  verify: vi.fn(async (_hash: string, password: string) => password === "juist-wachtwoord"),
}));

const { registerSelfServiceAccount, checkLoginBlocked, MIN_PASSWORD_LENGTH } = await import(
  "@vtk/auth/server"
);

beforeEach(() => {
  userFindUnique.mockReset();
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
