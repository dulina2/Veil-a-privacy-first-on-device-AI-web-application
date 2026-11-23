import * as chrono from 'chrono-node';
import { createEvents, type EventAttributes } from 'ics';
import type { DocumentSummaryData, ExtractedDateItem } from '@/src/types/scanner';

export function inferDateLabelFromContext(text: string, startOffset: number): string {
  const lineStart = text.lastIndexOf('\n', Math.max(0, startOffset - 1)) + 1;
  const lineEndIdx = text.indexOf('\n', startOffset);
  const lineEnd = lineEndIdx === -1 ? text.length : lineEndIdx;
  const windowStart = Math.max(lineStart, startOffset - 70);
  const windowEnd = Math.min(lineEnd, startOffset + 45);
  const snippet = text.slice(windowStart, windowEnd).toLowerCase();

  if (/payment due|due date|pay by|remit|balance due/.test(snippet)) return 'Payment due';
  if (/notice|termination|cancel|opt-out/.test(snippet)) return 'Notice deadline';
  if (/contract end|expir|valid until|term ends|end date/.test(snippet)) return 'Contract end';
  if (/renew|renewal/.test(snippet)) return 'Renewal date';
  if (/invoice date|issued|dated/.test(snippet)) return 'Document date';
  if (/start date|effective|commence/.test(snippet)) return 'Effective date';
  return 'Key date';
}

export function extractDatesWithChrono(
  text: string,
  referenceDate: Date = new Date(),
): ExtractedDateItem[] {
  if (!text.trim()) return [];
  const parsed = chrono.parse(text, referenceDate);

  return parsed.map((match, idx) => {
    const dt = match.start.date();
    const year = dt.getFullYear();
    const month = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');

    return {
      id: `date-${idx}-${match.index}`,
      rawText: match.text,
      isoDate: `${year}-${month}-${day}`,
      label: inferDateLabelFromContext(text, match.index),
      confirmed: false,
      startOffset: match.index,
      endOffset: match.index + match.text.length,
    };
  });
}

export function parseAndValidateSummaryJson(rawOutput: string): DocumentSummaryData | null {
  const trimmed = rawOutput.trim();
  const jsonStart = trimmed.indexOf('{');
  const jsonEnd = trimmed.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1));
    if (typeof parsed !== 'object' || parsed === null) return null;

    const record = parsed as Record<string, unknown>;
    if (typeof record.plainSummary !== 'string' || record.plainSummary.trim().length === 0) {
      return null;
    }

    const toStringArray = (val: unknown): string[] => {
      if (!Array.isArray(val)) return [];
      return val.filter(
        (item): item is string => typeof item === 'string' && item.trim().length > 0,
      );
    };

    return {
      plainSummary: record.plainSummary.trim(),
      parties: toStringArray(record.parties),
      amounts: toStringArray(record.amounts),
      obligations: toStringArray(record.obligations),
    };
  } catch {
    return null;
  }
}

export function deterministicSummaryFallback(text: string): DocumentSummaryData {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const amounts = Array.from(
    new Set(text.match(/(?:\$|USD|EUR|GBP)\s?\d[\d,]*(?:\.\d{2})?/g) ?? []),
  ).slice(0, 8);

  const parties = lines
    .filter((l) => /(?:client|provider|vendor|company|llc|inc\.|corp\.|between|party)/i.test(l))
    .slice(0, 5);

  const obligations = lines
    .filter((l) => /(?:agree|shall|must|deliver|remit|notice|obligation|required|due)/i.test(l))
    .slice(0, 6);

  return {
    plainSummary:
      lines.slice(0, 3).join(' ') ||
      'No readable text blocks detected. Review OCR text above before saving.',
    parties,
    amounts,
    obligations,
  };
}

export function mergeLlmDateLabels(
  dates: ExtractedDateItem[],
  llmJsonRaw: string,
): ExtractedDateItem[] {
  const start = llmJsonRaw.indexOf('[');
  const end = llmJsonRaw.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) {
    return dates;
  }

  try {
    const parsed: unknown = JSON.parse(llmJsonRaw.slice(start, end + 1));
    if (!Array.isArray(parsed)) return dates;

    const labelByRaw = new Map<string, string>();
    for (const item of parsed) {
      if (
        typeof item === 'object' &&
        item !== null &&
        'rawText' in item &&
        'label' in item &&
        typeof item.rawText === 'string' &&
        typeof item.label === 'string' &&
        item.label.trim().length > 0
      ) {
        labelByRaw.set(item.rawText.trim().toLowerCase(), item.label.trim());
      }
    }

    return dates.map((d) => {
      const matchedLabel = labelByRaw.get(d.rawText.trim().toLowerCase());
      return matchedLabel ? { ...d, label: matchedLabel } : d;
    });
  } catch {
    return dates;
  }
}

export function buildIcsFromConfirmedDates(
  documentTitle: string,
  dates: ExtractedDateItem[],
): string {
  const confirmed = dates.filter((d) => d.confirmed);
  if (confirmed.length === 0) {
    throw new Error('Confirm at least one date before exporting to .ics.');
  }

  const events: EventAttributes[] = confirmed.map((d) => {
    const [yStr, mStr, dayStr] = d.isoDate.split('-');
    const year = Number(yStr) || new Date().getFullYear();
    const month = Number(mStr) || 1;
    const day = Number(dayStr) || 1;

    return {
      start: [year, month, day],
      duration: { days: 1 },
      title: `${d.label}: ${documentTitle}`,
      description: `Extracted from "${d.rawText}" in Veil Smart Document Scanner.`,
      status: 'CONFIRMED',
    };
  });

  const { error, value } = createEvents(events, {
    calName: 'Veil Scanned Dates',
    productId: 'veil-on-device-scanner',
  });

  if (error || !value) {
    throw error ?? new Error('Failed to generate .ics calendar file.');
  }
  return value;
}
