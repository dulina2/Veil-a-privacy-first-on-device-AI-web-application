import { describe, expect, it, vi } from 'vitest';
import { AiWorkerClient } from '@/src/core/ai/aiClient';
import type { AiWorkerApi } from '@/src/types/ai';

describe('AiWorkerClient Typed Message API', () => {
  it('routes loadModel, generate streaming, classify, embed, translate, and cancel cleanly', async () => {
    const client = new AiWorkerClient();
    const cancelSpy = vi.fn(async () => undefined);

    const mockRemote: AiWorkerApi = {
      loadModel: vi.fn(async (id, onProgress) => {
        onProgress({ modelId: id, progress: 100, statusText: 'Ready' });
        return { loaded: true, backend: 'webllm' as const };
      }),
      generate: vi.fn(async (_prompt, _opts, onToken) => {
        onToken('Hello ', 'Hello ');
        onToken('world', 'Hello world');
        return 'Hello world';
      }),
      classify: vi.fn(async () => [{ label: 'calm', score: 0.92 }]),
      embed: vi.fn(async () => [0.1, 0.2, 0.3]),
      translate: vi.fn(async () => 'Hola mundo'),
      cancel: cancelSpy,
      getLoadedModels: vi.fn(async () => ['SmolLM2-360M-Instruct-q4f16_1-MLC']),
      unloadModel: vi.fn(async () => undefined),
    };

    // Inject mock remote proxy without constructing real Worker in jsdom
    (client as unknown as { aiProxy: AiWorkerApi }).aiProxy = mockRemote;

    const progressEvents: number[] = [];
    const loaded = await client.loadModel('SmolLM2-360M-Instruct-q4f16_1-MLC', (p) => {
      progressEvents.push(p.progress);
    });
    expect(loaded).toEqual({ loaded: true, backend: 'webllm' });
    expect(progressEvents).toEqual([100]);

    const streamed: string[] = [];
    const output = await client.generate('Summarize', {}, (_tok, acc) => {
      streamed.push(acc);
    });
    expect(output).toBe('Hello world');
    expect(streamed).toEqual(['Hello ', 'Hello world']);

    expect(await client.classify('I feel peaceful')).toEqual([{ label: 'calm', score: 0.92 }]);
    expect(await client.embed('peaceful day')).toEqual([0.1, 0.2, 0.3]);
    expect(await client.translate('Hello world', 'en', 'es')).toBe('Hola mundo');

    await client.cancel();
    expect(cancelSpy).toHaveBeenCalledTimes(1);
  });

  it('surfaces actionable recovery messages for QuotaExceededError and OOM failures', async () => {
    const client = new AiWorkerClient();
    const failingRemote: AiWorkerApi = {
      loadModel: vi.fn(async () => {
        throw new Error('QuotaExceededError: storage quota reached');
      }),
      generate: vi.fn(async () => {
        throw new Error('WebGPU out of memory allocation failed');
      }),
      classify: vi.fn(async () => []),
      embed: vi.fn(async () => []),
      translate: vi.fn(async () => ''),
      cancel: vi.fn(async () => undefined),
      getLoadedModels: vi.fn(async () => []),
      unloadModel: vi.fn(async () => undefined),
    };

    (client as unknown as { aiProxy: AiWorkerApi }).aiProxy = failingRemote;

    await expect(
      client.loadModel('Qwen2.5-1.5B-Instruct-q4f16_1-MLC', () => undefined),
    ).rejects.toThrow(/storage quota exceeded/i);
    await expect(client.generate('test', {}, () => undefined)).rejects.toThrow(
      /Device memory limit reached/i,
    );
  });

  it('installs NetworkPrivacyMonitor safely even when window.fetch is a getter-only property', async () => {
    const { networkMonitor } = await import('@/src/core/ai/networkMonitor');
    const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'fetch');

    Object.defineProperty(window, 'fetch', {
      get: () => async () => new Response('ok'),
      configurable: true,
    });

    expect(() => networkMonitor.install()).not.toThrow();
    expect(networkMonitor.getSnapshot().userDataRequests).toBe(0);

    if (originalDescriptor) {
      Object.defineProperty(window, 'fetch', originalDescriptor);
    }
  });
});
