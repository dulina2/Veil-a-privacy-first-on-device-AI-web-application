import { ScanText } from 'lucide-react';
import React, { useState } from 'react';
import { Button } from '@/src/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/card';
import { Textarea } from '@/src/components/ui/input';
import { Progress } from '@/src/components/ui/progress';
import { aiClient } from '@/src/core/ai/aiClient';
import { OCR_LANGUAGES } from '@/src/core/ai/modelCatalog';

interface OcrStepProps {
  imageDataUrl: string | null;
  language: string;
  ocrText: string;
  confidence: number;
  onLanguageChange: (lang: string) => void;
  onOcrUpdate: (text: string, confidence: number) => void;
  onProceedToTranslate: () => void;
}

export const OcrStep: React.FC<OcrStepProps> = ({
  imageDataUrl,
  language,
  ocrText,
  confidence,
  onLanguageChange,
  onOcrUpdate,
  onProceedToTranslate,
}) => {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleRunOcr = async () => {
    if (!imageDataUrl) return;
    setRunning(true);
    setError(null);
    setProgress(5);
    setStatusText('Initializing Tesseract Web Worker...');

    try {
      const result = await aiClient.recognizeOcr(imageDataUrl, language, (u) => {
        setProgress(u.progress);
        setStatusText(u.status);
      });
      onOcrUpdate(result.text, result.confidence);
      setProgress(100);
      setStatusText('OCR completed locally.');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'OCR failed. Ensure the selected language pack is cached or online for first download.',
      );
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>2. Optical Character Recognition (Tesseract.js)</CardTitle>
        <CardDescription>
          Runs inside a dedicated worker with self-hosted WASM core and offline language caching.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="ocr-lang" className="text-xs font-medium">
              Document Language:
            </label>
            <select
              id="ocr-lang"
              value={language}
              onChange={(e) => onLanguageChange(e.target.value)}
              className="min-h-[38px] rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 text-xs"
            >
              {OCR_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.label}
                </option>
              ))}
            </select>
          </div>

          <Button onClick={() => void handleRunOcr()} disabled={!imageDataUrl || running}>
            <ScanText className="h-4 w-4" aria-hidden="true" />
            <span>{running ? 'Extracting Text...' : 'Run Local OCR'}</span>
          </Button>
        </div>

        {running && (
          <div className="space-y-1.5 p-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)]">
            <div className="flex items-center justify-between text-xs font-mono-tabular">
              <span className="capitalize">{statusText}</span>
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

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="ocr-editor" className="font-medium">
              Extracted Text (editable)
            </label>
            {confidence > 0 && (
              <span className="font-mono-tabular text-[var(--text-secondary)]">
                Confidence: {confidence}%
              </span>
            )}
          </div>
          <Textarea
            id="ocr-editor"
            value={ocrText}
            onChange={(e) => onOcrUpdate(e.target.value, confidence)}
            placeholder="Run OCR above or paste document text to inspect..."
            className="min-h-[220px] font-mono-tabular text-xs leading-relaxed"
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={onProceedToTranslate} disabled={!ocrText.trim()}>
            Continue to Translate
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
