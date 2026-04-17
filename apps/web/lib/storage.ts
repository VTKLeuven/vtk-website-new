export * from "@vtk/storage";

export function publicUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  const base = process.env.S3_PUBLIC_URL || "";
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/${key}`;
}
