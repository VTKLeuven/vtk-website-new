"use client";

import { useState } from "react";
import { Input, Label } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { saveAiConfigAction } from "@/app/actions/it";
import type { AiStatus } from "@/lib/ai/config";

const errorMessages: Record<string, string> = {
  INVALID_URL: "Not saved: the API URL must be a valid http(s) URL.",
};

/**
 * Superadmin-config voor AI-vertaling in adminformulieren. Ondersteunt zowel
 * Open WebUI (`https://llm.vtk.be/api` met Bearer API-key) als vLLM direct
 * over Tailscale (`http://kenny:8000/v1`).
 */
export function AiConfigForm({ status }: { status: AiStatus }) {
  const [apiKey, setApiKey] = useState("");
  const [clearKey, setClearKey] = useState(false);

  const source =
    status.source === "database"
      ? "stored in the database (managed here)"
      : status.source === "environment"
        ? "coming from the environment variables"
        : "not configured yet — LLM features (such as admin translation) stay hidden";

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">
        Current configuration is {source}.{" "}
        {status.hasApiKey ? "An API key is set." : "No API key set (optional for direct Tailscale vLLM)."}
      </p>

      <SaveForm
        action={saveAiConfigAction}
        submitLabel="Save LLM config"
        savingLabel="Saving..."
        savedMessage="External LLM config saved."
        errorMessages={errorMessages}
        fallbackErrorMessage="Could not save the LLM config."
        resetOnSuccess={false}
        onSuccess={() => {
          setApiKey("");
          setClearKey(false);
        }}
        className="space-y-3"
      >
        <div>
          <Label>API base URL</Label>
          <Input
            name="apiUrl"
            defaultValue={status.apiUrl ?? ""}
            placeholder="https://llm.vtk.be/api or http://kenny:8000/v1"
            autoComplete="off"
          />
          <p className="mt-1 text-xs text-zinc-500">
            OpenAI-compatible base URL (without <code>/chat/completions</code>). Use{" "}
            <code>https://llm.vtk.be/api</code> with an Open WebUI API key, or{" "}
            <code>http://kenny:8000/v1</code> over Tailscale. Leave blank to disable.
          </p>
        </div>

        <div>
          <Label>Model</Label>
          <Input
            name="model"
            defaultValue={status.model}
            placeholder="kenny-active"
            autoComplete="off"
          />
          <p className="mt-1 text-xs text-zinc-500">
            On kenny, <code>kenny-active</code> uses whichever model is currently loaded without
            triggering a GPU model swap. You can also pin a specific model like{" "}
            <code>gemma-4-26b-a4b</code>.
          </p>
        </div>

        <div>
          <Label>API key (optional)</Label>
          <Input
            name="apiKey"
            type="password"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              if (e.target.value) setClearKey(false);
            }}
            placeholder={status.hasApiKey ? "•••••••• (leave blank to keep)" : "sk-... (required for llm.vtk.be)"}
            autoComplete="new-password"
          />
          {status.hasApiKey && (
            <label className="mt-2 flex items-center gap-2 text-xs text-zinc-600">
              <input
                type="checkbox"
                name="clearApiKey"
                checked={clearKey}
                onChange={(e) => setClearKey(e.target.checked)}
              />
              Remove stored API key
            </label>
          )}
        </div>
      </SaveForm>
    </div>
  );
}
