import type { ModelCatalogEntry, ModelDownloadStatus } from '@/src/types/ai';

export const MODEL_CACHE_NAME = 'veil-models-v1';

export const MODEL_CATALOG: ModelCatalogEntry[] = [
  {
    id: 'SmolLM2-360M-Instruct-q4f16_1-MLC',
    name: 'SmolLM2 360M Instruct (WebGPU)',
    tier: 'lite',
    category: 'llm',
    backend: 'webllm',
    sizeMB: 260,
    vramMB: 376,
    description:
      'Ultra-light local LLM for weekly reflections, structured document summaries, and date labeling on devices with 4 GB RAM or less.',
    cacheHint: 'SmolLM2-360M-Instruct',
  },
  {
    id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    name: 'Qwen 2.5 1.5B Instruct (WebGPU)',
    tier: 'standard',
    category: 'llm',
    backend: 'webllm',
    sizeMB: 980,
    vramMB: 1630,
    description:
      'High-accuracy local LLM with strong JSON schema adherence for complex contracts, invoices, and nuanced journal reflections.',
    cacheHint: 'Qwen2.5-1.5B-Instruct',
  },
  {
    id: 'onnx-community/Qwen2.5-0.5B-Instruct',
    name: 'Qwen 2.5 0.5B (WASM Fallback)',
    tier: 'lite',
    category: 'llm',
    backend: 'transformers-wasm',
    sizeMB: 390,
    description:
      'CPU/WASM fallback LLM for Safari, Firefox, or browsers without WebGPU hardware acceleration.',
    cacheHint: 'Qwen2.5-0.5B-Instruct',
  },
  {
    id: 'MicahB/roberta-base-go_emotions',
    name: 'GoEmotions Classifier (Distil/RoBERTa)',
    tier: 'lite',
    category: 'emotion',
    backend: 'transformers-wasm',
    sizeMB: 125,
    description: 'Detects 28 nuanced emotional states on-device when saving journal entries.',
    cacheHint: 'roberta-base-go_emotions',
  },
  {
    id: 'Xenova/all-MiniLM-L6-v2',
    name: 'MiniLM L6 v2 Embeddings',
    tier: 'lite',
    category: 'embedding',
    backend: 'transformers-wasm',
    sizeMB: 23,
    description:
      'Generates 384-dimensional local vectors for semantic search and finding similar journal entries.',
    cacheHint: 'all-MiniLM-L6-v2',
  },
  {
    id: 'Xenova/opus-mt-en-es',
    name: 'Translation: English → Spanish',
    tier: 'lite',
    category: 'translation',
    backend: 'transformers-wasm',
    sizeMB: 78,
    languagePair: { src: 'en', tgt: 'es' },
    description: 'On-device neural translation from English to Spanish.',
    cacheHint: 'opus-mt-en-es',
  },
  {
    id: 'Xenova/opus-mt-es-en',
    name: 'Translation: Spanish → English',
    tier: 'lite',
    category: 'translation',
    backend: 'transformers-wasm',
    sizeMB: 78,
    languagePair: { src: 'es', tgt: 'en' },
    description: 'On-device neural translation from Spanish to English.',
    cacheHint: 'opus-mt-es-en',
  },
  {
    id: 'Xenova/opus-mt-en-fr',
    name: 'Translation: English → French',
    tier: 'lite',
    category: 'translation',
    backend: 'transformers-wasm',
    sizeMB: 78,
    languagePair: { src: 'en', tgt: 'fr' },
    description: 'On-device neural translation from English to French.',
    cacheHint: 'opus-mt-en-fr',
  },
  {
    id: 'Xenova/opus-mt-fr-en',
    name: 'Translation: French → English',
    tier: 'lite',
    category: 'translation',
    backend: 'transformers-wasm',
    sizeMB: 78,
    languagePair: { src: 'fr', tgt: 'en' },
    description: 'On-device neural translation from French to English.',
    cacheHint: 'opus-mt-fr-en',
  },
  {
    id: 'Xenova/opus-mt-en-de',
    name: 'Translation: English → German',
    tier: 'lite',
    category: 'translation',
    backend: 'transformers-wasm',
    sizeMB: 78,
    languagePair: { src: 'en', tgt: 'de' },
    description: 'On-device neural translation from English to German.',
    cacheHint: 'opus-mt-en-de',
  },
  {
    id: 'Xenova/opus-mt-de-en',
    name: 'Translation: German → English',
    tier: 'lite',
    category: 'translation',
    backend: 'transformers-wasm',
    sizeMB: 78,
    languagePair: { src: 'de', tgt: 'en' },
    description: 'On-device neural translation from German to English.',
    cacheHint: 'opus-mt-de-en',
  },
  {
    id: 'tesseract-eng',
    name: 'Tesseract OCR: English',
    tier: 'lite',
    category: 'ocr',
    backend: 'tesseract',
    sizeMB: 11,
    ocrLang: 'eng',
    description: 'Offline optical character recognition pack for English documents.',
    cacheHint: 'eng.traineddata',
  },
  {
    id: 'tesseract-spa',
    name: 'Tesseract OCR: Spanish',
    tier: 'lite',
    category: 'ocr',
    backend: 'tesseract',
    sizeMB: 12,
    ocrLang: 'spa',
    description: 'Offline optical character recognition pack for Spanish documents.',
    cacheHint: 'spa.traineddata',
  },
  {
    id: 'tesseract-fra',
    name: 'Tesseract OCR: French',
    tier: 'lite',
    category: 'ocr',
    backend: 'tesseract',
    sizeMB: 11,
    ocrLang: 'fra',
    description: 'Offline optical character recognition pack for French documents.',
    cacheHint: 'fra.traineddata',
  },
  {
    id: 'tesseract-deu',
    name: 'Tesseract OCR: German',
    tier: 'lite',
    category: 'ocr',
    backend: 'tesseract',
    sizeMB: 12,
    ocrLang: 'deu',
    description: 'Offline optical character recognition pack for German documents.',
    cacheHint: 'deu.traineddata',
  },
];

export const OCR_LANGUAGES = [
  { code: 'eng', label: 'English' },
  { code: 'spa', label: 'Spanish' },
  { code: 'fra', label: 'French' },
  { code: 'deu', label: 'German' },
] as const;

export const TRANSLATION_PAIRS = [
  { id: 'Xenova/opus-mt-en-es', src: 'en', tgt: 'es', label: 'English → Spanish' },
  { id: 'Xenova/opus-mt-es-en', src: 'es', tgt: 'en', label: 'Spanish → English' },
  { id: 'Xenova/opus-mt-en-fr', src: 'en', tgt: 'fr', label: 'English → French' },
  { id: 'Xenova/opus-mt-fr-en', src: 'fr', tgt: 'en', label: 'French → English' },
  { id: 'Xenova/opus-mt-en-de', src: 'en', tgt: 'de', label: 'English → German' },
  { id: 'Xenova/opus-mt-de-en', src: 'de', tgt: 'en', label: 'German → English' },
] as const;

export async function inspectCachedModelStatus(): Promise<Record<string, ModelDownloadStatus>> {
  const statusMap: Record<string, ModelDownloadStatus> = {};
  for (const model of MODEL_CATALOG) {
    statusMap[model.id] = 'not-downloaded';
  }

  if (typeof caches === 'undefined') {
    return statusMap;
  }

  try {
    const cacheNames = await caches.keys();
    const allUrls: string[] = [];
    for (const cacheName of cacheNames) {
      const cache = await caches.open(cacheName);
      const requests = await cache.keys();
      for (const req of requests) {
        allUrls.push(req.url);
      }
    }

    for (const model of MODEL_CATALOG) {
      const hint = model.cacheHint ?? model.id;
      const found = allUrls.some((url) => url.includes(hint) || url.includes(model.id));
      if (found) {
        statusMap[model.id] = 'ready';
      }
    }
  } catch {
    // Ignore Cache Storage read failures in restricted environments
  }

  return statusMap;
}

export async function deleteModelFromCache(modelId: string): Promise<number> {
  if (typeof caches === 'undefined') return 0;
  const entry = MODEL_CATALOG.find((m) => m.id === modelId);
  const hint = entry?.cacheHint ?? modelId;
  let deletedCount = 0;

  const cacheNames = await caches.keys();
  for (const cacheName of cacheNames) {
    const cache = await caches.open(cacheName);
    const requests = await cache.keys();
    for (const req of requests) {
      if (req.url.includes(hint) || req.url.includes(modelId)) {
        const deleted = await cache.delete(req);
        if (deleted) deletedCount += 1;
      }
    }
  }
  return deletedCount;
}
