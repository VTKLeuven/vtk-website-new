"use client";

import { useState } from "react";
import { Card, Label, Select } from "@vtk/ui";
import type { Locale } from "@vtk/i18n";
import Link from "@/components/ui/Link";
import { SaveForm } from "@/components/ui/SaveForm";
import { BlueprintHero } from "@/components/editorial/BlueprintHero";
import {
  HERO_ANIMATION_SPEED_MAX,
  HERO_ANIMATION_SPEED_MIN,
  HERO_ANIMATION_SPEED_STEP,
  HERO_LINE_STRENGTH_MAX,
  HERO_LINE_STRENGTH_MIN,
  HERO_LINE_STRENGTH_STEP,
  type HeroDesignName,
  type HeroDesignSetting,
  type HeroFill,
  type HeroFrontpageChoice,
  type HeroHoverColor,
  type HeroLayout,
  type HeroLineWeight,
} from "@/lib/home/heroDesign";
import { saveErrorMessages } from "@/lib/saveMessages";
import { saveHomeHeroDesignAction } from "@/app/actions/home";
import { Preview } from "../frontpage/FrontpageEditor";
import "@/app/design/vtk-hero.css";

/**
 * Het design van de hero kiezen, met de echte hero als voorvertoning erboven: je
 * ziet wat een keuze doet voor je ze bewaart. De voorvertoning is `inert`, dus de
 * links erin doen niets, en de velden van een ander design worden mee bewaard,
 * zodat terugschakelen niets wist.
 *
 * De oude hero is een eigen pagina met eigen stylesheets; die staat hier in een
 * frame, zoals in /admin/frontpage, en toont wat daar bewaard is.
 */
export function HeroDesignForm({
  locale,
  initial,
  labels,
}: {
  locale: Locale;
  initial: HeroDesignSetting;
  labels: { save: string; saving: string; saved: string; saveError: string };
}) {
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  const [design, setDesign] = useState(initial);
  // Bij een andere opstelling, vulling of snelheid speelt de animatie opnieuw; de
  // lijndikte, -sterkte en hoverkleur laten de tekening staan.
  const replayKey = `${design.design}-${design.layout}-${design.fill}-${design.animationSpeed}`;
  const set = <K extends keyof HeroDesignSetting>(key: K, value: HeroDesignSetting[K]) =>
    setDesign((current) => ({ ...current, [key]: value }));
  const construction = design.design === "construction";
  const legacy = design.design === "frontpage";
  const previewLayout = design.frontpage === "planned" ? "default" : design.frontpage;

  return (
    <Card className="p-5">
      <h2 className="mb-1 font-semibold">Hero</h2>
      <p className="mb-4 text-sm text-[#5c667f]">
        {nl
          ? "Bovenaan de homepage. Het voorbeeld toont meteen wat je kiest; de site verandert pas na het bewaren."
          : "At the top of the homepage. The preview shows your choice right away; the site only changes after saving."}
      </p>

      <div className="mb-5">
        {legacy ? (
          <Preview
            key={previewLayout}
            url={`/frontpage-preview/${locale}/${previewLayout}`}
            title={nl ? "Voorbeeld van de oude hero" : "Preview of the old hero"}
          />
        ) : (
          <div className="vtk-admin-preview overflow-hidden rounded-2xl" inert aria-hidden="true">
            <BlueprintHero key={replayKey} locale={locale} design={design} preview />
          </div>
        )}
      </div>

      <SaveForm
        action={saveHomeHeroDesignAction}
        className="space-y-4"
        submitLabel={labels.save}
        savingLabel={labels.saving}
        savedMessage={labels.saved}
        errorMessages={saveErrorMessages(locale)}
        fallbackErrorMessage={labels.saveError}
        resetOnSuccess={false}
      >
        <div className="max-w-md space-y-1.5">
          <Label htmlFor="hero-design">Design</Label>
          <Select
            id="hero-design"
            name="design"
            value={design.design}
            onChange={(event) => set("design", event.target.value as HeroDesignName)}
          >
            <option value="classic">{nl ? "Huidig design: bouwtekening" : "Current design: blueprint"}</option>
            <option value="construction">
              {nl ? "Nieuw design: constructielogo" : "New design: construction logo"}
            </option>
            <option value="frontpage">
              {nl ? "Oude hero: foto en frontpages" : "Old hero: photo and front pages"}
            </option>
          </Select>
        </div>

        {/* `hidden` en niet weglaten: deze velden moeten mee in het formulier. */}
        <div hidden={!construction} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="hero-layout">{nl ? "Opstelling" : "Layout"}</Label>
            <Select
              id="hero-layout"
              name="layout"
              value={design.layout}
              onChange={(event) => set("layout", event.target.value as HeroLayout)}
            >
              <option value="lineEnds">{nl ? "Op de lijnuiteinden" : "On the line ends"}</option>
              <option value="inPlace">{nl ? "Op de plaats van nu" : "Where it is now"}</option>
              <option value="register">
                {nl ? "Links groot, register rechts" : "Large on the left, list on the right"}
              </option>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="hero-fill">Logo</Label>
            <Select
              id="hero-fill"
              name="fill"
              value={design.fill}
              onChange={(event) => set("fill", event.target.value as HeroFill)}
            >
              <option value="solid">{nl ? "Massief wit" : "Solid white"}</option>
              <option value="hatch">{nl ? "Arcering" : "Hatching"}</option>
              <option value="outline">{nl ? "Enkel omtrek" : "Outline only"}</option>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="hero-line-weight">{nl ? "Lijndikte" : "Line weight"}</Label>
            <Select
              id="hero-line-weight"
              name="lineWeight"
              value={design.lineWeight}
              onChange={(event) => set("lineWeight", event.target.value as HeroLineWeight)}
            >
              <option value="thin">{nl ? "Dun" : "Thin"}</option>
              <option value="medium">{nl ? "Midden" : "Medium"}</option>
              <option value="thick">{nl ? "Dik" : "Thick"}</option>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="hero-pattern">{nl ? "Patroon erachter" : "Pattern behind"}</Label>
            <Select
              id="hero-pattern"
              name="pattern"
              value={design.pattern ? "true" : "false"}
              onChange={(event) => set("pattern", event.target.value === "true")}
            >
              <option value="true">{nl ? "Aan" : "On"}</option>
              <option value="false">{nl ? "Uit" : "Off"}</option>
            </Select>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="hero-line-strength">
              {nl ? "Lijnen" : "Lines"}: <span className="tabular-nums">{design.lineStrength}%</span>
            </Label>
            <input
              id="hero-line-strength"
              name="lineStrength"
              type="range"
              className="block w-full max-w-md accent-[var(--navy)]"
              min={HERO_LINE_STRENGTH_MIN}
              max={HERO_LINE_STRENGTH_MAX}
              step={HERO_LINE_STRENGTH_STEP}
              value={design.lineStrength}
              onChange={(event) => set("lineStrength", Number(event.target.value))}
            />
          </div>
        </div>

        {/* De bouwtekening en het constructielogo; de oude hero heeft eigen animaties. */}
        <div hidden={legacy} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="hero-hover-color">{nl ? "Kleur bij hoveren" : "Colour on hover"}</Label>
            <Select
              id="hero-hover-color"
              name="hoverColor"
              value={design.hoverColor}
              onChange={(event) => set("hoverColor", event.target.value as HeroHoverColor)}
            >
              <option value="white">{nl ? "Wit" : "White"}</option>
              <option value="yellow">{nl ? "Geel" : "Yellow"}</option>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="hero-animation-speed">
              {nl ? "Snelheid van de animatie" : "Animation speed"}:{" "}
              <span className="tabular-nums">{design.animationSpeed}%</span>
            </Label>
            <input
              id="hero-animation-speed"
              name="animationSpeed"
              type="range"
              className="block w-full accent-[var(--navy)]"
              min={HERO_ANIMATION_SPEED_MIN}
              max={HERO_ANIMATION_SPEED_MAX}
              step={HERO_ANIMATION_SPEED_STEP}
              value={design.animationSpeed}
              onChange={(event) => set("animationSpeed", Number(event.target.value))}
            />
          </div>
        </div>

        <div hidden={!legacy} className="space-y-3">
          <div className="max-w-md space-y-1.5">
            <Label htmlFor="hero-frontpage">{nl ? "Welke frontpage" : "Which front page"}</Label>
            <Select
              id="hero-frontpage"
              name="frontpage"
              value={design.frontpage}
              onChange={(event) => set("frontpage", event.target.value as HeroFrontpageChoice)}
            >
              <option value="planned">
                {nl ? "Volgens de planning in Frontpages" : "As planned under Front pages"}
              </option>
              <option value="default">{nl ? "Standaard" : "Default"}</option>
              <option value="urenloop">{nl ? "24 urenloop" : "24-hour run"}</option>
              <option value="jobfair">Jobfair</option>
              <option value="nieuw">{nl ? "Nieuw" : "New"}</option>
            </Select>
          </div>
          <p className="text-sm text-[#5c667f]">
            {nl ? "De teksten en foto's staan onder " : "Texts and photos are under "}
            <Link href={`${base}/admin/frontpage`} className="underline">
              {nl ? "Frontpages" : "Front pages"}
            </Link>
            {nl ? ", de roterende titel onder " : ", the rotating headline under "}
            <Link href={`${base}/admin/slogans`} className="underline">
              Slogans
            </Link>
            .
          </p>
        </div>
      </SaveForm>
    </Card>
  );
}
