import { AlertTriangle, KeyRound, Lock, ShieldCheck, Upload } from 'lucide-react';
import React, { useRef, useState } from 'react';
import { Button } from '@/src/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/card';
import { Input } from '@/src/components/ui/input';
import {
  unlockVaultWithPassphrase,
  unlockWithPasskeyIfAvailable,
} from '@/src/core/crypto/vaultManager';
import { importEncryptedBackup } from '@/src/core/db/encryptedStore';
import type { VaultMetaRecord, VeilBackupFile } from '@/src/types/vault';

interface LockScreenProps {
  meta: VaultMetaRecord;
  onUnlocked: (meta: VaultMetaRecord) => void;
}

export const LockScreen: React.FC<LockScreenProps> = ({ meta, onUnlocked }) => {
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passphrase.trim()) {
      setError('Enter your vault passphrase.');
      return;
    }
    setError(null);
    setUnlocking(true);
    try {
      const unlockedMeta = await unlockVaultWithPassphrase(passphrase);
      setPassphrase('');
      onUnlocked(unlockedMeta);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to unlock vault.');
    } finally {
      setUnlocking(false);
    }
  };

  const handlePasskeyUnlock = async () => {
    setError(null);
    setUnlocking(true);
    try {
      const result = await unlockWithPasskeyIfAvailable();
      if (result.unlocked) {
        onUnlocked(meta);
      } else {
        setStatusMessage(
          'Passkey verified. Enter your passphrase once after a fresh browser session to re-derive your in-memory AES key.',
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Passkey verification failed.');
    } finally {
      setUnlocking(false);
    }
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as VeilBackupFile;
      await importEncryptedBackup(parsed);
      setStatusMessage('Encrypted backup restored. Unlock using that backup’s passphrase.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import encrypted backup.');
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-[var(--bg-canvas)]">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto h-12 w-12 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] flex items-center justify-center">
            <Lock className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Veil Vault Locked</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Your encryption key stays strictly in memory and is cleared whenever you lock or close
            this tab.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Unlock with passphrase</CardTitle>
            <CardDescription>
              PBKDF2-SHA256 ({meta.iterations.toLocaleString()} iterations) · AES-256-GCM
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleUnlock} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="unlock-passphrase" className="text-sm font-medium">
                  Vault Passphrase
                </label>
                <Input
                  id="unlock-passphrase"
                  type="password"
                  autoComplete="current-password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder="Enter your passphrase"
                  autoFocus
                />
              </div>

              {error && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-3 text-xs text-red-800 dark:text-red-200 flex items-start gap-2"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              {statusMessage && (
                <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3 text-xs text-[var(--text-secondary)]">
                  {statusMessage}
                </div>
              )}

              <Button type="submit" className="w-full" size="lg" disabled={unlocking}>
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                <span>{unlocking ? 'Deriving Key...' : 'Unlock Vault'}</span>
              </Button>
            </form>

            {meta.passkeyCredentialId && (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => void handlePasskeyUnlock()}
                disabled={unlocking}
              >
                <KeyRound className="h-4 w-4" aria-hidden="true" />
                <span>Unlock with Device Passkey</span>
              </Button>
            )}

            <div className="pt-2 border-t border-[var(--border-hairline)] space-y-3">
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                Zero-knowledge notice: Veil never transmits or stores your passphrase. If you forget
                your passphrase, encrypted records cannot be recovered.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.veil.json"
                className="hidden"
                onChange={(e) => void handleImportBackup(e)}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4" aria-hidden="true" />
                <span>Restore from Encrypted Backup</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
};
