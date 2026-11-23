import { decryptJson, encryptJson } from '@/src/core/crypto/aes';
import type { JournalEntry, WeeklyReflectionRecord } from '@/src/types/journal';
import type { ScannedDocument } from '@/src/types/scanner';
import type { VeilBackupFile } from '@/src/types/vault';
import { veilDb } from './veilDb';

export interface EmbeddingRecord {
  id: string;
  kind: 'journal' | 'document';
  vector: number[];
  updatedAt: number;
}

export async function saveJournalEntry(entry: JournalEntry, key: CryptoKey): Promise<void> {
  const payload = await encryptJson(entry, key);
  await veilDb.journal.put({
    id: entry.id,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    dateKey: entry.dateKey,
    payload,
  });
}

export async function listJournalEntries(key: CryptoKey): Promise<JournalEntry[]> {
  const rows = await veilDb.journal.orderBy('createdAt').reverse().toArray();
  const decrypted = await Promise.all(
    rows.map(async (row) => decryptJson<JournalEntry>(row.payload, key)),
  );
  return decrypted;
}

export async function deleteJournalEntry(id: string): Promise<void> {
  await veilDb.transaction('rw', veilDb.journal, veilDb.embeddings, async () => {
    await veilDb.journal.delete(id);
    await veilDb.embeddings.delete(id);
  });
}

export async function saveScannedDocument(doc: ScannedDocument, key: CryptoKey): Promise<void> {
  const payload = await encryptJson(doc, key);
  await veilDb.documents.put({
    id: doc.id,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    payload,
  });
}

export async function listScannedDocuments(key: CryptoKey): Promise<ScannedDocument[]> {
  const rows = await veilDb.documents.orderBy('createdAt').reverse().toArray();
  return Promise.all(rows.map(async (row) => decryptJson<ScannedDocument>(row.payload, key)));
}

export async function deleteScannedDocument(id: string): Promise<void> {
  await veilDb.transaction('rw', veilDb.documents, veilDb.embeddings, async () => {
    await veilDb.documents.delete(id);
    await veilDb.embeddings.delete(id);
  });
}

export async function saveEmbedding(
  id: string,
  kind: 'journal' | 'document',
  vector: number[],
  key: CryptoKey,
): Promise<void> {
  const updatedAt = Date.now();
  const payload = await encryptJson({ vector }, key);
  await veilDb.embeddings.put({
    id,
    kind,
    updatedAt,
    payload,
  });
}

export async function listEmbeddings(
  kind: 'journal' | 'document',
  key: CryptoKey,
): Promise<EmbeddingRecord[]> {
  const rows = await veilDb.embeddings.where('kind').equals(kind).toArray();
  return Promise.all(
    rows.map(async (row) => {
      const data = await decryptJson<{ vector: number[] }>(row.payload, key);
      return {
        id: row.id,
        kind: row.kind,
        vector: data.vector,
        updatedAt: row.updatedAt,
      };
    }),
  );
}

export async function saveWeeklyReflection(
  reflection: WeeklyReflectionRecord,
  key: CryptoKey,
): Promise<void> {
  const payload = await encryptJson(reflection, key);
  await veilDb.reflections.put({
    id: reflection.id,
    generatedAt: reflection.generatedAt,
    payload,
  });
}

export async function listWeeklyReflections(key: CryptoKey): Promise<WeeklyReflectionRecord[]> {
  const rows = await veilDb.reflections.orderBy('generatedAt').reverse().toArray();
  return Promise.all(
    rows.map(async (row) => decryptJson<WeeklyReflectionRecord>(row.payload, key)),
  );
}

export async function exportEncryptedBackup(): Promise<VeilBackupFile> {
  const meta = await veilDb.meta.get('vault-config');
  if (!meta) {
    throw new Error('No vault configuration found to export.');
  }
  const [journal, documents, embeddings] = await Promise.all([
    veilDb.journal.toArray(),
    veilDb.documents.toArray(),
    veilDb.embeddings.toArray(),
  ]);

  return {
    format: 'veil-encrypted-backup',
    schemaVersion: 1,
    exportedAt: Date.now(),
    vaultConfig: meta,
    journal,
    documents,
    embeddings,
  };
}

export async function importEncryptedBackup(backup: VeilBackupFile): Promise<void> {
  if (
    backup.format !== 'veil-encrypted-backup' ||
    !backup.vaultConfig ||
    !Array.isArray(backup.journal) ||
    !Array.isArray(backup.documents)
  ) {
    throw new Error('Invalid Veil encrypted backup file.');
  }

  await veilDb.transaction(
    'rw',
    veilDb.meta,
    veilDb.journal,
    veilDb.documents,
    veilDb.embeddings,
    async () => {
      await veilDb.meta.clear();
      await veilDb.journal.clear();
      await veilDb.documents.clear();
      await veilDb.embeddings.clear();

      await veilDb.meta.put(backup.vaultConfig);
      if (backup.journal.length > 0) {
        await veilDb.journal.bulkPut(backup.journal);
      }
      if (backup.documents.length > 0) {
        await veilDb.documents.bulkPut(backup.documents);
      }
      if (Array.isArray(backup.embeddings) && backup.embeddings.length > 0) {
        await veilDb.embeddings.bulkPut(backup.embeddings);
      }
    },
  );
}

export async function deleteEverything(): Promise<void> {
  await veilDb.transaction(
    'rw',
    [veilDb.meta, veilDb.journal, veilDb.documents, veilDb.embeddings, veilDb.reflections],
    async () => {
      await veilDb.meta.clear();
      await veilDb.journal.clear();
      await veilDb.documents.clear();
      await veilDb.embeddings.clear();
      await veilDb.reflections.clear();
    },
  );

  if (typeof caches !== 'undefined') {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((name) => caches.delete(name)));
  }
}
