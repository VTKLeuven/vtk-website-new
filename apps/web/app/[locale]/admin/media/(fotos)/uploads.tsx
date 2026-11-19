"use client";

import { unsentGuard } from "@/components/ui/unsentGuard";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { finalizeImmichAlbumAction, uploadImmichAlbumAssetAction } from "@/app/actions/media";

/**
 * De uploads van het fotobeheer.
 *
 * Een context in de layout van Foto's en niet in het albumscherm: daar zou een
 * upload van vierhonderd foto's stilvallen (of onzichtbaar verder lopen) zodra
 * je links een ander album aanklikt. Nu loopt ze door en staat de voortgang
 * rechtsonder, waar je ook bent in Foto's.
 *
 * Eén foto per keer, via de server action van altijd. Meer tegelijk heeft geen
 * zin: Next voert de server actions van één pagina toch na elkaar uit.
 */

type Job = {
  id: string;
  albumId: string;
  partId: string;
  albumTitle: string;
  gallery: "main" | "fakbar";
  total: number;
  done: number;
  failed: number;
};

type EnqueueInput = {
  /** Het hoofdalbum, om de voortgang bij het juiste album te tonen. */
  albumId: string;
  /** Het Immich-album waar de foto's in komen: het album zelf of een tab. */
  partId: string;
  albumTitle: string;
  gallery?: "main" | "fakbar";
  files: File[];
};

type UploadContextValue = {
  jobs: Job[];
  enqueue: (input: EnqueueInput) => void;
};

const UploadContext = createContext<UploadContextValue | null>(null);

export function useUploads(): UploadContextValue {
  const value = useContext(UploadContext);
  if (!value) throw new Error("useUploads hoort binnen UploadProvider");
  return value;
}

export function UploadProvider({ locale, children }: { locale: string; children: ReactNode }) {
  const nl = locale === "nl";
  const router = useRouter();
  const showToast = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const queue = useRef<Promise<void>>(Promise.resolve());

  const update = (id: string, patch: (job: Job) => Partial<Job>) =>
    setJobs((current) => current.map((job) => (job.id === id ? { ...job, ...patch(job) } : job)));

  const run = useCallback(
    async (job: Job, files: File[]) => {
      let failed = 0;
      // Eén melding als het niet verstuurd raakt, niet één per foto.
      let unsentShown = false;
      for (const file of files) {
        const data = new FormData();
        data.append("albumId", job.partId);
        data.append("gallery", job.gallery);
        data.append("file", file);
        let ok = false;
        try {
          ok = (await uploadImmichAlbumAssetAction(data)).ok;
        } catch (error) {
          if (!unsentShown && unsentGuard.report(error)) unsentShown = true;
          ok = false;
        }
        if (!ok) failed += 1;
        update(job.id, (current) => ({ done: current.done + 1, failed: current.failed + (ok ? 0 : 1) }));
      }

      const finalize = new FormData();
      finalize.set("gallery", job.gallery);
      await finalizeImmichAlbumAction(finalize).catch(() => null);
      setJobs((current) => current.filter((item) => item.id !== job.id));

      const added = files.length - failed;
      showToast(
        failed === 0
          ? {
              message: nl
                ? `${added} foto('s) toegevoegd aan ${job.albumTitle}.`
                : `${added} photo(s) added to ${job.albumTitle}.`,
              variant: "success",
            }
          : {
              message: nl
                ? `${added} van de ${files.length} foto's toegevoegd aan ${job.albumTitle}; ${failed} mislukt. Enkel foto's en video's tot 45 MB kunnen erin.`
                : `${added} of ${files.length} photos added to ${job.albumTitle}; ${failed} failed. Only photos and videos up to 45 MB are accepted.`,
              variant: "error",
              duration: 0,
            },
      );
      router.refresh();
    },
    [nl, router, showToast],
  );

  const enqueue = useCallback(
    ({ albumId, partId, albumTitle, gallery = "main", files }: EnqueueInput) => {
      if (files.length === 0) return;
      const job: Job = {
        id: `${partId}-${Date.now()}`,
        albumId,
        partId,
        albumTitle,
        gallery,
        total: files.length,
        done: 0,
        failed: 0,
      };
      setJobs((current) => [...current, job]);
      // Uploads na elkaar, niet door elkaar: twee albums tegelijk vullen geeft
      // twee halve albums in plaats van één af album.
      queue.current = queue.current.then(() => run(job, files)).catch(() => undefined);
    },
    [run],
  );

  // Een tabblad sluiten midden in een upload laat een half album achter.
  const busy = jobs.length > 0;
  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  return (
    <UploadContext.Provider value={{ jobs, enqueue }}>
      {children}
      {jobs.length > 0 ? (
        <div className="media-upload-tray" role="status" aria-live="polite">
          <p className="media-upload-tray-title">
            {nl ? "Uploaden" : "Uploading"}
            <span>{nl ? "Laat dit tabblad open" : "Keep this tab open"}</span>
          </p>
          {jobs.map((job) => (
            <div key={job.id} className="media-upload-job">
              <span className="media-upload-job-label">
                {job.albumTitle}
                <span className="num">
                  {job.done}/{job.total}
                </span>
              </span>
              <span className="media-progress" aria-hidden="true">
                <i style={{ width: `${Math.round((job.done / job.total) * 100)}%` }} />
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </UploadContext.Provider>
  );
}
