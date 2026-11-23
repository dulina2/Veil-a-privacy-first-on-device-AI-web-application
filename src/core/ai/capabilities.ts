import type { DeviceCapabilities, ModelTier } from '@/src/types/ai';

interface NavigatorWithExtra extends Navigator {
  deviceMemory?: number;
}

interface GpuAdapterLike {
  features?: { has: (feature: string) => boolean };
  info?: { description?: string; vendor?: string; architecture?: string };
}

export async function detectDeviceCapabilities(): Promise<DeviceCapabilities> {
  const nav = navigator as NavigatorWithExtra;
  let webgpuSupported = false;
  let shaderF16Supported = false;
  let gpuAdapterName: string | null = null;
  let fallbackReason: string | null = null;

  const gpuApi = (nav as { gpu?: { requestAdapter: () => Promise<GpuAdapterLike | null> } }).gpu;
  if (gpuApi) {
    try {
      const adapter = await gpuApi.requestAdapter();
      if (adapter) {
        webgpuSupported = true;
        shaderF16Supported = adapter.features?.has('shader-f16') ?? false;
        gpuAdapterName =
          adapter.info?.description ||
          adapter.info?.architecture ||
          adapter.info?.vendor ||
          'WebGPU Hardware Adapter';
      } else {
        fallbackReason = 'No active WebGPU adapter detected; using WASM CPU fallback.';
      }
    } catch {
      fallbackReason = 'WebGPU initialization blocked; using WASM CPU fallback.';
    }
  } else {
    fallbackReason = 'WebGPU is unavailable in this browser; using WASM CPU fallback.';
  }

  const deviceMemoryGB = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null;
  const hardwareConcurrency = nav.hardwareConcurrency || 4;

  let storageQuotaMB: number | null = null;
  let storageUsageMB: number | null = null;
  if (navigator.storage?.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      if (typeof estimate.quota === 'number') {
        storageQuotaMB = Math.round(estimate.quota / (1024 * 1024));
      }
      if (typeof estimate.usage === 'number') {
        storageUsageMB = Math.round(estimate.usage / (1024 * 1024));
      }
    } catch {
      // Ignore storage estimate errors
    }
  }

  const hasEnoughMemoryForStandard =
    webgpuSupported &&
    (deviceMemoryGB === null || deviceMemoryGB >= 8) &&
    (storageQuotaMB === null || storageQuotaMB >= 2000);

  const recommendedTier: ModelTier = hasEnoughMemoryForStandard ? 'standard' : 'lite';

  let recommendedLlmId = 'onnx-community/Qwen2.5-0.5B-Instruct';
  if (webgpuSupported) {
    recommendedLlmId = hasEnoughMemoryForStandard
      ? 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC'
      : 'SmolLM2-360M-Instruct-q4f16_1-MLC';
  }

  return {
    webgpuSupported,
    shaderF16Supported,
    gpuAdapterName,
    deviceMemoryGB,
    hardwareConcurrency,
    storageQuotaMB,
    storageUsageMB,
    recommendedTier,
    recommendedLlmId,
    fallbackReason,
  };
}
