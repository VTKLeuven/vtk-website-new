'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ElixirIcon } from '@/components/elixir-icon';
import { AlbumViewer } from './album-viewer';

/**
 * "Vind mijn foto's" voor één fakbaralbum.
 *
 * Zelfde gedrag als het paneel op vtk.be: een foto kiezen of een selfie maken,
 * uitdrukkelijk toestemmen, en dan de opdracht bevragen tot ze klaar is. In de
 * vormtaal van deze app: Nederlands zonder vertaalsleutels, de knoppen en
 * kaarten van de fakbar, en de iconen uit `ElixirIcon`.
 *
 * De toestemmingstekst is bewust letterlijk over wat er gebeurt. Er wordt een
 * biometrische gezichtstemplate gemaakt, en dat is een bijzonder
 * persoonsgegeven; "we zoeken even je foto's" zou de verwerking mooier
 * voorstellen dan ze is.
 */

type Photo = {
  id: string;
  title: string;
  width: number;
  height: number;
  thumbnailUrl: string;
  previewUrl: string;
  downloadUrl: string;
};

type FaceSearchResult = {
  requestId: string;
  status: string;
  message?: string;
  errorCode?: string | null;
  matches?: { score: number; photo: Photo }[];
};

const MESSAGES: Record<string, string> = {
  processing: 'Je foto wordt verwerkt.',
  no_match: 'Geen match gevonden in dit album.',
  no_indexed_faces: 'Voor dit album zijn nog geen gezichten geïndexeerd.',
  timeout: 'De foto kon niet tijdig verwerkt worden. Probeer opnieuw met een duidelijke foto.',
  multiple_faces: 'Er staan meerdere gezichten op de foto. Gebruik er een met precies één gezicht.',
  failed: 'De zoekopdracht is mislukt.',
};

const ERRORS: Record<string, string> = {
  face_search_file_too_large: 'De geüploade foto is te groot.',
  face_search_file_type: 'Upload een JPEG-, PNG-, WebP-, HEIC- of HEIF-afbeelding.',
  face_search_consent_required: 'Je moet toestemming geven om te kunnen zoeken.',
  face_search_busy: 'Er lopen te veel zoekopdrachten tegelijk. Probeer zo meteen opnieuw.',
  face_search_rate_limited: 'Je probeerde het te vaak na elkaar. Wacht even en probeer opnieuw.',
  face_search_db_missing: 'Gezichtsherkenning is nog niet geconfigureerd.',
  face_search_disabled: 'Gezichtsherkenning staat uit voor deze galerij.',
};

async function requestJson(url: string, options?: RequestInit) {
  const response = await fetch(url, {
    ...options,
    headers: { Accept: 'application/json', ...options?.headers },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const error = new Error(body?.error || `Aanvraag mislukt met HTTP ${response.status}`);
    (error as Error & { code?: string }).code = body?.code;
    throw error;
  }

  return response.json();
}

function errorMessage(error: unknown): string {
  const code = error && typeof error === 'object' ? (error as { code?: string }).code : '';
  if (code && ERRORS[code]) return ERRORS[code];
  if (error instanceof Error) return error.message;
  return MESSAGES.failed;
}

function resultMessage(result: FaceSearchResult): string {
  const count = result.matches?.length || 0;
  if (result.status === 'matched') {
    return count === 1 ? '1 mogelijke match gevonden.' : `${count} mogelijke matches gevonden.`;
  }
  if (result.status === 'failed' && result.errorCode) return errorMessage({ code: result.errorCode });
  return MESSAGES[result.status] || MESSAGES.processing;
}

function canvasToJpegBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
}

function blobToFile(blob: Blob, name: string): File {
  try {
    return new File([blob], name, { type: blob.type || 'image/jpeg', lastModified: Date.now() });
  } catch {
    return Object.assign(blob, { name, lastModified: Date.now() }) as File;
  }
}

export function FaceSearchPanel({ albumSlug, configured }: { albumSlug: string; configured: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileSource, setFileSource] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState(configured ? '' : ERRORS.face_search_db_missing);
  const [requestId, setRequestId] = useState('');
  const [matches, setMatches] = useState<Photo[]>([]);
  const [cameraStatus, setCameraStatus] = useState('idle');
  const [cameraMessage, setCameraMessage] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraRequestRef = useRef(0);
  const previewObjectUrlRef = useRef('');

  const canUseLiveCamera = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

  /**
   * De camera moet in elk pad losgelaten worden, ook wanneer het paneel
   * dichtgaat of de component verdwijnt: anders blijft het lampje branden.
   */
  const releaseCamera = useCallback(() => {
    cameraRequestRef.current += 1;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const stopCamera = useCallback(() => {
    releaseCamera();
    setCameraStatus('idle');
    setCameraMessage('');
  }, [releaseCamera]);

  const revokePreview = useCallback(() => {
    if (previewObjectUrlRef.current && typeof URL !== 'undefined') {
      URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = '';
    }
  }, []);

  useEffect(() => () => releaseCamera(), [releaseCamera]);
  useEffect(() => () => revokePreview(), [revokePreview]);
  useEffect(() => {
    if (!isOpen) releaseCamera();
  }, [isOpen, releaseCamera]);

  useEffect(() => {
    if (!streamRef.current || !videoRef.current || !['starting', 'ready'].includes(cameraStatus)) return;
    if (videoRef.current.srcObject !== streamRef.current) videoRef.current.srcObject = streamRef.current;
    videoRef.current.play().catch(() => null);
  }, [cameraStatus]);

  // De opdracht loopt op de server; hier vragen we tot ze een eindstand heeft.
  useEffect(() => {
    if (!requestId || status !== 'processing') return undefined;

    let cancelled = false;
    let timer: number | undefined;

    async function poll() {
      try {
        const result = (await requestJson(
          `/api/gallery/face-search/${encodeURIComponent(requestId)}`,
        )) as FaceSearchResult;
        if (cancelled) return;

        setMessage(resultMessage(result));
        if (result.status !== 'processing') {
          setStatus(result.status);
          setMatches((result.matches || []).map((match) => match.photo));
          return;
        }

        timer = window.setTimeout(poll, 1800);
      } catch (error) {
        if (cancelled) return;
        setStatus('failed');
        setMessage(errorMessage(error));
      }
    }

    poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [requestId, status]);

  const selectedFileLabel = useMemo(() => {
    if (!file) return 'Nog geen foto gekozen';
    return `${file.name || 'selfie.jpg'}${fileSource === 'camera' ? ' · selfie' : ''}`;
  }, [file, fileSource]);

  function selectFile(selectedFile: File, source: string) {
    revokePreview();
    if (typeof URL !== 'undefined' && URL.createObjectURL) {
      const nextPreviewUrl = URL.createObjectURL(selectedFile);
      previewObjectUrlRef.current = nextPreviewUrl;
      setPreviewUrl(nextPreviewUrl);
    } else {
      setPreviewUrl('');
    }
    setFile(selectedFile);
    setFileSource(source);
    setStatus('idle');
    setMessage('');
    setRequestId('');
    setMatches([]);
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>, source: string) {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      selectFile(selectedFile, source);
      stopCamera();
    }
    // Leegmaken, anders vuurt dezelfde foto een tweede keer niet.
    event.target.value = '';
  }

  async function startCamera() {
    setCameraMessage('');

    if (!canUseLiveCamera) {
      cameraInputRef.current?.click();
      return;
    }

    let cameraRequestId: number | null = null;
    try {
      releaseCamera();
      cameraRequestId = cameraRequestRef.current + 1;
      cameraRequestRef.current = cameraRequestId;
      setCameraStatus('starting');

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
      });

      // Intussen kan er al een nieuwere aanvraag zijn; die wint.
      if (cameraRequestRef.current !== cameraRequestId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => null);
      }
      setCameraStatus('ready');
    } catch {
      if (cameraRequestId && cameraRequestRef.current !== cameraRequestId) return;
      releaseCamera();
      setCameraStatus('error');
      setCameraMessage('De camera openen lukt niet in deze browser. Kies een foto of gebruik de cameraknop van je toestel.');
    }
  }

  async function captureSelfie() {
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight) {
      setCameraMessage('De camera is nog niet klaar. Probeer zo meteen opnieuw.');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      setCameraMessage('Deze browser kon de selfie niet opslaan. Kies een foto als alternatief.');
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await canvasToJpegBlob(canvas);
    if (!blob) {
      setCameraMessage('Deze browser kon de selfie niet opslaan. Kies een foto als alternatief.');
      return;
    }

    selectFile(blobToFile(blob, `selfie-${Date.now()}.jpg`), 'camera');
    stopCamera();
  }

  function clearSelection() {
    revokePreview();
    setFile(null);
    setFileSource('');
    setPreviewUrl('');
    setStatus('idle');
    setMessage(configured ? '' : ERRORS.face_search_db_missing);
    setRequestId('');
    setMatches([]);
  }

  function reset() {
    clearSelection();
    setConsent(false);
    stopCamera();
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !consent || !configured) return;

    setStatus('processing');
    setMessage(MESSAGES.processing);
    setMatches([]);

    try {
      const formData = new FormData();
      formData.set('selfie', file, file.name || 'selfie.jpg');
      formData.set('consent', 'true');

      const result = (await requestJson(`/api/gallery/albums/${encodeURIComponent(albumSlug)}/face-search`, {
        method: 'POST',
        body: formData,
      })) as FaceSearchResult;

      setRequestId(result.requestId);
      setMessage(resultMessage(result));
    } catch (error) {
      setStatus('failed');
      setMessage(errorMessage(error));
    }
  }

  const hasFinished = !['idle', 'processing'].includes(status);
  const messageTone = status === 'matched' ? 'ok' : ['failed', 'timeout'].includes(status) ? 'error' : 'neutral';

  return (
    <section className="fakbar-face-panel" aria-label="Vind mijn foto's">
      <div className="fakbar-face-header">
        <div>
          <h2>Vind mijn foto&rsquo;s</h2>
          <p>
            Kies een duidelijke foto van jezelf of maak een selfie. Ze wordt tijdelijk verwerkt en daarna verwijderd.
          </p>
        </div>
        <button
          type="button"
          className="fakbar-btn fakbar-btn-ghost"
          onClick={() => {
            if (isOpen) stopCamera();
            setIsOpen((value) => !value);
          }}
          disabled={!configured}
        >
          {isOpen ? 'Sluiten' : 'Zoeken'}
        </button>
      </div>

      {isOpen ? (
        <form className="fakbar-face-form" onSubmit={submit}>
          <input
            ref={fileInputRef}
            className="fakbar-visually-hidden"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            aria-label="Profielfoto"
            onChange={(event) => handleFileChange(event, 'upload')}
          />
          <input
            ref={cameraInputRef}
            className="fakbar-visually-hidden"
            type="file"
            accept="image/*"
            capture="user"
            aria-label="Foto met de toestelcamera"
            onChange={(event) => handleFileChange(event, 'camera')}
          />

          <div className="fakbar-face-picker">
            <div className={`fakbar-face-preview${previewUrl ? ' has-image' : ''}`}>
              {/* Een blob-URL van de foto die net gekozen is: die bestaat enkel
                  in dit tabblad en valt niet door next/image te halen. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {previewUrl ? <img src={previewUrl} alt="Gekozen herkenningsfoto" /> : <ElixirIcon name="photo" className="h-7 w-7" />}
              {file ? (
                <button
                  type="button"
                  className="fakbar-face-preview-clear"
                  onClick={clearSelection}
                  title="Foto verwijderen"
                  aria-label="Foto verwijderen"
                >
                  <ElixirIcon name="close" className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            <div className="fakbar-face-picker-body">
              <div>
                <h3>Herkenningsfoto</h3>
                <p>{selectedFileLabel}</p>
              </div>
              <div className="fakbar-face-picker-actions">
                <button
                  type="button"
                  className="fakbar-btn fakbar-btn-ghost"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={status === 'processing'}
                >
                  <ElixirIcon name="upload" className="h-4 w-4" />
                  Foto kiezen
                </button>
                <button
                  type="button"
                  className="fakbar-btn fakbar-btn-ghost"
                  onClick={startCamera}
                  disabled={status === 'processing' || cameraStatus === 'starting'}
                >
                  <ElixirIcon name="camera" className="h-4 w-4" />
                  Selfie maken
                </button>
              </div>
            </div>
          </div>

          {cameraStatus !== 'idle' ? (
            <div className="fakbar-face-camera">
              {cameraStatus === 'ready' || cameraStatus === 'starting' ? (
                <div className="fakbar-face-camera-frame">
                  <video ref={videoRef} autoPlay playsInline muted />
                </div>
              ) : null}
              {cameraStatus === 'starting' ? <p>Camera openen...</p> : null}
              {cameraMessage ? <p>{cameraMessage}</p> : null}
              <div className="fakbar-face-camera-actions">
                {cameraStatus === 'ready' ? (
                  <button type="button" className="fakbar-btn fakbar-btn-primary" onClick={captureSelfie}>
                    <ElixirIcon name="camera" className="h-4 w-4" />
                    Gebruik deze selfie
                  </button>
                ) : null}
                {cameraStatus === 'error' ? (
                  <button
                    type="button"
                    className="fakbar-btn fakbar-btn-ghost"
                    onClick={() => cameraInputRef.current?.click()}
                  >
                    <ElixirIcon name="camera" className="h-4 w-4" />
                    Toestelcamera openen
                  </button>
                ) : null}
                <button type="button" className="fakbar-btn fakbar-btn-ghost" onClick={stopCamera}>
                  <ElixirIcon name="close" className="h-4 w-4" />
                  Annuleren
                </button>
              </div>
            </div>
          ) : null}

          <label className="fakbar-face-consent">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            <span>
              Ik geef uitdrukkelijk toestemming dat VTK van deze foto tijdelijk een biometrische gezichtstemplate
              maakt om mij in dit album te zoeken. Mijn foto en de template worden na de zoekopdracht verwijderd.
            </span>
          </label>

          <div className="fakbar-face-actions">
            <button
              type="submit"
              className="fakbar-btn fakbar-btn-primary"
              disabled={!file || !consent || status === 'processing'}
            >
              {status === 'processing' ? 'Verwerken...' : 'Zoek matches'}
            </button>
            {hasFinished ? (
              <button type="button" className="fakbar-btn fakbar-btn-ghost" onClick={reset}>
                <ElixirIcon name="retry" className="h-4 w-4" />
                Opnieuw zoeken
              </button>
            ) : null}
          </div>
        </form>
      ) : null}

      {message ? (
        <p className="fakbar-face-message" data-tone={messageTone}>
          {message}
        </p>
      ) : null}

      {matches.length > 0 ? (
        <div className="fakbar-face-results">
          <div className="fakbar-face-results-head">
            <h3>Matches</h3>
            <span>
              {matches.length} {matches.length === 1 ? 'foto' : "foto's"}
            </span>
          </div>
          <AlbumViewer photos={matches} albumSlug={albumSlug} />
        </div>
      ) : null}
    </section>
  );
}
