import type { CSSProperties } from "react";

function srgbChannel(byte: number): number {
  const c = byte / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/**
 * Berekent relatieve luminantie van een 6-cijferige hexkleur en kiest een
 * voorgrondtekstkleur die altijd minstens 4.5:1 haalt (`WCAG 1.4.3`).
 */
export function catInk(hex: string): "#ffffff" | "#000000" | "#0a0f1f" {
  const clean = hex.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(clean)) return "#ffffff";
  const r = Number.parseInt(clean.slice(1, 3), 16);
  const g = Number.parseInt(clean.slice(3, 5), 16);
  const b = Number.parseInt(clean.slice(5, 7), 16);
  const luminance = 0.2126 * srgbChannel(r) + 0.7152 * srgbChannel(g) + 0.0722 * srgbChannel(b);
  if (luminance <= 0.179) return "#ffffff";
  if (luminance <= 0.214) return "#000000";
  return "#0a0f1f";
}

export function catChipStyle(hex: string): CSSProperties {
  return { "--cat": hex, "--cat-fg": catInk(hex) } as CSSProperties;
}
