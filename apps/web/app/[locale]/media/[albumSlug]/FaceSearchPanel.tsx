"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlbumViewer } from "./AlbumViewer";

type Photo = {
  id: string;
  title: string;
  width: number;
  height: number;
  thumbnailUrl: string;
  previewUrl: string;
  downloadUrl: string;
  matchScore?: number;
};

type FaceSearchResult = {
  requestId: string;
  status: string;
  message?: string;
  errorCode?: string | null;
  matches?: Array<{
    score: number;
    photo: Photo;
  }>;
};

type Labels = {
  findMyPhotos: string;
  faceSearchIntro: string;
  search: string;
  close: string;
  choosePhoto: string;
  takeSelfie: string;
  profilePhoto: string;
  deviceCameraUpload: string;
  selectedProfilePhoto: string;
  recognitionPhoto: string;
  noPhotoSelected: string;
  removePhoto: string;
  choosePhotoOrSelfie: string;
  selfieSuffix: string;
  openingCamera: string;
  useSelfie: string;
  openDeviceCamera: string;
  cameraOpenFailed: string;
  cameraNotReady: string;
  cameraSaveFailed: string;
  consent: string;
  start: string;
  processing: string;
  again: string;
  cancel: string;
  matches: string;
  faceProcessing: string;
  faceSearchNotConfigured: string;
  faceMatchedSingular: string;
  faceMatchedPlural: string;
  faceNoMatch: string;
  faceNoIndexedFaces: string;
  faceTimeout: string;
  faceMultipleFaces: string;
  faceFailed: string;
  faceFileTooLarge: string;
  faceFileType: string;
  faceConsentRequired: string;
  faceBusy: string;
  photo: string;
  photos: string;
  openPhoto: string;
  previousPhoto: string;
  nextPhoto: string;
  downloadPhoto: string;
  photoCounter: string;
};

function UploadIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path d="M12 16V4m0 0 4 4m-4-4-4 4M5 20h14" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path d="M9 7 10.4 5h3.2L15 7h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3Z" />
      <path d="M12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

function RetryIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5" />
    </svg>
  );
}

async function requestJson(url: string, options?: RequestInit) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const error = new Error(body?.error || `Request failed with HTTP ${response.status}`);
    (error as Error & { code?: string }).code = body?.code;
    throw error;
  }

  return response.json();
}

function canvasToJpegBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
}

function blobToFile(blob: Blob, name: string) {
  try {
    return new File([blob], name, { type: blob.type || "image/jpeg", lastModified: Date.now() });
  } catch {
    return Object.assign(blob, { name, lastModified: Date.now() }) as File;
  }
}

function errorMessage(error: unknown, labels: Labels) {
  const code = error && typeof error === "object" ? (error as { code?: string }).code : "";
  if (code === "face_search_file_too_large") return labels.faceFileTooLarge;
  if (code === "face_search_file_type") return labels.faceFileType;
  if (code === "face_search_consent_required") return labels.faceConsentRequired;
  if (code === "face_search_busy") return labels.faceBusy;
  if (code === "face_search_db_missing") return labels.faceSearchNotConfigured;
  if (error instanceof Error) return error.message;
  return labels.faceFailed;
}

function resultMessage(result: FaceSearchResult, labels: Labels) {
  const count = result.matches?.length || 0;
  if (result.status === "matched") {
    return count === 1
      ? labels.faceMatchedSingular.replace("{count}", String(count))
      : labels.faceMatchedPlural.replace("{count}", String(count));
  }
  if (result.status === "no_match") return labels.faceNoMatch;
  if (result.status === "no_indexed_faces") return labels.faceNoIndexedFaces;
  if (result.status === "timeout") return labels.faceTimeout;
  if (result.status === "multiple_faces") return labels.faceMultipleFaces;
  if (result.status === "failed") return result.errorCode ? errorMessage({ code: result.errorCode }, labels) : labels.faceFailed;
  return labels.faceProcessing;
}

export function FaceSearchPanel({
  albumSlug,
  configured,
  labels,
}: {
  albumSlug: string;
  configured: boolean;
  labels: Labels;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileSource, setFileSource] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState(configured ? "" : labels.faceSearchNotConfigured);
  const [requestId, setRequestId] = useState("");
  const [matches, setMatches] = useState<Photo[]>([]);
  const [cameraStatus, setCameraStatus] = useState("idle");
  const [cameraMessage, setCameraMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraRequestRef = useRef(0);
  const previewObjectUrlRef = useRef("");

  const canUseLiveCamera =
    typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);

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
    setCameraStatus("idle");
    setCameraMessage("");
  }, [releaseCamera]);

  const revokePreview = useCallback(() => {
    if (previewObjectUrlRef.current && typeof URL !== "undefined") {
      URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = "";
    }
  }, []);

  useEffect(() => () => releaseCamera(), [releaseCamera]);
  useEffect(() => () => revokePreview(), [revokePreview]);

  useEffect(() => {
    if (!isOpen) {
      releaseCamera();
    }
  }, [isOpen, releaseCamera]);

  useEffect(() => {
    if (!streamRef.current || !videoRef.current || !["starting", "ready"].includes(cameraStatus)) return;
    if (videoRef.current.srcObject !== streamRef.current) videoRef.current.srcObject = streamRef.current;
    videoRef.current.play().catch(() => null);
  }, [cameraStatus]);

  useEffect(() => {
    if (!requestId || status !== "processing") return undefined;

    let cancelled = false;
    let timer: number | undefined;

    async function poll() {
      try {
        const result = (await requestJson(`/api/immich-gallery/face-search/${encodeURIComponent(requestId)}`)) as FaceSearchResult;
        if (cancelled) return;

        setMessage(resultMessage(result, labels));
        if (result.status !== "processing") {
          setStatus(result.status);
          setMatches(
            (result.matches || []).map((match) => ({
              ...match.photo,
              matchScore: match.score,
            })),
          );
          return;
        }

        timer = window.setTimeout(poll, 1800);
      } catch (error) {
        if (!cancelled) {
          setStatus("failed");
          setMessage(errorMessage(error, labels));
        }
      }
    }

    poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [labels, requestId, status]);

  const selectedFileLabel = useMemo(() => {
    if (!file) return labels.noPhotoSelected;
    return `${file.name || "selfie.jpg"}${fileSource === "camera" ? ` · ${labels.selfieSuffix}` : ""}`;
  }, [file, fileSource, labels.noPhotoSelected, labels.selfieSuffix]);

  function setSelectedFile(selectedFile: File, source: string) {
    revokePreview();
    if (typeof URL !== "undefined" && URL.createObjectURL) {
      const nextPreviewUrl = URL.createObjectURL(selectedFile);
      previewObjectUrlRef.current = nextPreviewUrl;
      setPreviewUrl(nextPreviewUrl);
    } else {
      setPreviewUrl("");
    }
    setFile(selectedFile);
    setFileSource(source);
    setStatus("idle");
    setMessage("");
    setRequestId("");
    setMatches([]);
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>, source: string) {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      setSelectedFile(selectedFile, source);
      stopCamera();
    }
    event.target.value = "";
  }

  async function startCamera() {
    setCameraMessage("");

    if (!canUseLiveCamera) {
      cameraInputRef.current?.click();
      return;
    }

    let cameraRequestId: number | null = null;

    try {
      releaseCamera();
      cameraRequestId = cameraRequestRef.current + 1;
      cameraRequestRef.current = cameraRequestId;
      setCameraStatus("starting");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 960 },
        },
      });

      if (cameraRequestRef.current !== cameraRequestId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => null);
      }
      setCameraStatus("ready");
    } catch {
      if (cameraRequestId && cameraRequestRef.current !== cameraRequestId) return;
      releaseCamera();
      setCameraStatus("error");
      setCameraMessage(labels.cameraOpenFailed);
    }
  }

  async function captureSelfie() {
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight) {
      setCameraMessage(labels.cameraNotReady);
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setCameraMessage(labels.cameraSaveFailed);
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await canvasToJpegBlob(canvas);
    if (!blob) {
      setCameraMessage(labels.cameraSaveFailed);
      return;
    }

    setSelectedFile(blobToFile(blob, `selfie-${Date.now()}.jpg`), "camera");
    stopCamera();
  }

  function clearSelection() {
    revokePreview();
    setFile(null);
    setFileSource("");
    setPreviewUrl("");
    setStatus("idle");
    setMessage(configured ? "" : labels.faceSearchNotConfigured);
    setRequestId("");
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

    setStatus("processing");
    setMessage(labels.faceProcessing);
    setMatches([]);

    try {
      const formData = new FormData();
      formData.set("selfie", file, file.name || "selfie.jpg");
      formData.set("consent", consent ? "true" : "false");

      const result = (await requestJson(`/api/immich-gallery/albums/${encodeURIComponent(albumSlug)}/face-search`, {
        method: "POST",
        body: formData,
      })) as FaceSearchResult;

      setRequestId(result.requestId);
      setMessage(resultMessage(result, labels));
    } catch (error) {
      setStatus("failed");
      setMessage(errorMessage(error, labels));
    }
  }

  const hasFinished = !["idle", "processing"].includes(status);

  return (
    <section className="vtk-immich-face-panel" aria-label={labels.findMyPhotos}>
      <div className="vtk-immich-face-header">
        <div>
          <h2>{labels.findMyPhotos}</h2>
          <p>{labels.faceSearchIntro}</p>
        </div>
        <button
          className="vtk-button vtk-button-ghost"
          type="button"
          onClick={() => {
            if (isOpen) stopCamera();
            setIsOpen((value) => !value);
          }}
          disabled={!configured}
        >
          {isOpen ? labels.close : labels.search}
        </button>
      </div>

      {isOpen ? (
        <form className="vtk-immich-face-form" onSubmit={submit}>
          <input
            ref={fileInputRef}
            className="vtk-immich-visually-hidden"
            id={`profile-photo-${albumSlug}`}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            aria-label={labels.profilePhoto}
            onChange={(event) => handleFileChange(event, "upload")}
          />
          <input
            ref={cameraInputRef}
            className="vtk-immich-visually-hidden"
            type="file"
            accept="image/*"
            capture="user"
            aria-label={labels.deviceCameraUpload}
            onChange={(event) => handleFileChange(event, "camera")}
          />

          <div className="vtk-immich-selfie-picker">
            <div className={`vtk-immich-selfie-preview ${previewUrl ? "has-image" : ""}`}>
              {previewUrl ? <img src={previewUrl} alt={labels.selectedProfilePhoto} /> : <FileIcon />}
              {file ? (
                <button
                  className="vtk-immich-preview-clear"
                  type="button"
                  onClick={clearSelection}
                  aria-label={labels.removePhoto}
                >
                  <XIcon />
                </button>
              ) : null}
            </div>
            <div className="vtk-immich-selfie-body">
              <div>
                <h3>{labels.recognitionPhoto}</h3>
                <p>{selectedFileLabel}</p>
              </div>
              <div className="vtk-immich-selfie-actions" aria-label={labels.choosePhotoOrSelfie}>
                <button
                  className="vtk-button vtk-button-ghost"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={status === "processing"}
                >
                  <UploadIcon />
                  {labels.choosePhoto}
                </button>
                <button
                  className="vtk-button vtk-button-ghost"
                  type="button"
                  onClick={startCamera}
                  disabled={status === "processing" || cameraStatus === "starting"}
                >
                  <CameraIcon />
                  {labels.takeSelfie}
                </button>
              </div>
            </div>
          </div>

          {cameraStatus !== "idle" ? (
            <div className={`vtk-immich-camera-panel ${cameraStatus}`}>
              {cameraStatus === "ready" || cameraStatus === "starting" ? (
                <div className="vtk-immich-camera-frame">
                  <video ref={videoRef} autoPlay playsInline muted />
                </div>
              ) : null}
              {cameraStatus === "starting" ? <p>{labels.openingCamera}</p> : null}
              {cameraMessage ? <p>{cameraMessage}</p> : null}
              <div className="vtk-immich-camera-actions">
                {cameraStatus === "ready" ? (
                  <button className="vtk-button vtk-button-primary" type="button" onClick={captureSelfie}>
                    <CameraIcon />
                    {labels.useSelfie}
                  </button>
                ) : null}
                {cameraStatus === "error" ? (
                  <button className="vtk-button vtk-button-ghost" type="button" onClick={() => cameraInputRef.current?.click()}>
                    <CameraIcon />
                    {labels.openDeviceCamera}
                  </button>
                ) : null}
                <button className="vtk-button vtk-button-ghost" type="button" onClick={stopCamera}>
                  <RetryIcon />
                  {labels.cancel}
                </button>
              </div>
            </div>
          ) : null}

          <label className="vtk-immich-consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />
            <span>{labels.consent}</span>
          </label>

          <div className="vtk-immich-face-actions">
            <button className="vtk-button vtk-button-primary" type="submit" disabled={!file || !consent || status === "processing"}>
              {status === "processing" ? labels.processing : labels.start}
            </button>
            {hasFinished ? (
              <button className="vtk-button vtk-button-ghost" type="button" onClick={reset}>
                {labels.again}
              </button>
            ) : null}
          </div>
        </form>
      ) : null}

      {message ? <p className={`vtk-immich-face-message ${status}`}>{message}</p> : null}

      {matches.length > 0 ? (
        <div className="vtk-immich-match-results">
          <div className="vtk-immich-match-heading">
            <h2>{labels.matches}</h2>
            <span>
              {matches.length} {matches.length === 1 ? labels.photo : labels.photos}
            </span>
          </div>
          <AlbumViewer
            photos={matches}
            labels={{
              openPhoto: labels.openPhoto,
              close: labels.close,
              previous: labels.previousPhoto,
              next: labels.nextPhoto,
              downloadPhoto: labels.downloadPhoto,
              photoCounter: labels.photoCounter,
            }}
          />
        </div>
      ) : null}
    </section>
  );
}
