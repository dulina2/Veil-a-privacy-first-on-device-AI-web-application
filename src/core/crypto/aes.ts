import type { EncryptedPayload } from '@/src/types/vault';

const PAYLOAD_VERSION = 1;

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

export function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function encryptString(plaintext: string, key: CryptoKey): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    encoded as BufferSource,
  );
  return {
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(encryptedBuffer)),
    version: PAYLOAD_VERSION,
  };
}

export async function decryptString(payload: EncryptedPayload, key: CryptoKey): Promise<string> {
  const iv = fromBase64(payload.iv);
  const ciphertext = fromBase64(payload.ciphertext);
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    ciphertext as BufferSource,
  );
  return new TextDecoder().decode(decryptedBuffer);
}

export async function encryptJson<T>(data: T, key: CryptoKey): Promise<EncryptedPayload> {
  return encryptString(JSON.stringify(data), key);
}

export async function decryptJson<T>(payload: EncryptedPayload, key: CryptoKey): Promise<T> {
  const json = await decryptString(payload, key);
  return JSON.parse(json) as T;
}
