/**
 * better-auth config file
 * 
 * @author Witse Panneels
 * @date 2026-06-19
 */
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@vtk/db";

import { hashPassword, verifyPassword } from "./logins/password";

export const auth = betterAuth({
  appName: "VTK",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  // trustedOrigins: authEnv.trustedOrigins, // TODO uitzoeken voor wat dit dient

  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    password: {
      hash: hashPassword,
      verify: verifyPassword,
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 day expiry
    updateAge: 60 * 60 * 24,
  },

  advanced: {
    cookiePrefix: "vtk",
    useSecureCookies: process.env.NODE_ENV === "production",
  },

  user: {
  additionalFields: {
    avatarKey: {
      type: "string",
      required: false,
      input: false,
    },
    locale: {
      type: "string",
      required: false,
      defaultValue: "NL",
    },
    active: {
      type: "boolean",
      required: false,
      defaultValue: true,
      input: false,
    },
    isSuperAdmin: {
      type: "boolean",
      required: false,
      defaultValue: false,
      input: false,
    },
  },
},
});

export type Auth = typeof auth;
