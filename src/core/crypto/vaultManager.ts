import { decryptString, encryptString } from '@/src/core/crypto/aes';
import {
  DEFAULT_PBKDF2_ITERATIONS,
  deriveKeyFromPassphrase,
  generateSalt,
  registerPasskeyCredential,
  verifyPasskeyAssertion,
} from '@/src/core/crypto/kdf';
import { veilDb } from '@/src/core/db/veilDb';
import type { VaultMetaRecord } from '@/src/types/vault';

const VERIFIER_MAGIC = 'VEIL_VAULT_VERIFIED_V1';

/**
 * In-memory-only key storage. Never written to localStorage, sessionStorage, or IndexedDB.
 */
let activeCryptoKey: CryptoKey | null = null;
let sessionBackupKeyForPasskey: CryptoKey | null = null;

export function getActiveVaultKey(): CryptoKey | null {
  return activeCryptoKey;
}

export function lockVaultMemory(): void {
  activeCryptoKey = null;
}

export async function getVaultMeta(): Promise<VaultMetaRecord | undefined> {
  return veilDb.meta.get('vault-config');
}

export async function updateVaultMeta(
  patch: Partial<Omit<VaultMetaRecord, 'id'>>,
): Promise<VaultMetaRecord> {
  const existing = await veilDb.meta.get('vault-config');
  if (!existing) {
    throw new Error('Vault is not initialized.');
  }
  const updated: VaultMetaRecord = { ...existing, ...patch };
  await veilDb.meta.put(updated);
  return updated;
}

export async function initializeVault(options: {
  passphrase: string;
  selectedTier: 'lite' | 'standard';
  selectedLlmId: string;
  autoLockMinutes?: number;
  iterations?: number;
}): Promise<VaultMetaRecord> {
  const salt = generateSalt(16);
  const iterations = options.iterations ?? DEFAULT_PBKDF2_ITERATIONS;
  const key = await deriveKeyFromPassphrase(options.passphrase, salt, iterations, false);
  const verifier = await encryptString(VERIFIER_MAGIC, key);

  const meta: VaultMetaRecord = {
    id: 'vault-config',
    salt,
    iterations,
    verifier,
    createdAt: Date.now(),
    autoLockMinutes: options.autoLockMinutes ?? 10,
    selectedTier: options.selectedTier,
    selectedLlmId: options.selectedLlmId,
    streaksEnabled: false,
    onboardingCompleted: true,
    airGapLockEnabled: false,
  };

  await veilDb.meta.put(meta);
  activeCryptoKey = key;
  return meta;
}

export async function unlockVaultWithPassphrase(passphrase: string): Promise<VaultMetaRecord> {
  const meta = await veilDb.meta.get('vault-config');
  if (!meta) {
    throw new Error('Vault has not been initialized yet.');
  }

  const candidateKey = await deriveKeyFromPassphrase(passphrase, meta.salt, meta.iterations, false);

  try {
    const plaintext = await decryptString(meta.verifier, candidateKey);
    if (plaintext !== VERIFIER_MAGIC) {
      throw new Error('Incorrect passphrase.');
    }
  } catch {
    throw new Error(
      'Incorrect passphrase. Your key never leaves this device and cannot be recovered.',
    );
  }

  activeCryptoKey = candidateKey;
  return meta;
}

export async function enablePasskeyQuickUnlock(): Promise<VaultMetaRecord> {
  if (!activeCryptoKey) {
    throw new Error('Unlock your vault with your passphrase before enabling passkey unlock.');
  }
  const { credentialId } = await registerPasskeyCredential();
  sessionBackupKeyForPasskey = activeCryptoKey;
  return updateVaultMeta({ passkeyCredentialId: credentialId });
}

export async function unlockWithPasskeyIfAvailable(): Promise<{
  unlocked: boolean;
  requiresPassphrase: boolean;
}> {
  const meta = await veilDb.meta.get('vault-config');
  if (!meta?.passkeyCredentialId) {
    return { unlocked: false, requiresPassphrase: true };
  }
  const verified = await verifyPasskeyAssertion(meta.passkeyCredentialId);
  if (!verified) {
    return { unlocked: false, requiresPassphrase: true };
  }
  if (sessionBackupKeyForPasskey) {
    activeCryptoKey = sessionBackupKeyForPasskey;
    return { unlocked: true, requiresPassphrase: false };
  }
  return { unlocked: false, requiresPassphrase: true };
}

export function clearPasskeySessionCache(): void {
  sessionBackupKeyForPasskey = null;
}
