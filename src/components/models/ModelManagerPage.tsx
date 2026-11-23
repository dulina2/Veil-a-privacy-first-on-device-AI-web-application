import { CheckCircle2, Cpu, Download, HardDrive, Trash2, Zap } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/src/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/card';
import { Progress } from '@/src/components/ui/progress';
import { aiClient } from '@/src/core/ai/aiClient';
import { detectDeviceCapabilities } from '@/src/core/ai/capabilities';
import {
  deleteModelFromCache,
  inspectCachedModelStatus,
  MODEL_CATALOG,
} from '@/src/core/ai/modelCatalog';
import { updateVaultMeta } from '@/src/core/crypto/vaultManager';
import type {
  DeviceCapabilities,
  ModelCatalogEntry,
  ModelDownloadStatus,
  ModelTier,
} from '@/src/types/ai';
import type { VaultMetaRecord } from '@/src/types/vault';

interface ModelManagerPageProps {
  meta: VaultMetaRecord;
  onMetaUpdated: (meta: VaultMetaRecord) => void;
}

export const ModelManagerPage: React.FC<ModelManagerPageProps> = ({ meta, onMetaUpdated }) => {
  const [capabilities, setCapabilities] = useState<DeviceCapabilities | null>(null);
  const [statuses, setStatuses] = useState<Record<string, ModelDownloadStatus>>({});
  const [progressMap, setProgressMap] = useState<Record<string, { pct: number; text: string }>>({});
  const [loadedInRam, setLoadedInRam] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refreshState = useCallback(async () => {
    const [caps, cacheStatus, active] = await Promise.all([
      detectDeviceCapabilities(),
      inspectCachedModelStatus(),
      aiClient.getLoadedModels(),
    ]);
    setCapabilities(caps);
    setStatuses(cacheStatus);
    setLoadedInRam(active);
  }, []);

  useEffect(() => {
    void refreshState();
  }, [refreshState]);

  const handleSelectTier = async (tier: ModelTier) => {
    const fallbackLlm = capabilities?.webgpuSupported
      ? tier === 'standard'
        ? 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC'
        : 'SmolLM2-360M-Instruct-q4f16_1-MLC'
      : 'onnx-community/Qwen2.5-0.5B-Instruct';

    const updated = await updateVaultMeta({
      selectedTier: tier,
      selectedLlmId: fallbackLlm,
    });
    onMetaUpdated(updated);
  };

  const handleSetActiveLlm = async (modelId: string) => {
    const updated = await updateVaultMeta({ selectedLlmId: modelId });
    onMetaUpdated(updated);
  };

  const handleDownloadModel = async (model: ModelCatalogEntry) => {
    setError(null);
    setStatuses((prev) => ({ ...prev, [model.id]: 'downloading' }));
    setProgressMap((prev) => ({
      ...prev,
      [model.id]: { pct: 2, text: 'Connecting to model host...' },
    }));

    try {
      if (model.category === 'ocr' && model.ocrLang) {
        await aiClient.prefetchOcrLanguage(model.ocrLang, (u) => {
          setProgressMap((prev) => ({
            ...prev,
            [model.id]: { pct: u.progress, text: u.status },
          }));
        });
      } else {
        await aiClient.loadModel(model.id, (p) => {
          setProgressMap((prev) => ({
            ...prev,
            [model.id]: { pct: p.progress, text: p.statusText },
          }));
        });
      }

      setStatuses((prev) => ({ ...prev, [model.id]: 'ready' }));
      setProgressMap((prev) => ({
        ...prev,
        [model.id]: { pct: 100, text: 'Cached in Cache Storage' },
      }));
      await refreshState();
    } catch (err) {
      setStatuses((prev) => ({ ...prev, [model.id]: 'error' }));
      setError(err instanceof Error ? err.message : 'Model download failed.');
    }
  };

  const handleDeleteModel = async (modelId: string) => {
    setError(null);
    await aiClient.unloadModel(modelId);
    await deleteModelFromCache(modelId);
    setProgressMap((prev) => {
      const next = { ...prev };
      delete next[modelId];
      return next;
    });
    await refreshState();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">On-Device Models</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Models download once into browser Cache Storage and run locally inside Web Workers.
          </p>
        </div>

        <div
          role="group"
          aria-label="Model tier preference"
          className="inline-flex rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-1 self-start"
        >
          <button
            type="button"
            onClick={() => void handleSelectTier('lite')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              meta.selectedTier === 'lite'
                ? 'bg-[var(--accent)] text-[var(--accent-foreground)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Lite Tier
          </button>
          <button
            type="button"
            onClick={() => void handleSelectTier('standard')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              meta.selectedTier === 'standard'
                ? 'bg-[var(--accent)] text-[var(--accent-foreground)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Standard Tier
          </button>
        </div>
      </div>

      {/* Hardware Probe Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
            <span>Device Capabilities & Recommendation</span>
          </CardTitle>
          <CardDescription>
            {capabilities?.fallbackReason ??
              `WebGPU active (${capabilities?.gpuAdapterName ?? 'Hardware GPU'}). Recommended tier: ${
                capabilities?.recommendedTier ?? 'lite'
              }.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="space-y-1">
              <span className="text-xs text-[var(--text-muted)] block">Acceleration</span>
              <span className="font-medium font-mono-tabular">
                {capabilities?.webgpuSupported ? 'WebGPU + WASM' : 'WASM CPU Fallback'}
              </span>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-[var(--text-muted)] block">Device Memory</span>
              <span className="font-medium font-mono-tabular">
                {capabilities?.deviceMemoryGB
                  ? `${capabilities.deviceMemoryGB} GB`
                  : 'Not reported'}
              </span>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-[var(--text-muted)] block">Storage Quota</span>
              <span className="font-medium font-mono-tabular">
                {capabilities?.storageQuotaMB
                  ? `${capabilities.storageUsageMB ?? 0} / ${capabilities.storageQuotaMB.toLocaleString()} MB`
                  : 'Inspecting...'}
              </span>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-[var(--text-muted)] block">Active LLM</span>
              <span
                className="font-medium font-mono-tabular truncate block"
                title={meta.selectedLlmId}
              >
                {meta.selectedLlmId.split('/').pop()}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-800 dark:text-red-200"
        >
          {error}
        </div>
      )}

      {/* Catalog List */}
      <div className="grid gap-3">
        {MODEL_CATALOG.map((model) => {
          const status = statuses[model.id] ?? 'not-downloaded';
          const prog = progressMap[model.id];
          const isSelectedLlm = model.category === 'llm' && meta.selectedLlmId === model.id;
          const isInRam = loadedInRam.includes(model.id);

          return (
            <Card key={model.id}>
              <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold">{model.name}</h3>
                    {isSelectedLlm && (
                      <span className="text-xs font-medium text-[var(--accent)] dark:text-[#7ac4d8]">
                        · Default LLM
                      </span>
                    )}
                    {isInRam && (
                      <span className="text-xs text-emerald-700 dark:text-emerald-400">
                        · Loaded in worker
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)] font-mono-tabular">
                    <span>{model.sizeMB} MB</span>
                    <span aria-hidden="true">·</span>
                    <span>{model.backend}</span>
                    <span aria-hidden="true">·</span>
                    <span className="capitalize">{model.category}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {status === 'ready'
                        ? 'Ready offline'
                        : status === 'downloading'
                          ? 'Downloading'
                          : status === 'error'
                            ? 'Download failed'
                            : 'Not downloaded'}
                    </span>
                  </div>

                  <p className="text-xs text-[var(--text-secondary)]">{model.description}</p>

                  {status === 'downloading' && prog && (
                    <div className="pt-2 space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-mono-tabular text-[var(--text-muted)]">
                        <span className="truncate">{prog.text}</span>
                        <span>{prog.pct}%</span>
                      </div>
                      <Progress value={prog.pct} />
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {model.category === 'llm' && !isSelectedLlm && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleSetActiveLlm(model.id)}
                    >
                      <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Use as Default</span>
                    </Button>
                  )}

                  {status !== 'ready' ? (
                    <Button
                      size="sm"
                      disabled={status === 'downloading'}
                      onClick={() => void handleDownloadModel(model)}
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{status === 'downloading' ? 'Downloading...' : 'Download'}</span>
                    </Button>
                  ) : (
                    <>
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 px-2">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Cached</span>
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleDeleteModel(model.id)}
                        aria-label={`Delete cached ${model.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Delete</span>
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-4 flex items-center gap-3 text-xs text-[var(--text-secondary)]">
          <HardDrive className="h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
          <span>
            Cached models live inside your browser&apos;s Cache Storage (`veil-models-v1` and WebLLM
            cache). Deleting a model frees quota immediately without touching your encrypted journal
            or document records.
          </span>
        </CardContent>
      </Card>
    </div>
  );
};
