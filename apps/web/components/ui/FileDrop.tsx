"use client";

import { useEffect, useRef, useState, type DragEvent as ReactDragEvent, type ReactNode } from "react";
import { UploadIcon } from "@/components/ui/icons";
import { pickDroppedFiles, type DropRejection } from "@/lib/fileDrop";

/**
 * Maakt van een uploadveld ook een sleepzone: je sleept een foto of bestand
 * rechtstreeks uit een map, in plaats van het in het systeemdialoog terug te
 * zoeken.
 *
 * Spreid `zoneProps` op het element dat de zone is (geef het `relative`) en zet
 * `<FileDropOverlay>` erin zolang `dragging` waar is. Het veld zelf beslist wat
 * er met de bestanden gebeurt; dit regelt enkel het slepen, de `accept`-regel en
 * het aantal.
 */

/** Sleept de gebruiker bestanden, en niet bv. geselecteerde tekst of een link? */
function carriesFiles(event: { dataTransfer: DataTransfer | null }) {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

// Mis je de zone, dan opent de browser het bestand zelf en ben je alles kwijt
// wat je al invulde. Zolang er een zone op de pagina staat, doet een bestand dat
// ernaast valt daarom niets.
//
// Eén luisteraar voor alle zones samen, en enkel voor wat niemand anders al
// aannam (`defaultPrevented`): op /admin/home staat een fotoveld per werking, en
// een luisteraar per zone weigerde dan de drop op elke andere zone. Een tekstvak
// of een echte file-input laten we hun eigen gedrag houden.
let mountedZones = 0;

function leftAlone(event: DragEvent) {
  if (event.defaultPrevented || !carriesFiles(event)) return true;
  const target = event.target;
  return (
    target instanceof Element &&
    target.closest('input, textarea, [contenteditable]:not([contenteditable="false"])') !== null
  );
}

function refuseMissedDragOver(event: DragEvent) {
  if (leftAlone(event)) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
}

function refuseMissedDrop(event: DragEvent) {
  if (!leftAlone(event)) event.preventDefault();
}

function guardMissedDrops() {
  if (mountedZones++ === 0) {
    window.addEventListener("dragover", refuseMissedDragOver);
    window.addEventListener("drop", refuseMissedDrop);
  }
  return () => {
    if (--mountedZones === 0) {
      window.removeEventListener("dragover", refuseMissedDragOver);
      window.removeEventListener("drop", refuseMissedDrop);
    }
  };
}

export function useFileDrop({
  accept,
  multiple = false,
  disabled = false,
  onFiles,
  onReject,
}: {
  /** Zelfde waarde als op de input; leeg laat elk bestand door. */
  accept?: string;
  multiple?: boolean;
  /** Bv. tijdens een upload: de zone licht niet op en weigert de drop. */
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  onReject: (reason: DropRejection) => void;
}) {
  const [hovering, setHovering] = useState(false);
  // `dragenter` en `dragleave` vuren ook bij elk kind dat je overschuift; een
  // teller houdt bij of je nog boven de zone hangt, anders flikkert de overlay.
  const depth = useRef(0);

  useEffect(guardMissedDrops, []);

  const zoneProps = {
    onDragEnter(event: ReactDragEvent<HTMLElement>) {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      depth.current += 1;
      setHovering(true);
    },
    onDragOver(event: ReactDragEvent<HTMLElement>) {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = disabled ? "none" : "copy";
    },
    onDragLeave(event: ReactDragEvent<HTMLElement>) {
      if (!carriesFiles(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setHovering(false);
    },
    onDrop(event: ReactDragEvent<HTMLElement>) {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      depth.current = 0;
      setHovering(false);
      if (disabled) return;
      const files = Array.from(event.dataTransfer.files);
      if (files.length === 0) return;
      const pick = pickDroppedFiles(files, { accept, multiple });
      if (pick.ok) onFiles(pick.files);
      else onReject(pick.reason);
    },
  };

  // Tijdens een upload licht de zone niet op, ook als je er al boven hing.
  return { dragging: hovering && !disabled, zoneProps };
}

/**
 * Wat je ziet terwijl je een bestand boven de zone houdt. De ouder moet
 * `relative` zijn; `className` zet de uitsnede (standaard precies de zone).
 */
export function FileDropOverlay({
  children,
  className = "inset-0",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute z-10 grid place-items-center rounded-2xl border-2 border-dashed border-vtk-navy/40 bg-vtk-blue-soft/95 ${className}`}
    >
      <span className="inline-flex items-center gap-2 px-3 text-center text-sm font-medium text-vtk-navy">
        <UploadIcon />
        {children}
      </span>
    </div>
  );
}
