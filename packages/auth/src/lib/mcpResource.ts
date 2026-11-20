export function getMcpResourceUrl(
  baseUrl = process.env.BETTER_AUTH_URL ?? process.env.VTK_MAIN_URL,
): string | null {
  if (!baseUrl) return null;
  try {
    return `${new URL(baseUrl).origin}/api/mcp`;
  } catch {
    return null;
  }
}
