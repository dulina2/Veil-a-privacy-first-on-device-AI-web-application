import { Camera, Crop, FileUp, RotateCcw, Sparkles } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/src/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/card';
import type { CropQuad } from '@/src/types/scanner';
import { applyPerspectiveCorrection, DEFAULT_QUAD, detectDocumentEdges } from './opencvHelper';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

interface CaptureStepProps {
  originalImage: string | null;
  croppedImage: string | null;
  onCaptureComplete: (payload: {
    originalImage: string;
    croppedImage: string;
    sourceType: 'camera' | 'image' | 'pdf';
    suggestedTitle: string;
  }) => void;
  onProceedToOcr: () => void;
}

export const CaptureStep: React.FC<CaptureStepProps> = ({
  originalImage,
  croppedImage,
  onCaptureComplete,
  onProceedToOcr,
}) => {
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [quad, setQuad] = useState<CropQuad>(DEFAULT_QUAD);
  const [sourceType, setSourceType] = useState<'camera' | 'image' | 'pdf'>('image');
  const [suggestedTitle, setSuggestedTitle] = useState('Scanned Document');
  const [processing, setProcessing] = useState(false);
  const [edgeStatus, setEdgeStatus] = useState<string | null>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraActive(false);
  };

  const startCamera = async () => {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        'Camera access is not supported in this browser. Upload an image or PDF instead.',
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      window.requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      });
    } catch {
      setCameraError('Camera permission denied or unavailable. Use file upload below.');
    }
  };

  const processCapturedDataUrl = async (
    dataUrl: string,
    srcKind: 'camera' | 'image' | 'pdf',
    titleHint: string,
  ) => {
    setProcessing(true);
    setSourceType(srcKind);
    setSuggestedTitle(titleHint);
    try {
      const detection = await detectDocumentEdges(dataUrl);
      setQuad(detection.quad);
      setEdgeStatus(
        detection.usedOpenCv
          ? 'OpenCV edge detection ready. Adjust corners if needed, then apply crop.'
          : 'Manual 4-point crop ready.',
      );
      onCaptureComplete({
        originalImage: dataUrl,
        croppedImage: dataUrl,
        sourceType: srcKind,
        suggestedTitle: titleHint,
      });
    } finally {
      setProcessing(false);
    }
  };

  const takeSnapshot = async () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/png');
    stopCamera();
    await processCapturedDataUrl(
      dataUrl,
      'camera',
      `Camera Scan ${new Date().toISOString().slice(0, 10)}`,
    );
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCameraError(null);
    setProcessing(true);

    try {
      const cleanName = file.name.replace(/\.[^.]+$/, '') || 'Scanned Document';
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        const buffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Unable to create PDF canvas context.');
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        const dataUrl = canvas.toDataURL('image/png');
        await processCapturedDataUrl(dataUrl, 'pdf', cleanName);
      } else {
        const reader = new FileReader();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('Failed to read image file.'));
          reader.readAsDataURL(file);
        });
        await processCapturedDataUrl(dataUrl, 'image', cleanName);
      }
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : 'Unable to load file.');
      setProcessing(false);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingIdx === null || !overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    setQuad((prev) => {
      const next = [...prev] as CropQuad;
      next[draggingIdx] = { x, y };
      return next;
    });
  };

  const handleApplyPerspectiveCrop = async () => {
    if (!originalImage) return;
    setProcessing(true);
    try {
      const warped = await applyPerspectiveCorrection(originalImage, quad);
      onCaptureComplete({
        originalImage,
        croppedImage: warped,
        sourceType,
        suggestedTitle,
      });
      setEdgeStatus('Perspective correction applied.');
    } finally {
      setProcessing(false);
    }
  };

  const handleAutoDetect = async () => {
    if (!originalImage) return;
    setProcessing(true);
    try {
      const res = await detectDocumentEdges(originalImage);
      setQuad(res.quad);
      setEdgeStatus(res.usedOpenCv ? 'OpenCV contours updated.' : 'Reset to default bounds.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>1. Capture & Perspective Crop</CardTitle>
        <CardDescription>
          Capture with your camera or upload an image or PDF. Edge detection and perspective warp
          run locally using self-hosted OpenCV.js and PDF.js.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          {!cameraActive ? (
            <Button variant="outline" onClick={() => void startCamera()}>
              <Camera className="h-4 w-4" aria-hidden="true" />
              <span>Open Camera</span>
            </Button>
          ) : (
            <>
              <Button onClick={() => void takeSnapshot()}>
                <Camera className="h-4 w-4" aria-hidden="true" />
                <span>Capture Frame</span>
              </Button>
              <Button variant="ghost" onClick={stopCamera}>
                Cancel Camera
              </Button>
            </>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => void handleFileUpload(e)}
            data-testid="scanner-file-input"
          />
          <Button
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={processing}
          >
            <FileUp className="h-4 w-4" aria-hidden="true" />
            <span>{processing ? 'Processing...' : 'Upload Image or PDF'}</span>
          </Button>
        </div>

        {cameraError && (
          <p className="text-xs text-red-600 dark:text-red-400" role="alert">
            {cameraError}
          </p>
        )}

        {cameraActive && (
          <div className="rounded-xl overflow-hidden border border-[var(--border-hairline)] bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full max-h-[380px] object-contain"
            />
          </div>
        )}

        {originalImage && !cameraActive && (
          <div className="grid md:grid-cols-2 gap-4 items-start">
            <div className="space-y-2">
              <p className="text-xs font-medium text-[var(--text-secondary)]">
                Adjust 4 Crop Corners
              </p>
              <div
                ref={overlayRef}
                onPointerMove={handlePointerMove}
                onPointerUp={() => setDraggingIdx(null)}
                onPointerLeave={() => setDraggingIdx(null)}
                className="relative rounded-xl overflow-hidden border border-[var(--border-hairline)] bg-[var(--bg-subtle)] select-none touch-none"
              >
                <img
                  src={originalImage}
                  alt="Captured document for corner adjustment"
                  className="w-full h-auto block"
                />
                <svg
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  className="absolute inset-0 w-full h-full pointer-events-none"
                >
                  <polygon
                    points={quad.map((pt) => `${pt.x * 100},${pt.y * 100}`).join(' ')}
                    fill="rgba(30, 77, 92, 0.16)"
                    stroke="#5BA4B8"
                    strokeWidth="0.7"
                  />
                </svg>
                {quad.map((pt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    aria-label={`Drag crop corner ${idx + 1}`}
                    onPointerDown={() => setDraggingIdx(idx)}
                    style={{
                      left: `${pt.x * 100}%`,
                      top: `${pt.y * 100}%`,
                    }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-[var(--accent)] border-2 border-white shadow-md cursor-move"
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => void handleAutoDetect()}>
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Auto-Detect Edges</span>
                </Button>
                <Button variant="outline" size="sm" onClick={() => setQuad(DEFAULT_QUAD)}>
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Reset</span>
                </Button>
                <Button
                  size="sm"
                  onClick={() => void handleApplyPerspectiveCrop()}
                  disabled={processing}
                >
                  <Crop className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Apply Perspective Crop</span>
                </Button>
              </div>
              {edgeStatus && <p className="text-xs text-[var(--text-muted)]">{edgeStatus}</p>}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-[var(--text-secondary)]">
                Rectified Output Preview
              </p>
              <div className="rounded-xl overflow-hidden border border-[var(--border-hairline)] bg-[var(--bg-subtle)]">
                <img
                  src={croppedImage ?? originalImage}
                  alt="Perspective corrected document preview"
                  className="w-full h-auto block max-h-[360px] object-contain"
                />
              </div>
              <div className="flex justify-end pt-2">
                <Button onClick={onProceedToOcr}>Continue to OCR</Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
