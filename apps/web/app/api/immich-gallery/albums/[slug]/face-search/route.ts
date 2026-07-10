import { NextResponse } from "next/server";
import { immichFaceSearchStatus, startImmichFaceSearch } from "@/lib/immich-face-search";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function asFile(value: FormDataEntryValue | null) {
  if (!value || typeof value === "string") return null;
  return value;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await context.params;
    const contentType = request.headers.get("content-type") || "";
    if (
      !contentType.includes("multipart/form-data") &&
      !contentType.includes("application/x-www-form-urlencoded")
    ) {
      return NextResponse.json(
        {
          error: "Expected a profile photo upload.",
          code: "face_search_file_missing",
        },
        { status: 400 },
      );
    }

    const form = await request.formData();
    const job = await startImmichFaceSearch({
      slug,
      file: asFile(form.get("selfie")),
      consent: form.get("consent"),
    });

    return NextResponse.json(job, { status: 202 });
  } catch (error) {
    const status = immichFaceSearchStatus(error);
    return NextResponse.json(
      {
        error: status.message,
        code: status.code,
      },
      { status: status.status },
    );
  }
}
