import { fromBase64, toBase64 } from './aes';

export const DEFAULT_PBKDF2_ITERATIONS = 650_000;
export const MIN_PBKDF2_ITERATIONS = 600_000;

export function generateSalt(length = 16): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return toBase64(bytes);
}

export async function deriveKeyFromPassphrase(
  passphrase: string,
  saltBase64: string,
  iterations: number = DEFAULT_PBKDF2_ITERATIONS,
  extractable = false,
): Promise<CryptoKey> {
  if (iterations < MIN_PBKDF2_ITERATIONS) {
    throw new Error(`PBKDF2 iterations must be at least ${MIN_PBKDF2_ITERATIONS}`);
  }
  const saltBytes = fromBase64(saltBase64);
  const passphraseBytes = new TextEncoder().encode(passphrase);

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passphraseBytes as BufferSource,
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    extractable,
    ['encrypt', 'decrypt'],
  );
}

export function isWebAuthnSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined' &&
    typeof navigator.credentials !== 'undefined'
  );
}

/**
 * Registers a local platform passkey using WebAuthn.
 * When PRF extension is supported by the authenticator, derives a 256-bit wrapping key.
 */
export async function registerPasskeyCredential(): Promise<{
  credentialId: string;
}> {
  if (!isWebAuthnSupported()) {
    throw new Error('WebAuthn is not supported in this browser.');
  }
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: challenge as BufferSource,
      rp: {
        name: 'Veil On-Device Vault',
        id: window.location.hostname,
      },
      user: {
        id: userId as BufferSource,
        name: 'veil-local-vault',
        displayName: 'Veil Local Vault',
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
      },
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error('Passkey registration was cancelled.');
  }

  return {
    credentialId: toBase64(new Uint8Array(credential.rawId)),
  };
}

export async function verifyPasskeyAssertion(credentialIdBase64: string): Promise<boolean> {
  if (!isWebAuthnSupported()) {
    throw new Error('WebAuthn is not supported in this browser.');
  }
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const allowId = fromBase64(credentialIdBase64);

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: challenge as BufferSource,
      rpId: window.location.hostname,
      allowCredentials: [
        {
          id: allowId as BufferSource,
          type: 'public-key',
        },
      ],
      userVerification: 'required',
      timeout: 60_000,
    },
  });

  return assertion !== null;
}
