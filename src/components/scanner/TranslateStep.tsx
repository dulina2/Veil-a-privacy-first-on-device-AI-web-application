import { Languages } from 'lucide-react';
import React, { useState } from 'react';
import { Button } from '@/src/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/card';
import { Progress } from '@/src/components/ui/progress';
import { Textarea } from '@/src/components/ui/input';
import { aiClient } from '@/src/core/ai/aiClient';
import { TRANSLATION_PAIRS } from '@/src/core/ai/modelCatalog';

interface TranslateStepProps {
  originalText: string;
  translatedText: string;
  selectedPairId: string;
  onPairChange: (pairId: string) => void;
  onTranslatedUpdate: (text: string) => void;
  onProceedToSummarize: () => void;
}

export const TranslateStep: React.FC<TranslateStepProps> = ({
  originalText,
  translatedText,
  selectedPairId,
  onPairChange,
  onTranslatedUpdate,
  onProceedToSummarize,
}) => {
  const [translating, setTranslating] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const pair = TRANSLATION_PAIRS.find((p) => p.id === selectedPairId) ?? TRANSLATION_PAIRS[0]!;

  const handleTranslate = async () => {
    if (!originalText.trim()) return;
    setTranslating(true);
    setError(null);
    setProgress(5);
    setStatusText(`Loading ${pair.label} model...`);

    try {
      const output = await aiClient.translate(originalText, pair.src, pair.tgt, (p) => {
        setProgress(p.progress);
        setStatusText(p.statusText);
      });
      onTranslatedUpdate(output);
      setProgress(100);
      setStatusText('Translation completed on-device.');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Translation failed. Check connectivity for first-time download of this language pair.',
      );
      setProgress(null);
    } finally {
      setTranslating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>3. Local Neural Translation (Optional)</CardTitle>
        <CardDescription>
          Downloads one Opus-MT language pair at a time via Transformers.js and caches it offline.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="translation-pair" className="text-xs font-medium">
              Language Pair:
            </label>
            <select
              id="translation-pair"
              value={pair.id}
              onChange={(e) => onPairChange(e.target.value)}
              className="min-h-[38px] rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 text-xs"
            >
              {TRANSLATION_PAIRS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} (~78 MB)
                </option>
              ))}
            </select>
          </div>

          <Button
            onClick={() => void handleTranslate()}
            disabled={translating || !originalText.trim()}
          >
            <Languages className="h-4 w-4" aria-hidden="true" />
            <span>{translating ? 'Translating...' : 'Translate Locally'}</span>
          </Button>
        </div>

        {progress !== null && (
          <div className="space-y-1.5 p-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)]">
            <div className="flex justify-between text-xs font-mono-tabular">
              <span>{statusText}</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} />
          </div>
        )}

        {error && (
          <p className="text-xs text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-[var(--text-secondary)]">Original Text</span>
            <Textarea
              readOnly
              value={originalText}
              className="min-h-[200px] text-xs font-mono-tabular bg-[var(--bg-subtle)]"
            />
          </div>
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-[var(--text-secondary)]">
              Translated Output
            </span>
            <Textarea
              value={translatedText}
              onChange={(e) => onTranslatedUpdate(e.target.value)}
              placeholder="Translated document text will appear side-by-side here..."
              className="min-h-[200px] text-xs font-mono-tabular"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onProceedToSummarize}>
            Skip Translation
          </Button>
          <Button onClick={onProceedToSummarize}>Continue to Summarize</Button>
        </div>
      </CardContent>
    </Card>
  );
};
