import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// NOTE: do NOT re-export from "@prisma/client" here. The generated
// @prisma/client/index.d.ts is ~1 MB / ~28k lines and pulling it through
// this file forces every importer to walk that entire type graph, which
// blows up Turbopack/webpack memory in a monorepo. If you need Prisma
// model types, import them directly from "@prisma/client" where you use
// them.

export { HEADER_TABS } from "./groups";
