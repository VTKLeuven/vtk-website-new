/**
 * @author Witse Panneels
 * @date 2026-06-25
 *
 * client safe auth components
 */
"use client";

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: process.env.BETTER_AUTH_URL,
});

export const { signIn, signOut, useSession } = authClient;
