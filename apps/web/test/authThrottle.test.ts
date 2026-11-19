import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * De drempels op inloggen, registreren en de accountmails.
 *
 * better-auth begrenst enkel HTTP-verzoeken; onze formulieren zijn server
 * actions en kwamen daar nooit langs. Deze tests houden vast dat de action zelf
 * stopt, en dat ze dat doet zonder te verklappen welke adressen een account
 * hebben.
 */

const { headerStore, checkLoginBlocked, signInEmail, resolveLoginEmail, reissue, createReset } =
  vi.hoisted(() => ({
    headerStore: new Map<string, string>(),
    checkLoginBlocked: vi.fn(),
    signInEmail: vi.fn(),
    resolveLoginEmail: vi.fn(async (email: string) => email),
    reissue: vi.fn(),
    createReset: vi.fn(),
  }));

vi.mock("next/headers", () => ({
  headers: async () => ({ get: (name: string) => headerStore.get(name) ?? null }),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@vtk/db", () => ({ prisma: {} }));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));
vi.mock("@/lib/accountMail", () => ({
  sendPasswordResetMail: vi.fn(async () => true),
  sendVerificationMail: vi.fn(async () => true),
}));
vi.mock("@vtk/auth/server", () => ({
  checkLoginBlocked,
  resolveLoginEmail,
  signInEmail,
  signOut: vi.fn(),
  MIN_PASSWORD_LENGTH: 10,
  createPasswordReset: createReset,
  registerSelfServiceAccount: vi.fn(),
  reissueEmailVerification: reissue,
  resetPasswordWithToken: vi.fn(),
  setOwnPassword: vi.fn(),
}));

const { AUTH_LIMITS, SlidingWindow, authLimiters, clientIpFromHeaders } = await import(
  "@/lib/authThrottle"
);
const { loginAction } = await import("@/app/actions/auth");
const { requestPasswordResetAction } = await import("@/app/actions/register");

function loginForm(email: string, password = "fout-wachtwoord") {
  const form = new FormData();
  form.set("email", email);
  form.set("password", password);
  return form;
}

function emailForm(email: string) {
  const form = new FormData();
  form.set("email", email);
  return form;
}

const IDLE = { status: "idle" } as never;

beforeEach(() => {
  const limits = authLimiters();
  for (const limiter of Object.values(limits)) limiter.reset();
  headerStore.clear();
  headerStore.set("x-forwarded-for", "203.0.113.7");
  checkLoginBlocked.mockReset().mockResolvedValue("NONE");
  signInEmail.mockReset().mockRejectedValue(new Error("INVALID_EMAIL_OR_PASSWORD"));
  reissue.mockReset().mockResolvedValue(null);
  createReset.mockReset().mockResolvedValue(null);
});

describe("SlidingWindow", () => {
  it("lets a window fill up and empty again", () => {
    const window = new SlidingWindow({ max: 2, windowMs: 1000 });
    expect(window.take("a", 0)).toBe(true);
    expect(window.take("a", 10)).toBe(true);
    expect(window.take("a", 20)).toBe(false);
    expect(window.isFull("a", 999)).toBe(true);
    expect(window.isFull("a", 1011)).toBe(false);
  });

  it("does not lengthen the wait for whoever keeps knocking", () => {
    const window = new SlidingWindow({ max: 1, windowMs: 1000 });
    window.take("a", 0);
    for (let at = 100; at < 1000; at += 100) expect(window.take("a", at)).toBe(false);
    expect(window.take("a", 1000)).toBe(true);
  });
});

describe("clientIpFromHeaders", () => {
  it("trusts only the hop Caddy appended, never x-real-ip", () => {
    const headers = new Map([
      ["x-real-ip", "198.51.100.1"],
      ["x-forwarded-for", "10.0.0.1, 203.0.113.7"],
    ]);
    expect(clientIpFromHeaders({ get: (name) => headers.get(name) ?? null })).toBe("203.0.113.7");
  });
});

describe("loginAction", () => {
  it("locks one account after too many failures, also from many addresses", async () => {
    for (let attempt = 0; attempt < AUTH_LIMITS.loginPerAccount.max; attempt += 1) {
      headerStore.set("x-forwarded-for", `203.0.113.${attempt}`);
      await expect(loginAction(undefined, loginForm("lid@example.com"))).resolves.toEqual({
        error: "INVALID",
      });
    }
    headerStore.set("x-forwarded-for", "198.51.100.200");
    signInEmail.mockResolvedValue({});
    await expect(loginAction(undefined, loginForm("lid@example.com", "juist"))).resolves.toEqual({
      error: "TOO_MANY",
    });
    expect(signInEmail).toHaveBeenCalledTimes(AUTH_LIMITS.loginPerAccount.max);

    // Een ander account blijft gewoon werken.
    await expect(loginAction(undefined, loginForm("ander@example.com", "juist"))).rejects.toThrow(
      "NEXT_REDIRECT",
    );
  });

  it("counts a wrong password on an unverified account as a failure", async () => {
    checkLoginBlocked.mockResolvedValue("INVALID");
    for (let attempt = 0; attempt < AUTH_LIMITS.loginPerAccount.max; attempt += 1) {
      await loginAction(undefined, loginForm("nieuw@example.com"));
    }
    await expect(loginAction(undefined, loginForm("nieuw@example.com"))).resolves.toEqual({
      error: "TOO_MANY",
    });
  });

  it("forgets earlier failures after a successful login", async () => {
    for (let attempt = 0; attempt < AUTH_LIMITS.loginPerAccount.max - 1; attempt += 1) {
      await loginAction(undefined, loginForm("lid@example.com"));
    }
    signInEmail.mockResolvedValueOnce({});
    await expect(loginAction(undefined, loginForm("lid@example.com", "juist"))).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    await expect(loginAction(undefined, loginForm("lid@example.com"))).resolves.toEqual({
      error: "INVALID",
    });
  });
});

describe("requestPasswordResetAction", () => {
  it("stops mailing one address but still answers ok", async () => {
    createReset.mockResolvedValue({ email: "lid@example.com", name: "Lid", token: "t", locale: "NL" });
    for (let attempt = 0; attempt < AUTH_LIMITS.mailPerAddress.max; attempt += 1) {
      await expect(requestPasswordResetAction(IDLE, emailForm("lid@example.com"))).resolves.toMatchObject({
        status: "success",
      });
    }
    await expect(requestPasswordResetAction(IDLE, emailForm("lid@example.com"))).resolves.toMatchObject({
      status: "success",
    });
    expect(createReset).toHaveBeenCalledTimes(AUTH_LIMITS.mailPerAddress.max);
  });

  it("tells a single address that sends too many requests", async () => {
    for (let attempt = 0; attempt < AUTH_LIMITS.mailPerIp.max; attempt += 1) {
      await requestPasswordResetAction(IDLE, emailForm(`lid${attempt}@example.com`));
    }
    await expect(requestPasswordResetAction(IDLE, emailForm("nog-een@example.com"))).resolves.toMatchObject({
      status: "error",
      code: "RATE_LIMITED",
    });
  });
});
