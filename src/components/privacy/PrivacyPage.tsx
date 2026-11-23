import {
  AlertTriangle,
  CheckCircle2,
  Download,
  KeyRound,
  Plane,
  ShieldCheck,
  Trash2,
  Upload,
  WifiOff,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/src/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/card';
import { Switch } from '@/src/components/ui/progress';
import { networkMonitor, type NetworkTelemetrySnapshot } from '@/src/core/ai/networkMonitor';
import { isWebAuthnSupported } from '@/src/core/crypto/kdf';
import { enablePasskeyQuickUnlock, updateVaultMeta } from '@/src/core/crypto/vaultManager';
import {
  deleteEverything,
  exportEncryptedBackup,
  importEncryptedBackup,
} from '@/src/core/db/encryptedStore';
import { useOnlineStatus } from '@/src/core/pwa/useOnlineStatus';
import type { VaultMetaRecord, VeilBackupFile } from '@/src/types/vault';

interface PrivacyPageProps {
  meta: VaultMetaRecord;
  onMetaUpdated: (meta: VaultMetaRecord) => void;
  onVaultWiped: () => void;
}

export const PrivacyPage: React.FC<PrivacyPageProps> = ({ meta, onMetaUpdated, onVaultWiped }) => {
  const [telemetry, setTelemetry] = useState<NetworkTelemetrySnapshot>(() =>
    networkMonitor.getSnapshot(),
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [airplaneStep, setAirplaneStep] = useState<number>(0);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const isOnline = useOnlineStatus();

  useEffect(() => {
    return networkMonitor.subscribe(setTelemetry);
  }, []);

  const handleToggleAirGapLock = async (checked: boolean) => {
    networkMonitor.setAirGapLock(checked);
    const updated = await updateVaultMeta({ airGapLockEnabled: checked });
    onMetaUpdated(updated);
    setStatusMessage(
      checked
        ? "Runtime Air-Gap Lock enabled: all outbound non-'self' fetch requests are blocked."
        : 'Runtime Air-Gap Lock disabled so model downloads can proceed.',
    );
  };

  const handleAutoLockChange = async (minutes: number) => {
    const updated = await updateVaultMeta({ autoLockMinutes: minutes });
    onMetaUpdated(updated);
    setStatusMessage(`Auto-lock timeout updated to ${minutes} minutes.`);
  };

  const handleEnablePasskey = async () => {
    setError(null);
    setStatusMessage(null);
    try {
      const updated = await enablePasskeyQuickUnlock();
      onMetaUpdated(updated);
      setStatusMessage('Device passkey quick unlock enabled for this session.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to register passkey.');
    }
  };

  const handleExportBackup = async () => {
    setError(null);
    try {
      const backup = await exportEncryptedBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `veil-encrypted-backup-${new Date().toISOString().slice(0, 10)}.veil.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStatusMessage(
        `Exported ${backup.journal.length} journal entries and ${backup.documents.length} scanned documents (AES-GCM encrypted).`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.');
    }
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const parsed = JSON.parse(await file.text()) as VeilBackupFile;
      await importEncryptedBackup(parsed);
      setStatusMessage('Encrypted backup imported. Reloading to re-verify vault passphrase...');
      window.setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid encrypted backup file.');
    }
  };

  const handleDeleteEverything = async () => {
    await deleteEverything();
    onVaultWiped();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Privacy & Vault Security</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Verify zero outbound data transmission, test offline Airplane Mode, and manage encrypted
          backups.
        </p>
      </div>

      {/* Live Network Indicator */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <span className="font-mono-tabular">
              {telemetry.userDataRequests} network requests with your data
            </span>
          </CardTitle>
          <CardDescription>
            Live session request monitor. Your journal entries, OCR text, and keys never touch the
            network.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-xs text-[var(--text-muted)] block">User Data Requests</span>
              <span className="text-lg font-semibold font-mono-tabular">
                {telemetry.userDataRequests}
              </span>
            </div>
            <div>
              <span className="text-xs text-[var(--text-muted)] block">Model Downloads</span>
              <span className="text-lg font-semibold font-mono-tabular">
                {telemetry.modelDownloadRequests}
              </span>
            </div>
            <div>
              <span className="text-xs text-[var(--text-muted)] block">Same-Origin Loads</span>
              <span className="text-lg font-semibold font-mono-tabular">
                {telemetry.sameOriginRequests}
              </span>
            </div>
            <div>
              <span className="text-xs text-[var(--text-muted)] block">Blocked by Air-Gap</span>
              <span className="text-lg font-semibold font-mono-tabular">
                {telemetry.blockedRequests}
              </span>
            </div>
          </div>

          <div className="pt-3 border-t border-[var(--border-hairline)] flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">
                Strict Offline Air-Gap Lock (`connect-src &apos;none&apos;`)
              </p>
              <p className="text-xs text-[var(--text-secondary)]">
                Once your models are cached, enable this to block all outbound non-origin network
                requests at runtime.
              </p>
            </div>
            <Switch
              checked={meta.airGapLockEnabled}
              onCheckedChange={(checked) => void handleToggleAirGapLock(checked)}
              aria-label="Enable strict offline Air-Gap Lock"
            />
          </div>
        </CardContent>
      </Card>

      {/* Airplane Mode Walkthrough */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plane className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
            <span>Airplane Mode Test Walkthrough</span>
          </CardTitle>
          <CardDescription>
            Confirm with your own eyes that Veil works completely offline.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="space-y-2.5 text-sm text-[var(--text-secondary)] list-decimal list-inside">
            <li>Download your preferred Lite or Standard model in the Models tab.</li>
            <li>
              Turn on Airplane Mode on your device (or check &ldquo;Offline&rdquo; in Browser
              DevTools Network tab).
            </li>
            <li>Write a journal entry or run OCR on a document image while disconnected.</li>
          </ol>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => setAirplaneStep((prev) => prev + 1)}>
              {isOnline ? (
                <Plane className="h-4 w-4" aria-hidden="true" />
              ) : (
                <WifiOff className="h-4 w-4" aria-hidden="true" />
              )}
              <span>Check Connectivity Status</span>
            </Button>
            {airplaneStep > 0 && (
              <span className="text-xs font-medium flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span>
                  {isOnline
                    ? 'Online (toggle OS Airplane Mode to see live offline switch)'
                    : 'Offline Mode confirmed — 0 outbound connections possible'}
                </span>
              </span>
            )}
          </div>

          <div className="p-3 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-hairline)] space-y-1">
            <p className="text-xs font-medium">
              Hardened Post-Cache CSP Header (`connect-src &apos;none&apos;`)
            </p>
            <code className="text-[11px] font-mono-tabular block break-all text-[var(--text-secondary)]">
              default-src &apos;self&apos;; script-src &apos;self&apos;
              &apos;wasm-unsafe-eval&apos;; style-src &apos;self&apos; &apos;unsafe-inline&apos;;
              img-src &apos;self&apos; data: blob:; font-src &apos;self&apos; data:; worker-src
              &apos;self&apos; blob:; connect-src &apos;none&apos;;
            </code>
          </div>
        </CardContent>
      </Card>

      {/* Vault Security, Passkey & Backups */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Session & Passkey Controls</CardTitle>
            <CardDescription>Auto-lock clears your AES-GCM key from RAM.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="autolock-select" className="text-xs font-medium">
                Auto-lock after inactivity
              </label>
              <select
                id="autolock-select"
                value={meta.autoLockMinutes}
                onChange={(e) => void handleAutoLockChange(Number(e.target.value))}
                className="w-full min-h-[40px] rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 text-sm"
              >
                <option value={5}>5 minutes</option>
                <option value={10}>10 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={0}>Never auto-lock while tab open</option>
              </select>
            </div>

            {isWebAuthnSupported() && (
              <Button variant="outline" size="sm" onClick={() => void handleEnablePasskey()}>
                <KeyRound className="h-4 w-4" aria-hidden="true" />
                <span>
                  {meta.passkeyCredentialId
                    ? 'Re-register Device Passkey'
                    : 'Enable Passkey Unlock'}
                </span>
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Encrypted Backup & Wipe</CardTitle>
            <CardDescription>
              Exports contain only AES-GCM ciphertext; your passphrase is required to restore.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => void handleExportBackup()}>
                <Download className="h-4 w-4" aria-hidden="true" />
                <span>Export Encrypted Backup</span>
              </Button>

              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.veil.json"
                className="hidden"
                onChange={(e) => void handleImportBackup(e)}
              />
              <Button variant="outline" size="sm" onClick={() => importInputRef.current?.click()}>
                <Upload className="h-4 w-4" aria-hidden="true" />
                <span>Import Backup</span>
              </Button>
            </div>

            <div className="pt-3 border-t border-[var(--border-hairline)]">
              {!confirmWipe ? (
                <Button variant="destructive" size="sm" onClick={() => setConfirmWipe(true)}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  <span>Delete Everything</span>
                </Button>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-red-700 dark:text-red-300 flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>This permanently erases IndexedDB records and cached models.</span>
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => void handleDeleteEverything()}
                    >
                      Confirm Erase All
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmWipe(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {statusMessage && (
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-4 text-sm">
          {statusMessage}
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-800 dark:text-red-200"
        >
          {error}
        </div>
      )}
    </div>
  );
};
