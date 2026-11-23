import { FileText, Sparkles, Square } from 'lucide-react';
import React, { useState } from 'react';
import { Button } from '@/src/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/card';
import { aiClient } from '@/src/core/ai/aiClient';
import { inspectCachedModelStatus } from '@/src/core/ai/modelCatalog';
import type { DocumentSummaryData } from '@/src/types/scanner';
import { deterministicSummaryFallback, parseAndValidateSummaryJson } from './datePipeline';

interface SummarizeStepProps {
  sourceText: string;
  selectedLlmId: string;
  summary: DocumentSummaryData | undefined;
  onSummaryUpdate: (summary: DocumentSummaryData) => void;
  onProceedToDates: () => void;
}

export const SummarizeStep: React.FC<SummarizeStepProps> = ({
  sourceText,
  selectedLlmId,
  summary,
  onSummaryUpdate,
  onProceedToDates,
}) => {
  const [running, setRunning] = useState(false);
  const [attemptInfo, setAttemptInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSummarize = async () => {
    if (!sourceText.trim()) return;
    setRunning(true);
    setError(null);
    setAttemptInfo('Checking local LLM cache...');

    try {
      const cached = await inspectCachedModelStatus();
      const canUseLlm = cached[selectedLlmId] === 'ready' || navigator.onLine;

      if (!canUseLlm) {
        const fallback = deterministicSummaryFallback(sourceText);
        onSummaryUpdate(fallback);
        setAttemptInfo(
          'Offline without cached LLM — generated deterministic extraction. Download an LLM in Models for full neural summarization.',
        );
        return;
      }

      await aiClient.loadModel(selectedLlmId, (p) => {
        setAttemptInfo(`Loading LLM (${p.progress}%): ${p.statusText}`);
      });

      const prompt = `Analyze the document text below and respond ONLY with valid JSON matching this exact schema:
{
  "plainSummary": "2-3 sentence plain-language summary",
  "parties": ["Party name or role"],
  "amounts": ["Monetary amount with context"],
  "obligations": ["Key obligation or deadline"]
}

Document text:
${sourceText.slice(0, 2600)}`;

      let validated: DocumentSummaryData | null = null;
      const maxAttempts = 3;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        setAttemptInfo(
          attempt === 1
            ? 'Generating structured JSON summary on-device...'
            : `Retrying JSON validation (attempt ${attempt}/${maxAttempts})...`,
        );
        const raw = await aiClient.generate(
          attempt === 1
            ? prompt
            : `${prompt}\n\nIMPORTANT: Return strictly valid JSON with keys plainSummary, parties, amounts, obligations and no markdown fences.`,
          {
            modelId: selectedLlmId,
            systemPrompt: 'You output strict JSON objects only.',
            jsonMode: true,
            temperature: 0.1,
            maxTokens: 420,
          },
          () => undefined,
        );

        validated = parseAndValidateSummaryJson(raw);
        if (validated) break;
      }

      if (validated) {
        onSummaryUpdate(validated);
        setAttemptInfo('Validated JSON summary extracted locally.');
      } else {
        const fallback = deterministicSummaryFallback(sourceText);
        onSummaryUpdate(fallback);
        setAttemptInfo(
          'Local LLM returned malformed JSON after 3 attempts; applied deterministic schema fallback.',
        );
      }
    } catch (err) {
      const fallback = deterministicSummaryFallback(sourceText);
      onSummaryUpdate(fallback);
      setError(
        err instanceof Error
          ? `${err.message} Applied deterministic fallback below.`
          : 'Unable to run local LLM; applied deterministic fallback.',
      );
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>4. Structured Summary & Obligations</CardTitle>
        <CardDescription>
          Uses your local LLM to output schema-validated JSON (with automatic retry on invalid JSON)
          for summary, parties, amounts, and obligations.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void handleSummarize()} disabled={running || !sourceText.trim()}>
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            <span>{running ? 'Summarizing Locally...' : 'Generate Structured Summary'}</span>
          </Button>

          {running && (
            <Button variant="outline" size="sm" onClick={() => void aiClient.cancel()}>
              <Square className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Cancel</span>
            </Button>
          )}

          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              onSummaryUpdate(deterministicSummaryFallback(sourceText));
              setAttemptInfo('Generated deterministic extraction.');
            }}
          >
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Quick Deterministic Extract</span>
          </Button>
        </div>

        {attemptInfo && <p className="text-xs text-[var(--text-secondary)]">{attemptInfo}</p>}
        {error && (
          <p className="text-xs text-amber-700 dark:text-amber-300" role="alert">
            {error}
          </p>
        )}

        {summary && (
          <div className="space-y-4 p-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)]">
            <div className="space-y-1">
              <h4 className="text-xs font-semibold text-[var(--text-muted)]">Plain Summary</h4>
              <p className="text-sm leading-relaxed">{summary.plainSummary}</p>
            </div>

            <div className="grid sm:grid-cols-3 gap-4 text-xs pt-2 border-t border-[var(--border-hairline)]">
              <div className="space-y-1.5">
                <h4 className="font-semibold text-[var(--text-muted)]">Parties</h4>
                {summary.parties.length === 0 ? (
                  <p className="text-[var(--text-muted)]">None detected</p>
                ) : (
                  <ul className="space-y-1 list-disc list-inside">
                    {summary.parties.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="space-y-1.5">
                <h4 className="font-semibold text-[var(--text-muted)]">Amounts</h4>
                {summary.amounts.length === 0 ? (
                  <p className="text-[var(--text-muted)]">None detected</p>
                ) : (
                  <ul className="space-y-1 list-disc list-inside font-mono-tabular">
                    {summary.amounts.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="space-y-1.5">
                <h4 className="font-semibold text-[var(--text-muted)]">Obligations</h4>
                {summary.obligations.length === 0 ? (
                  <p className="text-[var(--text-muted)]">None detected</p>
                ) : (
                  <ul className="space-y-1 list-disc list-inside">
                    {summary.obligations.map((o, i) => (
                      <li key={i}>{o}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={onProceedToDates}>Continue to Key Dates</Button>
        </div>
      </CardContent>
    </Card>
  );
};
