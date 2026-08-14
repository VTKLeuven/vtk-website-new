"use client";

import Image from "next/image";
import { useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink, Plus, Trash2 } from "lucide-react";
import { Card, Input, Label, Textarea } from "@vtk/ui";
import type { Locale } from "@vtk/i18n";
import { SaveForm } from "@/components/ui/SaveForm";
import { SocialIcon } from "@/components/link-page/SocialIcon";
import { saveLinkPageAction } from "@/app/actions/link-page";
import {
  SOCIAL_LABELS,
  SOCIAL_PLATFORMS,
  socialHref,
  type LinkPageConfig,
  type LinkPageLink,
  type SocialPlatform,
} from "@/lib/link-page";

function newLink(): LinkPageLink {
  return {
    id: crypto.randomUUID(),
    title: "",
    url: "",
    enabled: true,
  };
}

function AdminPreview({ config, nl }: { config: LinkPageConfig; nl: boolean }) {
  const socials = SOCIAL_PLATFORMS.filter((platform) => config.socials[platform].trim());

  return (
    <div className="sticky top-6 hidden xl:block">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#5c667f]">
        {nl ? "Live voorbeeld" : "Live preview"}
      </p>
      <div className="overflow-hidden rounded-[32px] border-[7px] border-[#0a0f1f] bg-[#0e1a36] shadow-2xl">
        <div className="relative min-h-[620px] overflow-hidden px-5 pb-8 pt-10 text-center text-white">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(255,210,63,0.3),transparent_35%),radial-gradient(circle_at_85%_70%,rgba(65,82,130,0.55),transparent_45%)]" />
          <div className="absolute inset-0 bg-[url('/technisch-pattern.svg')] bg-[length:360px_360px] opacity-[0.07]" />
          <div className="relative">
            <Image src="/VTK.png" alt="VTK" width={660} height={777} sizes="72px" className="mx-auto h-auto w-[72px]" />
            <h2 className="mt-4 text-xl font-semibold tracking-tight">{config.title || "VTK Leuven"}</h2>
            {config.description ? (
              <p className="mx-auto mt-2 max-w-[28ch] text-xs leading-5 text-white/70">
                {config.description}
              </p>
            ) : null}
            {socials.length > 0 ? (
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {socials.map((platform) => (
                  <span key={platform} className="grid size-8 place-items-center rounded-full bg-white/10 text-white">
                    <SocialIcon platform={platform} className="size-4" />
                  </span>
                ))}
              </div>
            ) : null}
            <div className="mt-7 space-y-2.5 text-left">
              {config.links.filter((link) => link.enabled && link.title).map((link) => (
                <div key={link.id} className="flex min-h-12 items-center justify-between rounded-xl bg-white px-4 text-sm font-semibold text-[#0a0f1f] shadow-lg">
                  <span className="truncate">{link.title}</span>
                  <ExternalLink className="size-3.5 shrink-0 opacity-45" aria-hidden="true" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LinkPageManager({
  initialConfig,
  locale,
}: {
  initialConfig: LinkPageConfig;
  locale: Locale;
}) {
  const nl = locale === "nl";
  const [config, setConfig] = useState(initialConfig);

  const updateLink = (id: string, patch: Partial<LinkPageLink>) => {
    setConfig((current) => ({
      ...current,
      links: current.links.map((link) => (link.id === id ? { ...link, ...patch } : link)),
    }));
  };

  const moveLink = (index: number, direction: -1 | 1) => {
    setConfig((current) => {
      const destination = index + direction;
      if (destination < 0 || destination >= current.links.length) return current;
      const links = [...current.links];
      [links[index], links[destination]] = [links[destination], links[index]];
      return { ...current, links };
    });
  };

  const updateSocial = (platform: SocialPlatform, value: string) => {
    setConfig((current) => ({
      ...current,
      socials: { ...current.socials, [platform]: value },
    }));
  };

  return (
    <div className="grid min-w-0 gap-8 xl:grid-cols-[minmax(0,1fr)_330px]">
      <SaveForm
        action={saveLinkPageAction}
        submitLabel={nl ? "Linktree opslaan" : "Save Linktree"}
        savingLabel={nl ? "Opslaan…" : "Saving…"}
        savedMessage={nl ? "Linktree opgeslagen" : "Linktree saved"}
        errorMessages={{
          INVALID_CONFIG: nl
            ? "Controleer of elke knop een titel en geldige link heeft."
            : "Check that every button has a title and a valid link.",
        }}
        fallbackErrorMessage={nl ? "Opslaan is niet gelukt." : "Could not save."}
        resetOnSuccess={false}
        className="min-w-0 space-y-6"
      >
        <input type="hidden" name="config" value={JSON.stringify(config)} />

        <Card className="p-5 sm:p-6">
          <h2 className="font-semibold">{nl ? "Profiel" : "Profile"}</h2>
          <p className="mb-5 mt-1 text-sm text-[#5c667f]">
            {nl
              ? "Het VTK-schild wordt automatisch boven deze tekst getoond."
              : "The VTK shield is displayed above this text automatically."}
          </p>
          <div className="space-y-4">
            <div>
              <Label htmlFor="link-page-title">{nl ? "Naam" : "Name"}</Label>
              <Input
                id="link-page-title"
                value={config.title}
                maxLength={80}
                required
                onChange={(event) => setConfig((current) => ({ ...current, title: event.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="link-page-description">{nl ? "Beschrijving" : "Description"}</Label>
              <Textarea
                id="link-page-description"
                value={config.description}
                maxLength={240}
                rows={3}
                className="min-h-20 resize-y"
                onChange={(event) => setConfig((current) => ({ ...current, description: event.target.value }))}
              />
              <p className="mt-1 text-right text-xs text-[#5c667f]">{config.description.length}/240</p>
            </div>
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <h2 className="font-semibold">{nl ? "Sociale media en contact" : "Social media and contact"}</h2>
          <p className="mb-5 mt-1 text-sm text-[#5c667f]">
            {nl
              ? "Laat een veld leeg om het icoon te verbergen."
              : "Leave a field empty to hide its icon."}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {SOCIAL_PLATFORMS.map((platform) => {
              const value = config.socials[platform];
              const testHref =
                platform === "email"
                  ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
                    ? socialHref(platform, value)
                    : null
                  : /^https?:\/\//i.test(value)
                    ? value
                    : null;
              return (
                <div key={platform}>
                  <Label htmlFor={`social-${platform}`} className="flex items-center gap-2">
                    <SocialIcon platform={platform} className="size-4" />
                    {SOCIAL_LABELS[platform]}
                  </Label>
                  <Input
                    id={`social-${platform}`}
                    type={platform === "email" ? "email" : "url"}
                    inputMode={platform === "email" ? "email" : "url"}
                    value={value}
                    placeholder={platform === "email" ? "info@vtk.be" : "https://…"}
                    onChange={(event) => updateSocial(platform, event.target.value)}
                  />
                  {testHref ? (
                    <a
                      href={testHref}
                      target={platform === "email" ? undefined : "_blank"}
                      rel={platform === "email" ? undefined : "noopener noreferrer"}
                      className="mt-1 inline-block text-xs text-[#5c667f] underline hover:text-vtk-ink"
                    >
                      {nl ? "Link testen" : "Test link"}
                    </a>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">{nl ? "Knoppen" : "Buttons"}</h2>
              <p className="mt-1 text-sm text-[#5c667f]">
                {nl
                  ? "De volgorde hieronder is ook de volgorde op de publieke pagina."
                  : "The order below is also the order on the public page."}
              </p>
            </div>
            <button
              type="button"
              disabled={config.links.length >= 30}
              onClick={() => setConfig((current) => ({ ...current, links: [...current.links, newLink()] }))}
              className="inline-flex min-h-10 items-center gap-2 rounded-full bg-vtk-blue px-4 text-sm font-medium text-white transition hover:bg-vtk-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="size-4" aria-hidden="true" />
              {nl ? "Knop toevoegen" : "Add button"}
            </button>
          </div>

          {config.links.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-vtk-blue/20 px-5 py-10 text-center text-sm text-[#5c667f]">
              {nl ? "Nog geen knoppen. Voeg hierboven de eerste toe." : "No buttons yet. Add the first one above."}
            </div>
          ) : (
            <div className="space-y-4">
              {config.links.map((link, index) => (
                <div key={link.id} className="rounded-2xl border border-vtk-blue/10 bg-vtk-blue-soft/45 p-4">
                  <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto] lg:items-end">
                    <div>
                      <Label htmlFor={`link-title-${link.id}`}>{nl ? "Knoptekst" : "Button label"}</Label>
                      <Input
                        id={`link-title-${link.id}`}
                        value={link.title}
                        maxLength={100}
                        required
                        onChange={(event) => updateLink(link.id, { title: event.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`link-url-${link.id}`}>URL</Label>
                      <Input
                        id={`link-url-${link.id}`}
                        value={link.url}
                        maxLength={2048}
                        required
                        inputMode="url"
                        placeholder="https://… of /kalender"
                        onChange={(event) => updateLink(link.id, { url: event.target.value })}
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveLink(index, -1)}
                        disabled={index === 0}
                        className="grid size-10 place-items-center rounded-full border border-vtk-blue/15 bg-white text-vtk-ink transition hover:bg-vtk-blue-soft disabled:opacity-30"
                        aria-label={nl ? "Knop naar boven" : "Move button up"}
                      >
                        <ArrowUp className="size-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveLink(index, 1)}
                        disabled={index === config.links.length - 1}
                        className="grid size-10 place-items-center rounded-full border border-vtk-blue/15 bg-white text-vtk-ink transition hover:bg-vtk-blue-soft disabled:opacity-30"
                        aria-label={nl ? "Knop naar beneden" : "Move button down"}
                      >
                        <ArrowDown className="size-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfig((current) => ({ ...current, links: current.links.filter((item) => item.id !== link.id) }))}
                        className="grid size-10 place-items-center rounded-full border border-red-200 bg-white text-red-700 transition hover:bg-red-50"
                        aria-label={nl ? "Knop verwijderen" : "Delete button"}
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <label className="mt-3 inline-flex items-center gap-2 text-sm text-[#34405e]">
                    <input
                      type="checkbox"
                      checked={link.enabled}
                      onChange={(event) => updateLink(link.id, { enabled: event.target.checked })}
                      className="size-4 accent-[#0e1a36]"
                    />
                    {nl ? "Zichtbaar op de publieke pagina" : "Visible on the public page"}
                  </label>
                </div>
              ))}
            </div>
          )}
        </Card>
      </SaveForm>

      <AdminPreview config={config} nl={nl} />
    </div>
  );
}
