import * as Comlink from 'comlink';
import { createWorker } from 'tesseract.js';

export interface OcrProgressUpdate {
  status: string;
  progress: number; // 0..100
}

export interface OcrResultPayload {
  text: string;
  confidence: number;
  language: string;
}

export interface OcrWorkerApi {
  recognize(
    imageDataUrl: string,
    language: string,
    onProgress: (update: OcrProgressUpdate) => void,
  ): Promise<OcrResultPayload>;
  prefetchLanguage(
    language: string,
    onProgress: (update: OcrProgressUpdate) => void,
  ): Promise<boolean>;
}

const TESSDATA_HOST = 'https://tessdata.projectnaptha.com/4.0.0';
const OCR_CACHE_NAME = 'veil-models-v1';

async function ensureLanguageCached(language: string): Promise<void> {
  if (typeof caches === 'undefined') return;
  const url = `${TESSDATA_HOST}/${language}.traineddata.gz`;
  const cache = await caches.open(OCR_CACHE_NAME);
  const existing = await cache.match(url);
  if (!existing) {
    const response = await fetch(url);
    if (response.ok) {
      await cache.put(url, response.clone());
    }
  }
}

const ocrWorkerApi: OcrWorkerApi = {
  async prefetchLanguage(
    language: string,
    onProgress: (update: OcrProgressUpdate) => void,
  ): Promise<boolean> {
    onProgress({ status: `Preparing ${language} OCR pack...`, progress: 15 });
    await ensureLanguageCached(language);
    onProgress({ status: `Cached ${language} OCR pack`, progress: 100 });
    return true;
  },

  async recognize(
    imageDataUrl: string,
    language: string,
    onProgress: (update: OcrProgressUpdate) => void,
  ): Promise<OcrResultPayload> {
    await ensureLanguageCached(language).catch(() => undefined);

    const worker = await createWorker(language, 1, {
      workerPath: '/tesseract/worker.min.js',
      corePath: '/tesseract',
      langPath: TESSDATA_HOST,
      cacheMethod: 'write',
      logger: (message: { status: string; progress: number }) => {
        onProgress({
          status: message.status,
          progress: Math.round((message.progress ?? 0) * 100),
        });
      },
    });

    try {
      const { data } = await worker.recognize(imageDataUrl);
      return {
        text: data.text.trim(),
        confidence: Math.round(data.confidence),
        language,
      };
    } finally {
      await worker.terminate();
    }
  },
};

Comlink.expose(ocrWorkerApi);
