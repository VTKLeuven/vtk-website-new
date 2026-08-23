import { describe, expect, it } from "vitest";
import {
  MCP_CREATE_TOOL_NAMES,
  MCP_READ_TOOL_NAMES,
  MCP_TOOL_NAMES,
} from "@/lib/mcp/server";

describe("MCP toolbeleid", () => {
  it("registreert uitsluitend reads en de twee expliciete create-tools", () => {
    expect(MCP_CREATE_TOOL_NAMES).toEqual([
      "calendar_create_event",
      "calendar_create_category",
    ]);
    expect(MCP_TOOL_NAMES).toEqual([...MCP_READ_TOOL_NAMES, ...MCP_CREATE_TOOL_NAMES]);
  });

  it("heeft geen toolnaam die een destructive of overschrijvende mutatie suggereert", () => {
    for (const name of MCP_TOOL_NAMES) {
      expect(name).not.toMatch(/delete|remove|destroy|update|edit|save|upsert|publish|unpublish/i);
    }
  });
});
