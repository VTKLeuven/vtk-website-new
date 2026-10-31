"use client";

import { useState } from "react";
import { Card, Label } from "@vtk/ui";
import type { Locale } from "@vtk/i18n";
import { SaveForm } from "@/components/ui/SaveForm";
import { ThemedSelect } from "@/components/ui/ThemedSelect";
import { BlueprintHero } from "@/components/editorial/BlueprintHero";
import {
  HERO_ANIMATION_SPEED_MAX,
  HERO_ANIMATION_SPEED_MIN,
  HERO_ANIMATION_SPEED_STEP,
  HERO_LINE_STRENGTH_MAX,
  HERO_LINE_STRENGTH_MIN,
  HERO_LINE_STRENGTH_STEP,
  isHeroPhotoDesign,
  type HeroDesignName,
  type HeroDesignSetting,
  type HeroFill,
  type HeroHoverColor,
  type HeroLayout,
  type HeroLineWeight,
} from "@/lib/home/heroDesign";
import { saveErrorMessages } from "@/lib/saveMessages";
import { saveHomeHeroDesignAction } from "@/app/actions/home";
import "@/app/design/vtk-hero.css";

/**
 * Een hero met foto in een kader, op bureaubladbreedte en verkleind: een smal kader
 * zou de telefoonweergave tonen, en daar kijk je hier niet naar. De schaal komt uit
 * de container: `100cqw / WIDTH` is lengte gedeeld door lengte, dus het getal dat
 * `scale()` wil.
 *
 * Bewust geen `sandbox`: een kader met een ondoorzichtige oorsprong krijgt van de
 * dev-server geen `_next/static`, en dan komt het voorbeeld ongestileerd binnen. Het
 * is onze eigen pagina, achter hetzelfde recht als dit scherm, en `pointer-events:
 * none` zorgt dat niemand erin klikt.
 */
function PhotoHeroPreview({ url, title }: { url: string; title: string }) {
  const WIDTH = 1280;
  const HEIGHT = 840;
  return (
    <div
      className="overflow-hidden rounded-2xl bg-vtk-ink"
      style={{ containerType: "inline-size", aspectRatio: `${WIDTH} / ${HEIGHT}` }}
    >
      <iframe
        src={url}
        title={title}
        scrolling="no"
        style={{
          width: WIDTH,
          height: HEIGHT,
          border: 0,
          transform: `scale(calc(100cqw / ${WIDTH}px))`,
          transformOrigin: "top left",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

/**
 * Het design van de hero kiezen, met de echte hero als voorvertoning erboven: je
 * ziet wat een keuze doet voor je ze bewaart. De voorvertoning is `inert`, dus de
 * links erin doen niets, en de velden van een ander design worden mee bewaard,
 * zodat terugschakelen niets wist.
 *
 * De hero's met een foto zijn een eigen pagina met eigen stylesheets; die staan hier
 * in een kader.
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
  const [design, setDesign] = useState(initial);
  // Bij een andere opstelling, vulling of snelheid speelt de animatie opnieuw; de
  // lijndikte, -sterkte en hoverkleur laten de tekening staan.
  const replayKey = `${design.design}-${design.layout}-${design.fill}-${design.animationSpeed}`;
  const set = <K extends keyof HeroDesignSetting>(key: K, value: HeroDesignSetting[K]) =>
    setDesign((current) => ({ ...current, [key]: value }));
  const construction = design.design === "construction";
  const photoHero = isHeroPhotoDesign(design.design);

  return (
    <Card className="p-5">
      <h2 className="mb-1 font-semibold">Hero</h2>
      <p className="mb-4 text-sm text-[#5c667f]">
        {nl
          ? "Bovenaan de homepage. Het voorbeeld toont meteen wat je kiest; de site verandert pas na het bewaren."
          : "At the top of the homepage. The preview shows your choice right away; the site only changes after saving."}
      </p>

      <div className="mb-5">
        {photoHero ? (
          <PhotoHeroPreview
            key={design.design}
            url={`/hero-preview/${locale}/${design.design}`}
            title={nl ? "Voorbeeld van de hero" : "Preview of the hero"}
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
          <ThemedSelect
            id="hero-design"
            name="design"
            value={design.design}
            onChange={(value) => set("design", value as HeroDesignName)}
            options={[
              { value: "classic", label: nl ? "Bouwtekening" : "Blueprint" },
              { value: "construction", label: nl ? "Constructielogo" : "Construction logo" },
              { value: "oldHero", label: nl ? "Oude hero" : "Old hero" },
              { value: "urenloop", label: nl ? "24 urenloop" : "24-hour run" },
              { value: "jobfair", label: "Jobfair" },
            ]}
          />
        </div>

        {/* `hidden` en niet weglaten: deze velden moeten mee in het formulier. */}
        <div hidden={!construction} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="hero-layout">{nl ? "Opstelling" : "Layout"}</Label>
            <ThemedSelect
            id="hero-layout"
            name="layout"
            value={design.layout}
            onChange={(value) => set("layout", value as HeroLayout)}
            options={[
              { value: "lineEnds", label: nl ? "Op de lijnuiteinden" : "On the line ends" },
              { value: "leaders", label: nl ? "Met leiders rond het logo" : "With leaders around the logo" },
              {
                value: "register",
                label: nl ? "Links groot, register rechts" : "Large on the left, list on the right",
              },
            ]}
          />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="hero-fill">Logo</Label>
            <ThemedSelect
            id="hero-fill"
            name="fill"
            value={design.fill}
            onChange={(value) => set("fill", value as HeroFill)}
            options={[
              { value: "solid", label: nl ? "Massief wit" : "Solid white" },
              { value: "hatch", label: nl ? "Arcering" : "Hatching" },
              { value: "outline", label: nl ? "Enkel omtrek" : "Outline only" },
            ]}
          />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="hero-line-weight">{nl ? "Lijndikte" : "Line weight"}</Label>
            <ThemedSelect
            id="hero-line-weight"
            name="lineWeight"
            value={design.lineWeight}
            onChange={(value) => set("lineWeight", value as HeroLineWeight)}
            options={[
              { value: "thin", label: nl ? "Dun" : "Thin" },
              { value: "medium", label: nl ? "Midden" : "Medium" },
              { value: "thick", label: nl ? "Dik" : "Thick" },
            ]}
          />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="hero-pattern">{nl ? "Patroon erachter" : "Pattern behind"}</Label>
            <ThemedSelect
            id="hero-pattern"
            name="pattern"
            value={design.pattern ? "true" : "false"}
            onChange={(value) => set("pattern", value === "true")}
            options={[
              { value: "true", label: nl ? "Aan" : "On" },
              { value: "false", label: nl ? "Uit" : "Off" },
            ]}
          />
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

        {/* De bouwtekening en het constructielogo; de hero's met een foto hebben dit niet. */}
        <div hidden={photoHero} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="hero-hover-color">{nl ? "Kleur bij hoveren" : "Colour on hover"}</Label>
            <ThemedSelect
            id="hero-hover-color"
            name="hoverColor"
            value={design.hoverColor}
            onChange={(value) => set("hoverColor", value as HeroHoverColor)}
            options={[
              { value: "white", label: nl ? "Wit" : "White" },
              { value: "yellow", label: nl ? "Geel" : "Yellow" },
            ]}
          />
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
      </SaveForm>
    </Card>
  );
}
