/**
 * Purely transient, local-only distress check.
 * Never logs, persists, transmits, or flags anything anywhere.
 */
const DISTRESS_PHRASES = [
  'want to die',
  'end my life',
  'kill myself',
  'no reason to live',
  'hurt myself',
  'self harm',
  'self-harm',
  "can't go on",
  'better off without me',
  'suicidal',
  'hopeless and empty',
];

export function checkTransientDistress(text: string): boolean {
  const normalized = text.toLowerCase().trim();
  if (!normalized) return false;
  return DISTRESS_PHRASES.some((phrase) => normalized.includes(phrase));
}
