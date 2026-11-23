import { CalendarPlus, CheckSquare, Save, Sparkles } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { Button } from '@/src/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/card';
import { Input } from '@/src/components/ui/input';
import { aiClient } from '@/src/core/ai/aiClient';
import { inspectCachedModelStatus } from '@/src/core/ai/modelCatalog';
import type { ExtractedDateItem } from '@/src/types/scanner';
import {
  buildIcsFromConfirmedDates,
  extractDatesWithChrono,
  mergeLlmDateLabels,
} from './datePipeline';

interface DatesStepProps {
  documentTitle: string;
  sourceText: string;
  croppedImageUrl: string | null;
  selectedLlmId: string;
  dates: ExtractedDateItem[];
  onDatesChange: (dates: ExtractedDateItem[]) => void;
  onSaveDocument: () => Promise<void>;
  saving: boolean;
}

export const DatesStep: React.FC<DatesStepProps> = ({
  documentTitle,
  sourceText,
  croppedImageUrl,
  selectedLlmId,
  dates,
  onDatesChange,
  onSaveDocument,
  saving,
}) => {
  const [extracting, setExtracting] = useState(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExtractDates = async () => {
    setError(null);
    setExtracting(true);
    try {
      const baseDates = extractDatesWithChrono(sourceText);
      onDatesChange(baseDates);

      if (baseDates.length === 0) {
        setStatusNote('No dates found in the text. You can add or edit OCR text if needed.');
        return;
      }

      const cached = await inspectCachedModelStatus();
      if (cached[selectedLlmId] === 'ready') {
        setStatusNote('Labeling extracted dates with local LLM...');
        await aiClient.loadModel(selectedLlmId, () => undefined);
        const rawDatesList = baseDates.map((d) => ({
          rawText: d.rawText,
          context: sourceText.slice(Math.max(0, d.startOffset - 45), d.endOffset + 45),
        }));
        const llmOut = await aiClient.generate(
          `Label each extracted date below with a concise category like "Payment due", "Contract end", "Notice deadline", or "Invoice date". Return ONLY a JSON array of {"rawText": "...", "label": "..."} objects.\n\n${JSON.stringify(rawDatesList)}`,
          {
            modelId: selectedLlmId,
            systemPrompt: 'Output a valid JSON array only.',
            temperature: 0.1,
            maxTokens: 250,
          },
          () => undefined,
        );
        onDatesChange(mergeLlmDateLabels(baseDates, llmOut));
        setStatusNote('Dates extracted by chrono-node and labeled by local LLM.');
      } else {
        setStatusNote('Dates extracted deterministically by chrono-node with context labels.');
      }
    } catch {
      setStatusNote('Dates extracted deterministically by chrono-node.');
    } finally {
      setExtracting(false);
    }
  };

  const handleExportIcs = () => {
    setError(null);
    try {
      const icsContent = buildIcsFromConfirmedDates(documentTitle || 'Veil Document', dates);
      const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(documentTitle || 'veil-dates').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.ics`;
      a.click();
      URL.revokeObjectURL(url);
      setStatusNote('Calendar .ics file downloaded locally.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to export .ics.');
    }
  };

  const updateDateField = (id: string, patch: Partial<ExtractedDateItem>) => {
    onDatesChange(dates.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  };

  // Highlight extracted date spans directly over OCR text for verification
  const highlightedFragments = useMemo(() => {
    if (!sourceText) return [];
    const sorted = [...dates].sort((a, b) => a.startOffset - b.startOffset);
    const fragments: Array<{ text: string; date?: ExtractedDateItem }> = [];
    let cursor = 0;

    for (const d of sorted) {
      if (d.startOffset < cursor || d.endOffset > sourceText.length) continue;
      if (d.startOffset > cursor) {
        fragments.push({ text: sourceText.slice(cursor, d.startOffset) });
      }
      fragments.push({ text: sourceText.slice(d.startOffset, d.endOffset), date: d });
      cursor = d.endOffset;
    }
    if (cursor < sourceText.length) {
      fragments.push({ text: sourceText.slice(cursor) });
    }
    return fragments;
  }, [dates, sourceText]);

  const confirmedCount = dates.filter((d) => d.confirmed).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>5. Key Dates & Calendar Export</CardTitle>
        <CardDescription>
          chrono-node extracts dates deterministically, and the local LLM labels each deadline.
          Confirm verified dates to export an .ics calendar file.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => void handleExtractDates()}
              disabled={extracting || !sourceText.trim()}
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              <span>{extracting ? 'Extracting...' : 'Extract Key Dates'}</span>
            </Button>

            <Button variant="outline" onClick={handleExportIcs} disabled={confirmedCount === 0}>
              <CalendarPlus className="h-4 w-4" aria-hidden="true" />
              <span>Export Confirmed (.ics)</span>
            </Button>
          </div>

          <Button onClick={() => void onSaveDocument()} disabled={saving}>
            <Save className="h-4 w-4" aria-hidden="true" />
            <span>{saving ? 'Encrypting...' : 'Save Document to Vault'}</span>
          </Button>
        </div>

        {statusNote && <p className="text-xs text-[var(--text-secondary)]">{statusNote}</p>}
        {error && (
          <p className="text-xs text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        )}

        {/* Verification View: Scan thumbnail + Date-highlighted OCR text */}
        <div className="grid lg:grid-cols-12 gap-4 items-start">
          {croppedImageUrl && (
            <div className="lg:col-span-5 rounded-xl border border-[var(--border-hairline)] overflow-hidden bg-[var(--bg-subtle)]">
              <img
                src={croppedImageUrl}
                alt="Scanned document for date verification"
                className="w-full h-auto max-h-[340px] object-contain"
              />
            </div>
          )}

          <div
            className={`${
              croppedImageUrl ? 'lg:col-span-7' : 'lg:col-span-12'
            } p-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-xs font-mono-tabular leading-relaxed whitespace-pre-wrap max-h-[340px] overflow-y-auto`}
          >
            {highlightedFragments.length === 0
              ? sourceText
              : highlightedFragments.map((frag, idx) =>
                  frag.date ? (
                    <mark
                      key={idx}
                      title={`${frag.date.label} (${frag.date.isoDate})`}
                      className="rounded px-1 py-0.5 bg-amber-200 dark:bg-amber-700/60 text-inherit font-semibold"
                    >
                      {frag.text}
                    </mark>
                  ) : (
                    <React.Fragment key={idx}>{frag.text}</React.Fragment>
                  ),
                )}
          </div>
        </div>

        {/* Editable Extracted Dates */}
        {dates.length > 0 && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-[var(--text-secondary)]">
                Verify & Confirm Dates ({confirmedCount}/{dates.length} confirmed)
              </h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDatesChange(dates.map((d) => ({ ...d, confirmed: true })))}
              >
                <CheckSquare className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Confirm All</span>
              </Button>
            </div>

            <div className="divide-y divide-[var(--border-hairline)] border border-[var(--border-hairline)] rounded-xl bg-[var(--bg-surface)]">
              {dates.map((d) => (
                <div
                  key={d.id}
                  className="p-3 flex flex-col sm:flex-row sm:items-center gap-3 justify-between"
                >
                  <label className="flex items-center gap-2.5 cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={d.confirmed}
                      onChange={(e) => updateDateField(d.id, { confirmed: e.target.checked })}
                      className="h-4 w-4"
                      aria-label={`Confirm ${d.label} on ${d.isoDate}`}
                    />
                    <span className="text-xs font-mono-tabular text-[var(--text-muted)]">
                      &ldquo;{d.rawText}&rdquo;
                    </span>
                  </label>

                  <div className="flex flex-wrap items-center gap-2 flex-1 sm:justify-end">
                    <Input
                      value={d.label}
                      onChange={(e) => updateDateField(d.id, { label: e.target.value })}
                      aria-label="Date label"
                      className="min-h-[36px] text-xs sm:w-44"
                    />
                    <Input
                      type="date"
                      value={d.isoDate}
                      onChange={(e) => updateDateField(d.id, { isoDate: e.target.value })}
                      aria-label="ISO date"
                      className="min-h-[36px] text-xs font-mono-tabular sm:w-40"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
