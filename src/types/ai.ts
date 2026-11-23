export type ModelTier = 'lite' | 'standard';

export type ModelBackend = 'webllm' | 'transformers-wasm' | 'transformers-webgpu' | 'tesseract';

export type ModelCategory = 'llm' | 'emotion' | 'embedding' | 'translation' | 'ocr';

export type ModelDownloadStatus = 'not-downloaded' | 'downloading' | 'ready' | 'error';

export interface ModelCatalogEntry {
  id: string;
  name: string;
  tier: ModelTier;
  category: ModelCategory;
  backend: ModelBackend;
  sizeMB: number;
  vramMB?: number;
  description: string;
  languagePair?: { src: string; tgt: string };
  ocrLang?: string;
  cacheHint?: string;
}

export interface ModelLoadProgress {
  modelId: string;
  progress: number; // 0 to 100
  statusText: string;
  loadedBytes?: number;
  totalBytes?: number;
}

export interface GenerateOptions {
  modelId?: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
}

export interface EmotionPrediction {
  label: string;
  score: number;
}

export interface DeviceCapabilities {
  webgpuSupported: boolean;
  shaderF16Supported: boolean;
  gpuAdapterName: string | null;
  deviceMemoryGB: number | null;
  hardwareConcurrency: number;
  storageQuotaMB: number | null;
  storageUsageMB: number | null;
  recommendedTier: ModelTier;
  recommendedLlmId: string;
  fallbackReason: string | null;
}

export interface AiWorkerApi {
  loadModel(
    id: string,
    onProgress: (progress: ModelLoadProgress) => void,
  ): Promise<{ loaded: boolean; backend: ModelBackend }>;
  generate(
    prompt: string,
    opts: GenerateOptions,
    onToken: (token: string, accumulated: string) => void,
  ): Promise<string>;
  classify(text: string): Promise<EmotionPrediction[]>;
  embed(text: string): Promise<number[]>;
  translate(
    text: string,
    src: string,
    tgt: string,
    onProgress?: (progress: ModelLoadProgress) => void,
  ): Promise<string>;
  cancel(): Promise<void>;
  getLoadedModels(): Promise<string[]>;
  unloadModel(id: string): Promise<void>;
}
