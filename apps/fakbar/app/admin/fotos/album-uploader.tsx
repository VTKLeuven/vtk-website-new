'use client';

import { useRef, useState, useTransition } from 'react';
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
 * Album aanmaken en de foto's erin uploaden.
 *
 * Bestand per bestand, met de voortgang erbij: een avond fotograferen levert
 * makkelijk tweehonderd bestanden op, en één grote request daarvoor loopt op de
 * bodylimiet stuk zonder dat je weet hoever hij geraakt was. Mislukt er één,
 * dan gaat de rest gewoon door en zegt de melding achteraf hoeveel er niet
 * gelukt zijn.
 */
export function AlbumUploader() {
  const [files, setFiles] = useState<File[]>([]);
  const [coverIndex, setCoverIndex] = useState(0);
  const [progress, setProgress] = useState<Progress | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const showToast = useToast();
  const router = useRouter();
  const [, startTransition] = useTransition();

  function selectFiles(list: FileList | null) {
    const next = list ? Array.from(list) : [];
    setFiles(next);
    const firstImage = next.findIndex((file) => file.type.startsWith('image/'));
    setCoverIndex(firstImage >= 0 ? firstImage : 0);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;

    if (files.length === 0) {
      showToast({ message: "Kies eerst foto's om te uploaden.", variant: 'error', duration: 0 });
      return;
    }

    const created = await createAlbumAction(new FormData(form));
    if (!created.ok || !created.albumId) {
      showToast({
        message: ERRORS[created.error ?? ''] ?? 'Het album kon niet aangemaakt worden.',
        variant: 'error',
        duration: 0,
      });
      return;
    }

    let done = 0;
    let failed = 0;
    const assetIds: Array<string | null> = [];
    setProgress({ total: files.length, done, failed });

    for (const file of files) {
      const data = new FormData();
      data.append('albumId', created.albumId);
      data.append('file', file);
      try {
        const result = await uploadAssetAction(data);
        assetIds.push(result.ok && result.assetId ? result.assetId : null);
        if (!result.ok) failed += 1;
      } catch {
        assetIds.push(null);
        failed += 1;
      }
      done += 1;
      setProgress({ total: files.length, done, failed });
    }

    // De gekozen cover in Immich zelf zetten, zodat de keuze ook daar klopt.
    // Is die foto niet geraakt, dan valt hij terug op de eerste die wel lukte.
    const coverAssetId = assetIds[coverIndex] ?? assetIds.find((id) => id !== null) ?? null;
    let coverFailed = false;
    if (coverAssetId) {
      const coverData = new FormData();
      coverData.append('albumId', created.albumId);
      coverData.append('assetId', coverAssetId);
      try {
        const coverResult = await setAlbumCoverAction(coverData);
        coverFailed = !coverResult.ok;
      } catch {
        coverFailed = true;
      }
    }

    await finalizeAlbumAction();

    setProgress(null);
    setFiles([]);
    setCoverIndex(0);
    form.reset();
    if (inputRef.current) inputRef.current.value = '';

    const uploaded = done - failed;
    const base =
      failed === 0
        ? `Album aangemaakt met ${uploaded} ${uploaded === 1 ? 'foto' : "foto's"}.`
        : `Album aangemaakt; ${uploaded} van de ${done} gelukt, ${failed} mislukt.`;

    showToast({
      message: coverFailed ? `${base} De cover kon niet ingesteld worden.` : base,
      variant: failed === 0 ? 'success' : 'warning',
      duration: failed === 0 ? 4000 : 0,
    });
    startTransition(() => router.refresh());
  }

  const busy = progress !== null;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="album-title">Albumtitel</Label>
          <Input id="album-title" name="title" required maxLength={200} placeholder="Cantus 12 maart" />
        </div>
        <div>
          <Label htmlFor="album-description">Beschrijving (optioneel)</Label>
          <Input id="album-description" name="description" maxLength={1000} />
        </div>
      </div>

      <div>
        <Label htmlFor="album-files">Foto&rsquo;s</Label>
        <input
          ref={inputRef}
          id="album-files"
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

      {files.length > 0 ? (
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

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy
            ? `${progress.done}/${progress.total}${progress.failed ? ` (${progress.failed} mislukt)` : ''}`
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
