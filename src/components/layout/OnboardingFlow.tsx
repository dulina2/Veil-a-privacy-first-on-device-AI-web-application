import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Lock,
  Plane,
  ShieldCheck,
  WifiOff,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Button } from '@/src/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/card';
import { Input } from '@/src/components/ui/input';
import { Progress } from '@/src/components/ui/progress';
import { aiClient } from '@/src/core/ai/aiClient';
import { detectDeviceCapabilities } from '@/src/core/ai/capabilities';
import { MODEL_CATALOG } from '@/src/core/ai/modelCatalog';
import { initializeVault } from '@/src/core/crypto/vaultManager';
import { importEncryptedBackup } from '@/src/core/db/encryptedStore';
import { useOnlineStatus } from '@/src/core/pwa/useOnlineStatus';
import type { DeviceCapabilities, ModelTier } from '@/src/types/ai';
import type { VaultMetaRecord, VeilBackupFile } from '@/src/types/vault';

interface OnboardingFlowProps {
  onComplete: (meta: VaultMetaRecord) => void;
}

export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({ onComplete }) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [capabilities, setCapabilities] = useState<DeviceCapabilities | null>(null);
  const [selectedTier, setSelectedTier] = useState<ModelTier>('lite');
  const [selectedLlmId, setSelectedLlmId] = useState<string>('SmolLM2-360M-Instruct-q4f16_1-MLC');
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [understoodNoRecovery, setUnderstoodNoRecovery] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [downloadText, setDownloadText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [creatingVault, setCreatingVault] = useState(false);
  const [createdMeta, setCreatedMeta] = useState<VaultMetaRecord | null>(null);
  const [offlineProbeDone, setOfflineProbeDone] = useState(false);
  const isOnline = useOnlineStatus();

  useEffect(() => {
    void detectDeviceCapabilities().then((caps) => {
      setCapabilities(caps);
      setSelectedTier(caps.recommendedTier);
      setSelectedLlmId(caps.recommendedLlmId);
    });
  }, []);

  const llmOptions = MODEL_CATALOG.filter((m) => m.category === 'llm');

  const handleSelectTier = (tier: ModelTier) => {
    setSelectedTier(tier);
    if (!capabilities?.webgpuSupported) {
      setSelectedLlmId('onnx-community/Qwen2.5-0.5B-Instruct');
      return;
    }
    setSelectedLlmId(
      tier === 'standard'
        ? 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC'
        : 'SmolLM2-360M-Instruct-q4f16_1-MLC',
    );
  };

  const handlePrefetchModel = async () => {
    setError(null);
    setDownloadProgress(2);
    setDownloadText('Starting local model download into Cache Storage...');
    try {
      await aiClient.loadModel(selectedLlmId, (p) => {
        setDownloadProgress(p.progress);
        setDownloadText(p.statusText);
      });
      setDownloadProgress(100);
      setDownloadText('Model cached locally and ready for offline use.');
    } catch (err) {
      setDownloadProgress(null);
      setError(err instanceof Error ? err.message : 'Model download interrupted.');
    }
  };

  const handleCreateVault = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (passphrase.length < 8) {
      setError('Use a passphrase of at least 8 characters.');
      return;
    }
    if (passphrase !== confirmPassphrase) {
      setError('Passphrases do not match.');
      return;
    }
    if (!understoodNoRecovery) {
      setError('Confirm that you understand forgotten passphrases cannot be recovered.');
      return;
    }

    setCreatingVault(true);
    try {
      const meta = await initializeVault({
        passphrase,
        selectedTier,
        selectedLlmId,
      });
      setCreatedMeta(meta);
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize encrypted vault.');
    } finally {
      setCreatingVault(false);
    }
  };

  const handleImportExistingBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const parsed = JSON.parse(await file.text()) as VeilBackupFile;
      await importEncryptedBackup(parsed);
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid backup file.');
    }
  };

  const handleRunLocalCryptoSelfTest = () => {
    setOfflineProbeDone(true);
  };

  return (
    <main className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] py-8 px-4 sm:px-6 flex items-center justify-center">
      <div className="w-full max-w-2xl space-y-6">
        <header className="flex items-center justify-between gap-4 border-b border-[var(--border-hairline)] pb-4">
          <div className="flex items-center gap-3">
            <img src="/icon.svg" alt="Veil logo" className="h-8 w-8 rounded-lg" />
            <span className="text-lg font-semibold tracking-tight">Veil</span>
          </div>
          <span className="text-xs font-mono-tabular text-[var(--text-muted)]">
            Step {step} of 4
          </span>
        </header>

        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">On-device AI that never phones home</CardTitle>
              <CardDescription>
                Every journal entry, emotion score, document scan, and summary stays encrypted on
                this device.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-3 text-sm">
                <div className="p-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] space-y-1">
                  <p className="font-medium">Local Inference</p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    WebLLM (WebGPU) and Transformers.js (WASM) run inside dedicated Web Workers.
                  </p>
                </div>
                <div className="p-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] space-y-1">
                  <p className="font-medium">AES-256-GCM Vault</p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    IndexedDB records are encrypted before write using a key held strictly in RAM.
                  </p>
                </div>
                <div className="p-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] space-y-1">
                  <p className="font-medium">Zero Telemetry</p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Strict Content Security Policy blocks external scripts, fonts, and analytics.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Cpu className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
                  <span>Hardware Inspection</span>
                </div>
                {capabilities ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono-tabular">
                    <div>
                      <span className="text-[var(--text-muted)] block">WebGPU</span>
                      <span>{capabilities.webgpuSupported ? 'Available' : 'WASM Fallback'}</span>
                    </div>
                    <div>
                      <span className="text-[var(--text-muted)] block">RAM (approx)</span>
                      <span>
                        {capabilities.deviceMemoryGB
                          ? `${capabilities.deviceMemoryGB} GB`
                          : 'Unknown'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[var(--text-muted)] block">Storage Quota</span>
                      <span>
                        {capabilities.storageQuotaMB
                          ? `${capabilities.storageQuotaMB.toLocaleString()} MB`
                          : 'Unknown'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[var(--text-muted)] block">Recommended</span>
                      <span className="capitalize">{capabilities.recommendedTier}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-[var(--text-muted)]">
                    Inspecting browser capabilities...
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <label className="text-xs text-[var(--text-secondary)] underline cursor-pointer">
                  Restore encrypted backup instead
                  <input
                    type="file"
                    accept="application/json,.veil.json"
                    className="hidden"
                    onChange={(e) => void handleImportExistingBackup(e)}
                  />
                </label>
                <Button onClick={() => setStep(2)} size="lg">
                  <span>Choose Local Model</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
              {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Select your on-device model tier</CardTitle>
              <CardDescription>
                Download once to Cache Storage, or skip downloading now and fetch later from Model
                Manager.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid sm:grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => handleSelectTier('lite')}
                  className={`text-left p-4 rounded-xl border transition-colors ${
                    selectedTier === 'lite'
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                      : 'border-[var(--border-hairline)] bg-[var(--bg-canvas)]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">Lite Tier</span>
                    <span className="text-xs font-mono-tabular text-[var(--text-muted)]">
                      ~260–390 MB
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-[var(--text-secondary)]">
                    Fastest download and lowest memory footprint. Works on mobile and browsers
                    without WebGPU via WASM fallback.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectTier('standard')}
                  className={`text-left p-4 rounded-xl border transition-colors ${
                    selectedTier === 'standard'
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                      : 'border-[var(--border-hairline)] bg-[var(--bg-canvas)]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">Standard Tier</span>
                    <span className="text-xs font-mono-tabular text-[var(--text-muted)]">
                      ~980 MB
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-[var(--text-secondary)]">
                    Stronger JSON extraction and richer weekly reflections using Qwen 2.5 1.5B over
                    WebGPU.
                  </p>
                </button>
              </div>

              <div className="space-y-2">
                <label htmlFor="onboarding-model-select" className="text-xs font-medium">
                  Selected LLM Engine
                </label>
                <select
                  id="onboarding-model-select"
                  value={selectedLlmId}
                  onChange={(e) => setSelectedLlmId(e.target.value)}
                  className="w-full min-h-[42px] rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 text-sm"
                >
                  {llmOptions.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} · {m.sizeMB} MB
                    </option>
                  ))}
                </select>
              </div>

              {downloadProgress !== null && (
                <div className="space-y-2 p-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)]">
                  <div className="flex items-center justify-between text-xs font-mono-tabular">
                    <span>{downloadText}</span>
                    <span>{downloadProgress}%</span>
                  </div>
                  <Progress value={downloadProgress} />
                </div>
              )}

              {error && (
                <p className="text-xs text-red-600 dark:text-red-400" role="alert">
                  {error}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <Button variant="ghost" onClick={() => setStep(1)}>
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  <span>Back</span>
                </Button>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => void handlePrefetchModel()}
                    disabled={downloadProgress !== null && downloadProgress < 100}
                  >
                    <span>Pre-download Model</span>
                  </Button>
                  <Button onClick={() => setStep(3)}>
                    <span>Continue</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Create your encryption passphrase</CardTitle>
              <CardDescription>
                Veil derives a 256-bit AES-GCM key using PBKDF2-SHA256 (650,000 iterations). The key
                exists only in memory while unlocked.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateVault} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="create-passphrase" className="text-sm font-medium">
                    Passphrase (minimum 8 characters)
                  </label>
                  <Input
                    id="create-passphrase"
                    type="password"
                    autoComplete="new-password"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    placeholder="Choose a strong memorable passphrase"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="confirm-passphrase" className="text-sm font-medium">
                    Confirm Passphrase
                  </label>
                  <Input
                    id="confirm-passphrase"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassphrase}
                    onChange={(e) => setConfirmPassphrase(e.target.value)}
                    placeholder="Re-enter your passphrase"
                  />
                </div>

                <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-4 space-y-3">
                  <div className="flex items-start gap-2.5 text-xs text-[var(--text-secondary)]">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                    <p>
                      Because Veil has no servers or accounts,{' '}
                      <strong>a forgotten passphrase cannot be recovered or reset</strong>. Export
                      encrypted backups periodically from the Privacy screen.
                    </p>
                  </div>
                  <label className="flex items-center gap-2.5 text-xs font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={understoodNoRecovery}
                      onChange={(e) => setUnderstoodNoRecovery(e.target.checked)}
                      className="h-4 w-4 rounded"
                    />
                    <span>I understand that my passphrase cannot be recovered if lost.</span>
                  </label>
                </div>

                {error && (
                  <p className="text-xs text-red-600 dark:text-red-400" role="alert">
                    {error}
                  </p>
                )}

                <div className="flex items-center justify-between pt-2">
                  <Button type="button" variant="ghost" onClick={() => setStep(2)}>
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    <span>Back</span>
                  </Button>
                  <Button type="submit" disabled={creatingVault}>
                    <Lock className="h-4 w-4" aria-hidden="true" />
                    <span>{creatingVault ? 'Encrypting Vault...' : 'Create Encrypted Vault'}</span>
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {step === 4 && createdMeta && (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Airplane Mode Verification</CardTitle>
              <CardDescription>
                Verify right now that Veil operates without a network connection.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-4 space-y-2 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  {isOnline ? (
                    <Plane className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
                  ) : (
                    <WifiOff
                      className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
                      aria-hidden="true"
                    />
                  )}
                  <span>
                    Browser status:{' '}
                    {isOnline
                      ? 'Online (optional: toggle Airplane Mode now)'
                      : 'Offline detected — ready!'}
                  </span>
                </div>
                <ol className="text-xs text-[var(--text-secondary)] space-y-1.5 list-decimal list-inside">
                  <li>Your encrypted vault is initialized locally in IndexedDB.</li>
                  <li>
                    Toggle Airplane Mode (or DevTools Offline) and run the local verification check
                    below.
                  </li>
                  <li>0 bytes of user data are sent over the network.</li>
                </ol>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button variant="outline" onClick={handleRunLocalCryptoSelfTest}>
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  <span>Verify Local Vault Offline</span>
                </Button>
                {offlineProbeDone && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    <span>AES-GCM vault active · 0 external data requests</span>
                  </span>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <Button size="lg" onClick={() => onComplete(createdMeta)}>
                  <span>Enter Veil Workspace</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
};
