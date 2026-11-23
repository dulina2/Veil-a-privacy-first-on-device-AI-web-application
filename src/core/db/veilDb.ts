import Dexie, { type Table } from 'dexie';
import type {
  EncryptedDocumentRecord,
  EncryptedEmbeddingRecord,
  EncryptedJournalRecord,
  EncryptedPayload,
  VaultMetaRecord,
} from '@/src/types/vault';

export interface EncryptedReflectionRecord {
  id: string;
  generatedAt: number;
  payload: EncryptedPayload;
}

export class VeilDatabase extends Dexie {
  meta!: Table<VaultMetaRecord, string>;
  journal!: Table<EncryptedJournalRecord, string>;
  documents!: Table<EncryptedDocumentRecord, string>;
  embeddings!: Table<EncryptedEmbeddingRecord, string>;
  reflections!: Table<EncryptedReflectionRecord, string>;

  constructor() {
    super('veil-encrypted-vault');
    this.version(1).stores({
      meta: 'id',
      journal: 'id, dateKey, createdAt, updatedAt',
      documents: 'id, createdAt, updatedAt',
      embeddings: 'id, kind, updatedAt',
      reflections: 'id, generatedAt',
    });
  }
}

export const veilDb = new VeilDatabase();
