import * as Comlink from 'comlink';
import { inspectCachedModelStatus } from '@/src/core/ai/modelCatalog';
import { networkMonitor } from '@/src/core/ai/networkMonitor';
import type { OcrProgressUpdate, OcrResultPayload, OcrWorkerApi } from '@/src/core/ai/ocr.worker';
import type {
  AiWorkerApi,
  EmotionPrediction,
  GenerateOptions,
  ModelLoadProgress,
} from '@/src/types/ai';

export class AiWorkerClient {
  private aiWorkerInstance: Worker | null = null;
  private aiProxy: Comlink.Remote<AiWorkerApi> | null = null;

  private ocrWorkerInstance: Worker | null = null;
  private ocrProxy: Comlink.Remote<OcrWorkerApi> | null = null;

  private ensureAiProxy(): Comlink.Remote<AiWorkerApi> {
    if (!this.aiProxy) {
      this.aiWorkerInstance = new Worker(new URL('./ai.worker.ts', import.meta.url), {
        type: 'module',
      });
      this.aiProxy = Comlink.wrap<AiWorkerApi>(this.aiWorkerInstance);
    }
    return this.aiProxy;
  }

  private ensureOcrProxy(): Comlink.Remote<OcrWorkerApi> {
    if (!this.ocrProxy) {
      this.ocrWorkerInstance = new Worker(new URL('./ocr.worker.ts', import.meta.url), {
        type: 'module',
      });
      this.ocrProxy = Comlink.wrap<OcrWorkerApi>(this.ocrWorkerInstance);
    }
    return this.ocrProxy;
  }

  private async assertNetworkAllowedIfUncached(modelId: string): Promise<void> {
    if (!networkMonitor.isAirGapLocked()) return;
    const cached = await inspectCachedModelStatus();
    if (cached[modelId] !== 'ready') {
      networkMonitor.recordBlockedRequest();
      throw new Error(
        `Blocked by Veil Air-Gap Lock: "${modelId}" is not cached locally yet. Disable Air-Gap Lock in Privacy to download it once.`,
      );
    }
  }

  public async loadModel(
    id: string,
    onProgress: (progress: ModelLoadProgress) => void,
  ): Promise<{ loaded: boolean; backend: string }> {
    try {
      await this.assertNetworkAllowedIfUncached(id);
      const proxy = this.ensureAiProxy();
      return await proxy.loadModel(id, Comlink.proxy(onProgress));
    } catch (err) {
      throw this.formatWorkerError(err);
    }
  }

  public async generate(
    prompt: string,
    opts: GenerateOptions,
    onToken: (token: string, accumulated: string) => void,
  ): Promise<string> {
    try {
      const proxy = this.ensureAiProxy();
      return await proxy.generate(prompt, opts, Comlink.proxy(onToken));
    } catch (err) {
      throw this.formatWorkerError(err);
    }
  }

  public async classify(text: string): Promise<EmotionPrediction[]> {
    try {
      await this.assertNetworkAllowedIfUncached('MicahB/roberta-base-go_emotions');
      const proxy = this.ensureAiProxy();
      return await proxy.classify(text);
    } catch (err) {
      throw this.formatWorkerError(err);
    }
  }

  public async embed(text: string): Promise<number[]> {
    try {
      await this.assertNetworkAllowedIfUncached('Xenova/all-MiniLM-L6-v2');
      const proxy = this.ensureAiProxy();
      return await proxy.embed(text);
    } catch (err) {
      throw this.formatWorkerError(err);
    }
  }

  public async translate(
    text: string,
    src: string,
    tgt: string,
    onProgress?: (progress: ModelLoadProgress) => void,
  ): Promise<string> {
    try {
      await this.assertNetworkAllowedIfUncached(`Xenova/opus-mt-${src}-${tgt}`);
      const proxy = this.ensureAiProxy();
      return await proxy.translate(
        text,
        src,
        tgt,
        onProgress ? Comlink.proxy(onProgress) : undefined,
      );
    } catch (err) {
      throw this.formatWorkerError(err);
    }
  }

  public async cancel(): Promise<void> {
    if (!this.aiProxy) return;
    await this.aiProxy.cancel();
  }

  public async getLoadedModels(): Promise<string[]> {
    if (!this.aiProxy) return [];
    return this.aiProxy.getLoadedModels();
  }

  public async unloadModel(id: string): Promise<void> {
    if (!this.aiProxy) return;
    await this.aiProxy.unloadModel(id);
  }

  public async recognizeOcr(
    imageDataUrl: string,
    language: string,
    onProgress: (update: OcrProgressUpdate) => void,
  ): Promise<OcrResultPayload> {
    try {
      const proxy = this.ensureOcrProxy();
      return await proxy.recognize(imageDataUrl, language, Comlink.proxy(onProgress));
    } catch (err) {
      throw this.formatWorkerError(err);
    }
  }

  public async prefetchOcrLanguage(
    language: string,
    onProgress: (update: OcrProgressUpdate) => void,
  ): Promise<boolean> {
    const proxy = this.ensureOcrProxy();
    return proxy.prefetchLanguage(language, Comlink.proxy(onProgress));
  }

  public terminateWorkers(): void {
    this.aiWorkerInstance?.terminate();
    this.aiWorkerInstance = null;
    this.aiProxy = null;
    this.ocrWorkerInstance?.terminate();
    this.ocrWorkerInstance = null;
    this.ocrProxy = null;
  }

  private formatWorkerError(err: unknown): Error {
    const message = err instanceof Error ? err.message : String(err);
    if (/QuotaExceededError|storage quota/i.test(message)) {
      return new Error(
        'Browser storage quota exceeded. Delete unused models in Model Manager or switch to a Lite model.',
      );
    }
    if (/out of memory|OOM|WebGPU.*memory|allocation failed/i.test(message)) {
      return new Error(
        'Device memory limit reached during inference. Switch to the Lite (360M/0.5B) model in Model Manager.',
      );
    }
    return err instanceof Error ? err : new Error(message);
  }
}

export const aiClient = new AiWorkerClient();
