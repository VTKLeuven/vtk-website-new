import { NextResponse } from "next/server";
import { AUTHORIZATION_PREVIEW_COOKIE } from "@/lib/authorization-preview-constants";

export async function POST(request: Request) {
  const formData = await request.formData();
  const locale = formData.get("locale") === "en" ? "en" : "nl";
  const response = NextResponse.redirect(
    new URL(`${locale === "en" ? "/en" : ""}/admin/it`, request.url),
    303,
  );
  response.cookies.delete(AUTHORIZATION_PREVIEW_COOKIE);
  return response;
}
