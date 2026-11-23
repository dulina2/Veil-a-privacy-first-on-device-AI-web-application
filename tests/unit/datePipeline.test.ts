import { describe, expect, it } from 'vitest';
import {
  buildIcsFromConfirmedDates,
  extractDatesWithChrono,
  mergeLlmDateLabels,
  parseAndValidateSummaryJson,
} from '@/src/components/scanner/datePipeline';

describe('Smart Document Scanner Date & Summary Pipeline', () => {
  it('extracts dates deterministically with chrono-node and assigns context labels', () => {
    const sample =
      'Invoice Date: November 10, 2026.\nPayment Due Date: December 15, 2026.\nNotice Deadline: Written notice by February 28, 2027.';
    const extracted = extractDatesWithChrono(sample, new Date('2026-11-01T00:00:00Z'));

    expect(extracted).toHaveLength(3);
    expect(extracted[0]?.isoDate).toBe('2026-11-10');
    expect(extracted[0]?.label).toBe('Document date');
    expect(extracted[1]?.isoDate).toBe('2026-12-15');
    expect(extracted[1]?.label).toBe('Payment due');
    expect(extracted[2]?.isoDate).toBe('2027-02-28');
    expect(extracted[2]?.label).toBe('Notice deadline');
  });

  it('merges valid LLM date labels and ignores malformed LLM JSON', () => {
    const base = extractDatesWithChrono('Contract end on March 31, 2027.');
    const merged = mergeLlmDateLabels(
      base,
      '[{"rawText": "March 31, 2027", "label": "Contract end"}]',
    );
    expect(merged[0]?.label).toBe('Contract end');

    const unchanged = mergeLlmDateLabels(base, 'not-valid-json');
    expect(unchanged).toEqual(base);
  });

  it('validates structured summary JSON and rejects invalid payloads', () => {
    const valid = parseAndValidateSummaryJson(
      'Here is JSON:\n{"plainSummary":"Service agreement for Q4.","parties":["Northwood LLC"],"amounts":["$2,450.00"],"obligations":["Remit by Dec 15"]}',
    );
    expect(valid).toEqual({
      plainSummary: 'Service agreement for Q4.',
      parties: ['Northwood LLC'],
      amounts: ['$2,450.00'],
      obligations: ['Remit by Dec 15'],
    });

    expect(parseAndValidateSummaryJson('{"parties":[]}')).toBeNull();
    expect(parseAndValidateSummaryJson('broken json {')).toBeNull();
  });

  it('generates valid .ics output only from confirmed dates', () => {
    const items = extractDatesWithChrono('Payment due December 15, 2026.');
    expect(() => buildIcsFromConfirmedDates('Invoice #41', items)).toThrow(/Confirm at least one/);

    const confirmed = items.map((d) => ({ ...d, confirmed: true }));
    const ics = buildIcsFromConfirmedDates('Invoice #41', confirmed);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('Payment due: Invoice #41');
    expect(ics).toContain('20261215');
  });
});
