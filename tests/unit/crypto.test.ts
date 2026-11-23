import { beforeEach, describe, expect, it } from 'vitest';
import { decryptJson, decryptString, encryptJson, encryptString } from '@/src/core/crypto/aes';
import {
  DEFAULT_PBKDF2_ITERATIONS,
  deriveKeyFromPassphrase,
  generateSalt,
  MIN_PBKDF2_ITERATIONS,
} from '@/src/core/crypto/kdf';
import {
  getActiveVaultKey,
  initializeVault,
  lockVaultMemory,
  unlockVaultWithPassphrase,
} from '@/src/core/crypto/vaultManager';
import {
  deleteEverything,
  exportEncryptedBackup,
  importEncryptedBackup,
  listJournalEntries,
  saveJournalEntry,
} from '@/src/core/db/encryptedStore';
import { veilDb } from '@/src/core/db/veilDb';
import type { JournalEntry } from '@/src/types/journal';

describe('Veil Encryption & Key Derivation', () => {
  beforeEach(async () => {
    lockVaultMemory();
    await deleteEverything();
  });

  it('enforces >= 600,000 PBKDF2 iterations and derives non-extractable AES-GCM keys', async () => {
    const salt = generateSalt(16);
    await expect(deriveKeyFromPassphrase('short-pass', salt, 100_000)).rejects.toThrow(
      String(MIN_PBKDF2_ITERATIONS),
    );

    const key = await deriveKeyFromPassphrase(
      'veil-secure-passphrase',
      salt,
      DEFAULT_PBKDF2_ITERATIONS,
      false,
    );
    expect(key.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 });
    expect(key.extractable).toBe(false);
  });

  it('encrypts and decrypts strings and JSON with unique IVs', async () => {
    const salt = generateSalt(16);
    const key = await deriveKeyFromPassphrase('correct-horse-battery', salt, 600_000);

    const enc1 = await encryptString('Sensitive journal thought', key);
    const enc2 = await encryptString('Sensitive journal thought', key);

    expect(enc1.iv).not.toBe(enc2.iv);
    expect(enc1.ciphertext).not.toBe(enc2.ciphertext);
    expect(await decryptString(enc1, key)).toBe('Sensitive journal thought');

    const obj = { mood: 'calm', score: 0.91 };
    const encJson = await encryptJson(obj, key);
    expect(await decryptJson<typeof obj>(encJson, key)).toEqual(obj);
  });

  it('fails decryption with an incorrect passphrase and clears key on lock', async () => {
    await initializeVault({
      passphrase: 'alpha-vault-passphrase',
      selectedTier: 'lite',
      selectedLlmId: 'SmolLM2-360M-Instruct-q4f16_1-MLC',
      iterations: 600_000,
    });

    expect(getActiveVaultKey()).not.toBeNull();
    lockVaultMemory();
    expect(getActiveVaultKey()).toBeNull();

    await expect(unlockVaultWithPassphrase('wrong-passphrase')).rejects.toThrow(
      /Incorrect passphrase/i,
    );

    const meta = await unlockVaultWithPassphrase('alpha-vault-passphrase');
    expect(meta.selectedTier).toBe('lite');
    expect(getActiveVaultKey()).not.toBeNull();
  });

  it('stores encrypted records in Dexie and roundtrips encrypted backup export/import', async () => {
    await initializeVault({
      passphrase: 'backup-roundtrip-pass',
      selectedTier: 'lite',
      selectedLlmId: 'SmolLM2-360M-Instruct-q4f16_1-MLC',
      iterations: 600_000,
    });
    const key = getActiveVaultKey()!;

    const entry: JournalEntry = {
      id: 'entry-1',
      title: 'Private Note',
      content: 'My secret reflection text',
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
      dateKey: '2026-11-22',
      tags: ['focus'],
      detectedMoods: [{ label: 'calm', score: 0.88 }],
      primaryMood: 'calm',
      moodOverridden: false,
    };

    await saveJournalEntry(entry, key);

    // Raw Dexie row must not contain plaintext
    const rawRow = await veilDb.journal.get('entry-1');
    expect(JSON.stringify(rawRow)).not.toContain('My secret reflection text');

    const backup = await exportEncryptedBackup();
    expect(backup.journal).toHaveLength(1);

    await deleteEverything();
    expect(await veilDb.journal.count()).toBe(0);

    await importEncryptedBackup(backup);
    await unlockVaultWithPassphrase('backup-roundtrip-pass');
    const restored = await listJournalEntries(getActiveVaultKey()!);
    expect(restored).toHaveLength(1);
    expect(restored[0]?.content).toBe('My secret reflection text');
  });
});
