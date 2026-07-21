import { describe, expect, it } from "vitest";
import {
  createDoorShortcutToken,
  doorShortcutCooldownCutoff,
  doorShortcutExpiry,
  doorShortcutTokenFromAuthorization,
  hashDoorShortcutToken,
  DOOR_SHORTCUT_COOLDOWN_SECONDS,
  DOOR_SHORTCUT_TOKEN_DAYS,
} from "@/lib/door-shortcut";

describe("door Shortcut tokens", () => {
  it("creates unique 256-bit bearer tokens with a recognizable prefix", () => {
    const first = createDoorShortcutToken();
    const second = createDoorShortcutToken();

    expect(first).toMatch(/^vtk_door_[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
    expect(hashDoorShortcutToken(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashDoorShortcutToken(first)).toBe(hashDoorShortcutToken(first));
  });

  it("only accepts the exact token format in an Authorization Bearer header", () => {
    const token = createDoorShortcutToken();
    expect(doorShortcutTokenFromAuthorization(`Bearer ${token}`)).toBe(token);
    expect(doorShortcutTokenFromAuthorization(token)).toBeNull();
    expect(doorShortcutTokenFromAuthorization(`Basic ${token}`)).toBeNull();
    expect(doorShortcutTokenFromAuthorization("Bearer vtk_door_too-short")).toBeNull();
    expect(doorShortcutTokenFromAuthorization(null)).toBeNull();
  });

  it("uses the documented expiry and cooldown windows", () => {
    const now = new Date("2026-07-21T12:00:00.000Z");
    expect(doorShortcutExpiry(now).getTime() - now.getTime()).toBe(
      DOOR_SHORTCUT_TOKEN_DAYS * 86_400_000,
    );
    expect(now.getTime() - doorShortcutCooldownCutoff(now).getTime()).toBe(
      DOOR_SHORTCUT_COOLDOWN_SECONDS * 1_000,
    );
  });
});
