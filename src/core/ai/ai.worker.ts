import {
  env,
  pipeline,
  TextStreamer,
  type FeatureExtractionPipeline,
  type ProgressInfo,
  type TextClassificationPipeline,
  type TextGenerationPipeline,
  type TranslationPipeline,
} from '@huggingface/transformers';
import { CreateMLCEngine, type InitProgressReport, type MLCEngineInterface } from '@mlc-ai/web-llm';
import * as Comlink from 'comlink';
import { MODEL_CATALOG } from '@/src/core/ai/modelCatalog';
import type {
  AiWorkerApi,
  EmotionPrediction,
  GenerateOptions,
  ModelBackend,
  ModelLoadProgress,
} from '@/src/types/ai';

env.allowLocalModels = false;
env.useBrowserCache = true;

let mlcEngine: MLCEngineInterface | null = null;
let loadedMlcModelId: string | null = null;

let wasmLlmPipeline: TextGenerationPipeline | null = null;
let loadedWasmLlmId: string | null = null;

let emotionPipeline: TextClassificationPipeline | null = null;
let embeddingPipeline: FeatureExtractionPipeline | null = null;
const translationPipelines = new Map<string, TranslationPipeline>();

let activeAbortController: AbortController | null = null;
let generationCancelled = false;

function mapTransformersProgress(modelId: string, info: ProgressInfo): ModelLoadProgress | null {
  if (info.status === 'progress') {
    const pct = typeof info.progress === 'number' ? Math.round(info.progress) : 0;
    return {
      modelId,
      progress: Math.min(100, Math.max(0, pct)),
      statusText: `Downloading ${info.file ?? 'weights'} (${pct}%)`,
      loadedBytes: 'loaded' in info && typeof info.loaded === 'number' ? info.loaded : undefined,
      totalBytes: 'total' in info && typeof info.total === 'number' ? info.total : undefined,
    };
  }
  if (info.status === 'initiate') {
    return {
      modelId,
      progress: 5,
      statusText: `Preparing ${info.file ?? modelId}...`,
    };
  }
  if (info.status === 'done') {
    return {
      modelId,
      progress: 100,
      statusText: `Cached ${info.file ?? modelId}`,
    };
  }
  return null;
}

const workerApi: AiWorkerApi = {
  async loadModel(id: string, onProgress: (progress: ModelLoadProgress) => void) {
    const entry = MODEL_CATALOG.find((m) => m.id === id);
    const backend: ModelBackend = entry?.backend ?? 'transformers-wasm';

    if (backend === 'webllm') {
      if (mlcEngine && loadedMlcModelId === id) {
        onProgress({ modelId: id, progress: 100, statusText: 'Model ready in memory' });
        return { loaded: true, backend: 'webllm' };
      }
      if (mlcEngine) {
        await mlcEngine.unload();
        mlcEngine = null;
        loadedMlcModelId = null;
      }

      mlcEngine = await CreateMLCEngine(id, {
        initProgressCallback: (report: InitProgressReport) => {
          onProgress({
            modelId: id,
            progress: Math.round((report.progress ?? 0) * 100),
            statusText: report.text,
          });
        },
      });
      loadedMlcModelId = id;
      return { loaded: true, backend: 'webllm' };
    }

    const progressCb = (info: ProgressInfo): void => {
      const mapped = mapTransformersProgress(id, info);
      if (mapped) onProgress(mapped);
    };

    if (entry?.category === 'emotion' || id.includes('go_emotions')) {
      if (!emotionPipeline) {
        emotionPipeline = (await pipeline('text-classification', id, {
          dtype: 'q8',
          progress_callback: progressCb,
        })) as TextClassificationPipeline;
      }
      return { loaded: true, backend: 'transformers-wasm' };
    }

    if (entry?.category === 'embedding' || id.includes('MiniLM')) {
      if (!embeddingPipeline) {
        embeddingPipeline = (await pipeline('feature-extraction', id, {
          dtype: 'q8',
          progress_callback: progressCb,
        })) as FeatureExtractionPipeline;
      }
      return { loaded: true, backend: 'transformers-wasm' };
    }

    if (entry?.category === 'translation' || id.includes('opus-mt')) {
      if (!translationPipelines.has(id)) {
        const translator = (await pipeline('translation', id, {
          dtype: 'q8',
          progress_callback: progressCb,
        })) as TranslationPipeline;
        translationPipelines.set(id, translator);
      }
      return { loaded: true, backend: 'transformers-wasm' };
    }

    // Fallback WASM LLM via Transformers.js
    if (!wasmLlmPipeline || loadedWasmLlmId !== id) {
      wasmLlmPipeline = (await pipeline('text-generation', id, {
        dtype: 'q4',
        progress_callback: progressCb,
      })) as TextGenerationPipeline;
      loadedWasmLlmId = id;
    }

    return { loaded: true, backend: 'transformers-wasm' };
  },

  async generate(
    prompt: string,
    opts: GenerateOptions,
    onToken: (token: string, accumulated: string) => void,
  ): Promise<string> {
    generationCancelled = false;
    activeAbortController = new AbortController();

    const targetModelId = opts.modelId ?? loadedMlcModelId ?? loadedWasmLlmId;
    const isWebLlmTarget =
      mlcEngine !== null && (targetModelId === null || targetModelId === loadedMlcModelId);

    if (isWebLlmTarget && mlcEngine) {
      const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
      if (opts.systemPrompt) {
        messages.push({ role: 'system', content: opts.systemPrompt });
      }
      messages.push({ role: 'user', content: prompt });

      const chunks = await mlcEngine.chat.completions.create({
        messages,
        temperature: opts.temperature ?? 0.4,
        max_tokens: opts.maxTokens ?? 512,
        stream: true,
        response_format: opts.jsonMode ? { type: 'json_object' } : undefined,
      });

      let accumulated = '';
      for await (const chunk of chunks) {
        if (generationCancelled || activeAbortController?.signal.aborted) {
          break;
        }
        const delta = chunk.choices[0]?.delta?.content ?? '';
        if (delta) {
          accumulated += delta;
          onToken(delta, accumulated);
        }
      }
      return accumulated;
    }

    if (wasmLlmPipeline) {
      const formattedPrompt = opts.systemPrompt
        ? `System: ${opts.systemPrompt}\n\nUser: ${prompt}\n\nAssistant:`
        : prompt;

      let accumulated = '';
      const streamer = new TextStreamer(wasmLlmPipeline.tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: (text: string) => {
          if (!generationCancelled) {
            accumulated += text;
            onToken(text, accumulated);
          }
        },
      });

      const result = await wasmLlmPipeline(formattedPrompt, {
        max_new_tokens: opts.maxTokens ?? 320,
        temperature: opts.temperature ?? 0.4,
        do_sample: (opts.temperature ?? 0.4) > 0,
        streamer,
      });

      if (!accumulated && Array.isArray(result) && result.length > 0) {
        const first = result[0] as { generated_text?: string };
        const raw = first.generated_text ?? '';
        accumulated = raw.startsWith(formattedPrompt)
          ? raw.slice(formattedPrompt.length).trim()
          : raw;
        onToken(accumulated, accumulated);
      }
      return accumulated;
    }

    throw new Error(
      'No local LLM model is loaded yet. Open Model Manager to download and load a Lite or Standard model.',
    );
  },

  async classify(text: string): Promise<EmotionPrediction[]> {
    const modelId = 'MicahB/roberta-base-go_emotions';
    if (!emotionPipeline) {
      emotionPipeline = (await pipeline('text-classification', modelId, {
        dtype: 'q8',
      })) as TextClassificationPipeline;
    }
    const truncated = text.slice(0, 1200);
    const results = await emotionPipeline(truncated, { top_k: 5 });
    const flat = Array.isArray(results) ? results : [results];
    return flat
      .filter((item): item is { label: string; score: number } => {
        return (
          typeof item === 'object' &&
          item !== null &&
          'label' in item &&
          'score' in item &&
          typeof item.label === 'string' &&
          typeof item.score === 'number'
        );
      })
      .map((item) => ({
        label: item.label,
        score: Number(item.score.toFixed(4)),
      }));
  },

  async embed(text: string): Promise<number[]> {
    const modelId = 'Xenova/all-MiniLM-L6-v2';
    if (!embeddingPipeline) {
      embeddingPipeline = (await pipeline('feature-extraction', modelId, {
        dtype: 'q8',
      })) as FeatureExtractionPipeline;
    }
    const truncated = text.slice(0, 2000);
    const tensor = await embeddingPipeline(truncated, {
      pooling: 'mean',
      normalize: true,
    });
    const rawData = tensor.data as Float32Array;
    return Array.from(rawData);
  },

  async translate(
    text: string,
    src: string,
    tgt: string,
    onProgress?: (progress: ModelLoadProgress) => void,
  ): Promise<string> {
    const modelId = `Xenova/opus-mt-${src}-${tgt}`;
    let translator = translationPipelines.get(modelId);
    if (!translator) {
      translator = (await pipeline('translation', modelId, {
        dtype: 'q8',
        progress_callback: (info: ProgressInfo) => {
          if (!onProgress) return;
          const mapped = mapTransformersProgress(modelId, info);
          if (mapped) onProgress(mapped);
        },
      })) as TranslationPipeline;
      translationPipelines.set(modelId, translator);
    }

    // Split into paragraphs so long documents translate reliably
    const paragraphs = text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);

    if (paragraphs.length === 0) return '';

    const translatedChunks: string[] = [];
    for (const para of paragraphs) {
      const out = await translator(para.slice(0, 1500));
      const first = Array.isArray(out) ? out[0] : out;
      if (
        typeof first === 'object' &&
        first !== null &&
        'translation_text' in first &&
        typeof first.translation_text === 'string'
      ) {
        translatedChunks.push(first.translation_text);
      }
    }

    return translatedChunks.join('\n\n');
  },

  async cancel(): Promise<void> {
    generationCancelled = true;
    activeAbortController?.abort();
    if (mlcEngine) {
      await mlcEngine.interruptGenerate();
    }
  },

  async getLoadedModels(): Promise<string[]> {
    const loaded: string[] = [];
    if (loadedMlcModelId) loaded.push(loadedMlcModelId);
    if (loadedWasmLlmId) loaded.push(loadedWasmLlmId);
    if (emotionPipeline) loaded.push('MicahB/roberta-base-go_emotions');
    if (embeddingPipeline) loaded.push('Xenova/all-MiniLM-L6-v2');
    for (const key of translationPipelines.keys()) {
      loaded.push(key);
    }
    return loaded;
  },

  async unloadModel(id: string): Promise<void> {
    if (id === loadedMlcModelId && mlcEngine) {
      await mlcEngine.unload();
      mlcEngine = null;
      loadedMlcModelId = null;
    }
    if (id === loadedWasmLlmId) {
      wasmLlmPipeline = null;
      loadedWasmLlmId = null;
    }
    if (id === 'MicahB/roberta-base-go_emotions') {
      emotionPipeline = null;
    }
    if (id === 'Xenova/all-MiniLM-L6-v2') {
      embeddingPipeline = null;
    }
    if (translationPipelines.has(id)) {
      translationPipelines.delete(id);
    }
  },
};

Comlink.expose(workerApi);
