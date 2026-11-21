import { protectedResourceMetadataResponse } from "@/lib/mcp/metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  return protectedResourceMetadataResponse(request);
}
