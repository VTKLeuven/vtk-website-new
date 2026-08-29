'use client';

import { useId, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Label } from '@vtk/ui';
import { useToast } from '@/components/ui/toast';
import { createAlbumAction, finalizeAlbumAction, setAlbumCoverAction, uploadAssetAction } from '@/app/actions/gallery';

type Progress = { total: number; done: number; failed: number };

const ERRORS: Record<string, string> = {
  missing_title: 'Geef het album een titel.',
  immich_unreachable: 'Immich is niet bereikbaar. Probeer het later opnieuw.',
  too_large: 'te groot',
  unsupported_type: 'geen foto of video',
  upload_failed: 'upload mislukt',
  missing: 'ontbrekend bestand',
};

/**
 * Foto's uploaden: naar een nieuw album, of naar een album dat er al staat.
 *
 * Bestand per bestand, met de voortgang erbij: een avond fotograferen levert
 * makkelijk tweehonderd bestanden op, en één grote request daarvoor loopt op de
 * bodylimiet stuk zonder dat je weet hoever hij geraakt was. Mislukt er één,
 * dan gaat de rest gewoon door en zegt de melding achteraf hoeveel er niet
 * gelukt zijn.
 *
 * **Waarom er ook een modus voor een bestaand album is.** Een album werd
 * aangemaakt vóór de eerste upload, dus liep er iets mis met de bestanden, dan
 * bleef er een leeg album achter waar je niets meer mee kon; het enige antwoord
 * was het in Immich zelf oplossen. Nu vul je het gewoon aan. Het is bovendien
 * de gewone gang van zaken: na een avond komen er later nog foto's van iemand
 * anders bij.
 */
export function AlbumUploader({ album }: { album?: { id: string; title: string } }) {
  const [files, setFiles] = useState<File[]>([]);
  const [coverIndex, setCoverIndex] = useState(0);
  const [progress, setProgress] = useState<Progress | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const showToast = useToast();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const fieldId = useId();

  // Naar een bestaand album uploaden verandert de cover niet: die is ooit
  // gekozen en hoort niet te verspringen omdat er foto's bijkomen.
  const isExisting = Boolean(album);

  function selectFiles(list: FileList | null) {
    const next = list ? Array.from(list) : [];
    setFiles(next);
    const firstImage = next.findIndex((file) => file.type.startsWith('image/'));
    setCoverIndex(firstImage >= 0 ? firstImage : 0);
  }

  function reset(form: HTMLFormElement) {
    setProgress(null);
    setFiles([]);
    setCoverIndex(0);
    form.reset();
    if (inputRef.current) inputRef.current.value = '';
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;

    if (files.length === 0) {
      showToast({ message: "Kies eerst foto's om te uploaden.", variant: 'error', duration: 0 });
      return;
    }

    let albumId = album?.id;
    if (!albumId) {
      const created = await createAlbumAction(new FormData(form));
      if (!created.ok || !created.albumId) {
        showToast({
          message: ERRORS[created.error ?? ''] ?? 'Het album kon niet aangemaakt worden.',
          variant: 'error',
          duration: 0,
        });
        return;
      }
      albumId = created.albumId;
    }

    let done = 0;
    let failed = 0;
    const assetIds: Array<string | null> = [];
    setProgress({ total: files.length, done, failed });

    for (const file of files) {
      const data = new FormData();
      data.append('albumId', albumId);
      data.append('file', file);
      try {
        const result = await uploadAssetAction(data);
        assetIds.push(result.ok && result.assetId ? result.assetId : null);
        if (!result.ok) failed += 1;
      } catch {
        // Een afgewezen request (te grote body, netwerk weg) gooit hier; die
        // telt als mislukt en mag de rest van de reeks niet stilleggen.
        assetIds.push(null);
        failed += 1;
      }
      done += 1;
      setProgress({ total: files.length, done, failed });
    }

    // De gekozen cover in Immich zelf zetten, zodat de keuze ook daar klopt.
    // Is die foto niet geraakt, dan valt hij terug op de eerste die wel lukte.
    let coverFailed = false;
    if (!isExisting) {
      const coverAssetId = assetIds[coverIndex] ?? assetIds.find((id) => id !== null) ?? null;
      if (coverAssetId) {
        const coverData = new FormData();
        coverData.append('albumId', albumId);
        coverData.append('assetId', coverAssetId);
        try {
          const coverResult = await setAlbumCoverAction(coverData);
          coverFailed = !coverResult.ok;
        } catch {
          coverFailed = true;
        }
      }
    }

    await finalizeAlbumAction();
    reset(form);

    const uploaded = done - failed;
    showToast({
      message: buildMessage({ isExisting, uploaded, done, failed, coverFailed, title: album?.title }),
      variant: failed === 0 ? 'success' : uploaded === 0 ? 'error' : 'warning',
      duration: failed === 0 ? 4000 : 0,
    });
    startTransition(() => router.refresh());
  }

  const busy = progress !== null;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {isExisting ? null : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor={`${fieldId}-title`}>Albumtitel</Label>
            <Input id={`${fieldId}-title`} name="title" required maxLength={200} placeholder="Cantus 12 maart" />
          </div>
          <div>
            <Label htmlFor={`${fieldId}-description`}>Beschrijving (optioneel)</Label>
            <Input id={`${fieldId}-description`} name="description" maxLength={1000} />
          </div>
        </div>
      )}

      <div>
        <Label htmlFor={`${fieldId}-files`}>Foto&rsquo;s</Label>
        <input
          ref={inputRef}
          id={`${fieldId}-files`}
          type="file"
          accept="image/*,video/*"
          multiple
          disabled={busy}
          onChange={(event) => selectFiles(event.target.files)}
          className="block w-full text-sm text-[var(--body)] file:mr-3 file:rounded-full file:border-0 file:bg-[var(--ink)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[var(--paper)] hover:file:bg-white"
        />
        <p className="mt-1.5 text-xs text-[var(--muted)]">
          Afbeeldingen en video&rsquo;s, maximaal 100 MB per bestand. Hier mag alles wat de moeite is; de selectie
          voor vtk.be gebeurt daar apart.
        </p>
      </div>

      {files.length > 0 && !isExisting ? (
        <div>
          <Label>Coverfoto</Label>
          <p className="mb-1.5 text-xs text-[var(--muted)]">
            Welke foto de cover van het album wordt. Die keuze staat ook in Immich zelf.
          </p>
          <ul className="max-h-52 divide-y divide-[var(--line)] overflow-y-auto rounded-xl border border-[var(--line)]">
            {files.map((file, index) => {
              const selectable = file.type.startsWith('image/');
              return (
                <li key={`${file.name}-${index}`}>
                  <label className="flex items-center gap-2.5 px-3.5 py-2 text-sm">
                    <input
                      type="radio"
                      name="coverChoice"
                      checked={coverIndex === index}
                      disabled={!selectable || busy}
                      onChange={() => setCoverIndex(index)}
                    />
                    <span className={selectable ? 'text-[var(--body)]' : 'text-[var(--muted)]'}>
                      {file.name}
                      {selectable ? '' : ' (video)'}
                    </span>
                    {coverIndex === index ? (
                      <span className="fakbar-badge ml-auto" data-tone="open">
                        Cover
                      </span>
                    ) : null}
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {files.length > 0 && isExisting ? (
        <p className="text-sm text-[var(--muted)]">
          {files.length} {files.length === 1 ? 'bestand' : 'bestanden'} klaar om toe te voegen. De cover van het
          album blijft zoals ze is.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy
            ? `${progress.done}/${progress.total}${progress.failed ? ` (${progress.failed} mislukt)` : ''}`
            : isExisting
              ? "Foto's toevoegen"
              : 'Album aanmaken en uploaden'}
        </Button>
        {busy ? (
          <p className="text-sm text-[var(--muted)]" role="status">
            Bezig met uploaden; laat dit tabblad open staan.
          </p>
        ) : null}
      </div>
    </form>
  );
}

/**
 * Wat er achteraf in de toast staat. Het geval dat er echt toe doet is
 * `uploaded === 0` bij een nieuw album: dan staat er een leeg album, en dat moet
 * de melding zeggen in plaats van "album aangemaakt" alsof het gelukt is.
 */
function buildMessage({
  isExisting,
  uploaded,
  done,
  failed,
  coverFailed,
  title,
}: {
  isExisting: boolean;
  uploaded: number;
  done: number;
  failed: number;
  coverFailed: boolean;
  title?: string;
}): string {
  const photos = (count: number) => `${count} ${count === 1 ? 'foto' : "foto's"}`;

  if (isExisting) {
    if (uploaded === 0) return `Er is niets toegevoegd aan ${title ?? 'het album'}; alle ${done} mislukt.`;
    if (failed === 0) return `${photos(uploaded)} toegevoegd aan ${title ?? 'het album'}.`;
    return `${photos(uploaded)} toegevoegd aan ${title ?? 'het album'}, ${failed} mislukt.`;
  }

  if (uploaded === 0) {
    return `Het album is aangemaakt maar leeg gebleven: alle ${done} uploads mislukten. Voeg de foto's hieronder toe bij het album, of verwijder het in Immich.`;
  }
  const base =
    failed === 0
      ? `Album aangemaakt met ${photos(uploaded)}.`
      : `Album aangemaakt; ${uploaded} van de ${done} gelukt, ${failed} mislukt.`;
  return coverFailed ? `${base} De cover kon niet ingesteld worden.` : base;
}
