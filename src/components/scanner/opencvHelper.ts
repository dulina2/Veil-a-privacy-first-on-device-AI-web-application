import type { CropQuad, NormalizedPoint } from '@/src/types/scanner';

interface CvMat {
  delete: () => void;
  rows: number;
  cols: number;
  data32S: Int32Array;
}

interface CvMatVector {
  size: () => number;
  get: (index: number) => CvMat;
  delete: () => void;
}

interface OpenCvRuntime {
  Mat: new (...args: unknown[]) => CvMat;
  MatVector: new () => CvMatVector;
  Size: new (w: number, h: number) => unknown;
  CV_32FC2: number;
  COLOR_RGBA2GRAY: number;
  RETR_LIST: number;
  CHAIN_APPROX_SIMPLE: number;
  INTER_LINEAR: number;
  BORDER_CONSTANT: number;
  imread: (canvas: HTMLCanvasElement) => CvMat;
  imshow: (canvas: HTMLCanvasElement, mat: CvMat) => void;
  cvtColor: (src: CvMat, dst: CvMat, code: number) => void;
  GaussianBlur: (src: CvMat, dst: CvMat, ksize: unknown, sigmaX: number) => void;
  Canny: (src: CvMat, dst: CvMat, t1: number, t2: number) => void;
  findContours: (
    img: CvMat,
    contours: CvMatVector,
    hierarchy: CvMat,
    mode: number,
    method: number,
  ) => void;
  contourArea: (contour: CvMat) => number;
  arcLength: (contour: CvMat, closed: boolean) => number;
  approxPolyDP: (contour: CvMat, approx: CvMat, epsilon: number, closed: boolean) => void;
  matFromArray: (rows: number, cols: number, type: number, data: number[]) => CvMat;
  getPerspectiveTransform: (src: CvMat, dst: CvMat) => CvMat;
  warpPerspective: (
    src: CvMat,
    dst: CvMat,
    M: CvMat,
    dsize: unknown,
    flags: number,
    borderMode: number,
  ) => void;
  onRuntimeInitialized?: () => void;
}

declare global {
  interface Window {
    cv?: OpenCvRuntime;
  }
}

export const DEFAULT_QUAD: CropQuad = [
  { x: 0.06, y: 0.06 },
  { x: 0.94, y: 0.06 },
  { x: 0.94, y: 0.94 },
  { x: 0.06, y: 0.94 },
];

let openCvLoadPromise: Promise<OpenCvRuntime | null> | null = null;

export function loadSelfHostedOpenCv(): Promise<OpenCvRuntime | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.cv && typeof window.cv.imread === 'function') {
    return Promise.resolve(window.cv);
  }
  if (openCvLoadPromise) return openCvLoadPromise;

  openCvLoadPromise = new Promise((resolve) => {
    const existingScript = document.querySelector('script[data-veil-opencv="true"]');
    if (existingScript) {
      resolve(window.cv ?? null);
      return;
    }

    const script = document.createElement('script');
    script.src = '/opencv/opencv.js';
    script.async = true;
    script.dataset.veilOpencv = 'true';

    const timeout = window.setTimeout(() => {
      resolve(window.cv && typeof window.cv.imread === 'function' ? window.cv : null);
    }, 6000);

    script.onload = () => {
      if (window.cv && typeof window.cv.imread === 'function') {
        window.clearTimeout(timeout);
        resolve(window.cv);
      } else if (window.cv) {
        window.cv.onRuntimeInitialized = () => {
          window.clearTimeout(timeout);
          resolve(window.cv ?? null);
        };
      } else {
        window.clearTimeout(timeout);
        resolve(null);
      }
    };
    script.onerror = () => {
      window.clearTimeout(timeout);
      resolve(null);
    };
    document.head.appendChild(script);
  });

  return openCvLoadPromise;
}

function orderQuadPoints(points: NormalizedPoint[]): CropQuad {
  const sortedBySum = [...points].sort((a, b) => a.x + a.y - (b.x + b.y));
  const sortedByDiff = [...points].sort((a, b) => a.y - a.x - (b.y - b.x));
  const tl = sortedBySum[0] ?? DEFAULT_QUAD[0];
  const br = sortedBySum[3] ?? DEFAULT_QUAD[2];
  const tr = sortedByDiff[0] ?? DEFAULT_QUAD[1];
  const bl = sortedByDiff[3] ?? DEFAULT_QUAD[3];
  return [tl, tr, br, bl];
}

export async function detectDocumentEdges(imageDataUrl: string): Promise<{
  quad: CropQuad;
  usedOpenCv: boolean;
}> {
  const img = await loadHtmlImage(imageDataUrl);
  const cv = await loadSelfHostedOpenCv();

  if (!cv) {
    return { quad: DEFAULT_QUAD, usedOpenCv: false };
  }

  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 640 / Math.max(img.width, img.height));
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return { quad: DEFAULT_QUAD, usedOpenCv: false };
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const src = cv.imread(canvas);
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edged = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    cv.Canny(blurred, edged, 50, 150);
    cv.findContours(edged, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    let bestArea = 0;
    let bestPoints: NormalizedPoint[] | null = null;
    const minArea = canvas.width * canvas.height * 0.15;

    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);
      if (area > minArea && area > bestArea) {
        const peri = cv.arcLength(cnt, true);
        const approx = new cv.Mat();
        cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
        if (approx.rows === 4) {
          const pts: NormalizedPoint[] = [];
          for (let r = 0; r < 4; r++) {
            const x = (approx.data32S[r * 2] ?? 0) / canvas.width;
            const y = (approx.data32S[r * 2 + 1] ?? 0) / canvas.height;
            pts.push({
              x: Math.min(1, Math.max(0, x)),
              y: Math.min(1, Math.max(0, y)),
            });
          }
          bestArea = area;
          bestPoints = pts;
        }
        approx.delete();
      }
      cnt.delete();
    }

    if (bestPoints) {
      return { quad: orderQuadPoints(bestPoints), usedOpenCv: true };
    }
    return { quad: DEFAULT_QUAD, usedOpenCv: true };
  } catch {
    return { quad: DEFAULT_QUAD, usedOpenCv: false };
  } finally {
    src.delete();
    gray.delete();
    blurred.delete();
    edged.delete();
    contours.delete();
    hierarchy.delete();
  }
}

export async function applyPerspectiveCorrection(
  imageDataUrl: string,
  quad: CropQuad,
): Promise<string> {
  const img = await loadHtmlImage(imageDataUrl);
  const w = img.width;
  const h = img.height;

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = w;
  srcCanvas.height = h;
  const srcCtx = srcCanvas.getContext('2d');
  if (!srcCtx) return imageDataUrl;
  srcCtx.drawImage(img, 0, 0);

  const [tl, tr, br, bl] = quad;
  const p = [
    { x: tl.x * w, y: tl.y * h },
    { x: tr.x * w, y: tr.y * h },
    { x: br.x * w, y: br.y * h },
    { x: bl.x * w, y: bl.y * h },
  ];

  const outWidth = Math.max(
    120,
    Math.round(
      Math.max(
        Math.hypot(p[1]!.x - p[0]!.x, p[1]!.y - p[0]!.y),
        Math.hypot(p[2]!.x - p[3]!.x, p[2]!.y - p[3]!.y),
      ),
    ),
  );
  const outHeight = Math.max(
    120,
    Math.round(
      Math.max(
        Math.hypot(p[3]!.x - p[0]!.x, p[3]!.y - p[0]!.y),
        Math.hypot(p[2]!.x - p[1]!.x, p[2]!.y - p[1]!.y),
      ),
    ),
  );

  const cv = await loadSelfHostedOpenCv();
  if (cv) {
    const srcMat = cv.imread(srcCanvas);
    const dstMat = new cv.Mat();
    const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
      p[0]!.x,
      p[0]!.y,
      p[1]!.x,
      p[1]!.y,
      p[2]!.x,
      p[2]!.y,
      p[3]!.x,
      p[3]!.y,
    ]);
    const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0,
      0,
      outWidth,
      0,
      outWidth,
      outHeight,
      0,
      outHeight,
    ]);
    const M = cv.getPerspectiveTransform(srcTri, dstTri);

    try {
      cv.warpPerspective(
        srcMat,
        dstMat,
        M,
        new cv.Size(outWidth, outHeight),
        cv.INTER_LINEAR,
        cv.BORDER_CONSTANT,
      );
      const outCanvas = document.createElement('canvas');
      outCanvas.width = outWidth;
      outCanvas.height = outHeight;
      cv.imshow(outCanvas, dstMat);
      return outCanvas.toDataURL('image/png');
    } finally {
      srcMat.delete();
      dstMat.delete();
      srcTri.delete();
      dstTri.delete();
      M.delete();
    }
  }

  // Fallback bounding crop when OpenCV WASM is unavailable
  const minX = Math.max(0, Math.min(...p.map((pt) => pt.x)));
  const minY = Math.max(0, Math.min(...p.map((pt) => pt.y)));
  const maxX = Math.min(w, Math.max(...p.map((pt) => pt.x)));
  const maxY = Math.min(h, Math.max(...p.map((pt) => pt.y)));

  const cropW = Math.max(10, Math.round(maxX - minX));
  const cropH = Math.max(10, Math.round(maxY - minY));

  const outCanvas = document.createElement('canvas');
  outCanvas.width = cropW;
  outCanvas.height = cropH;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) return imageDataUrl;
  outCtx.drawImage(srcCanvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
  return outCanvas.toDataURL('image/png');
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Unable to decode captured image.'));
    img.src = src;
  });
}
