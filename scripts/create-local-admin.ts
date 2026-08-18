/**
 * Creates (or promotes) a superadmin on the **local** database, so you can
 * actually open /admin after a fresh `make db`.
 *
 * The seed only creates an admin when `SEED_ADMIN_EMAIL` and
 * `SEED_ADMIN_PASSWORD` are both set, and in a normal checkout they are not.
 * That leaves a freshly seeded database with no way in, which is a poor first
 * five minutes for anyone joining the team.
 *
 * Running it:
 *
 *   make admin
 *   ADMIN_EMAIL=me@vtk.local ADMIN_PASSWORD=hunter2 make admin
 *
 * ## Refuses to run against anything but a local database
 *
 * This hands out full access, so it checks the host in `DATABASE_URL` and stops
 * unless it is loopback. Pointed at the dev or production database, through a
 * tunnel or a stray `DATABASE_URL`, it would silently mint a superadmin on the
 * real site with a password written in a Makefile.
 */

import { hash } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Loopback only. Anything else, including a tunnelled remote, is refused. */
function assertLocalDatabase(rawUrl: string | undefined): string {
  if (!rawUrl) {
    console.error("DATABASE_URL is missing. Is your .env in place?");
    process.exit(1);
  }
  let host: string;
  try {
    host = new URL(rawUrl).hostname;
  } catch {
    console.error("DATABASE_URL is not a valid URL.");
    process.exit(1);
  }
  if (!LOCAL_HOSTS.has(host)) {
    console.error(
      [
        `Refusing to run: DATABASE_URL points at "${host}", not at a local database.`,
        "",
        "This command creates a full superadmin. On a real database that is an",
        "account with every permission and a password from your shell history.",
        "",
        "If you genuinely need an admin elsewhere, make one through the admin UI.",
      ].join("\n"),
    );
    process.exit(1);
  }
  return host;
}

async function main() {
  const host = assertLocalDatabase(process.env.DATABASE_URL);

  const email = (process.env.ADMIN_EMAIL ?? "admin@vtk.local").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "admin";
  const prisma = new PrismaClient();

  try {
    const passwordHash = await hash(password);

    const user = await prisma.user.upsert({
      where: { email },
      // An existing account is promoted rather than left alone: the whole point
      // of running this is to end up with access.
      update: { isSuperAdmin: true },
      create: { email, name: "Local Admin", isSuperAdmin: true },
    });

    // Same shape the seed uses for its admin, so better-auth recognises it as a
    // credential login: one `credential:<userId>` account carrying the hash.
    await prisma.account.upsert({
      where: { id: `credential:${user.id}` },
      update: { password: passwordHash },
      create: {
        id: `credential:${user.id}`,
        accountId: user.id,
        providerId: "credential",
        userId: user.id,
        password: passwordHash,
      },
    });

    console.log(
      [
        "",
        `Superadmin ready on ${host}:`,
        "",
        `  email     ${email}`,
        `  password  ${password}`,
        "",
        "  Log in at  http://localhost:3000/inloggen",
        "  Admin at   http://localhost:3000/admin",
        "",
      ].join("\n"),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
