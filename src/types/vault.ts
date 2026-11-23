export interface EncryptedPayload {
  iv: string; // base64 12-byte IV
  ciphertext: string; // base64 AES-256-GCM ciphertext + tag
  version: number;
}

export interface VaultMetaRecord {
  id: 'vault-config';
  salt: string; // base64 16-byte salt
  iterations: number; // >= 600000
  verifier: EncryptedPayload; // Known plaintext encrypted to verify passphrase without storing key
  createdAt: number;
  autoLockMinutes: number;
  passkeyCredentialId?: string;
  passkeyWrappedVerifier?: string;
  selectedTier: 'lite' | 'standard';
  selectedLlmId: string;
  streaksEnabled: boolean;
  onboardingCompleted: boolean;
  airGapLockEnabled: boolean;
}

export interface EncryptedJournalRecord {
  id: string;
  createdAt: number;
  updatedAt: number;
  dateKey: string; // YYYY-MM-DD (non-sensitive index for calendar sorting)
  payload: EncryptedPayload;
}

export interface EncryptedDocumentRecord {
  id: string;
  createdAt: number;
  updatedAt: number;
  payload: EncryptedPayload;
}

export interface EncryptedEmbeddingRecord {
  id: string; // matches entry id
  kind: 'journal' | 'document';
  updatedAt: number;
  payload: EncryptedPayload;
}

export interface VeilBackupFile {
  format: 'veil-encrypted-backup';
  schemaVersion: number;
  exportedAt: number;
  vaultConfig: VaultMetaRecord;
  journal: EncryptedJournalRecord[];
  documents: EncryptedDocumentRecord[];
  embeddings: EncryptedEmbeddingRecord[];
}
