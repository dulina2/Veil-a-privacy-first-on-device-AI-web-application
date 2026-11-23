import { AlertCircle, Check, Plus, Search, Trash2 } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent } from '@/src/components/ui/card';
import { Input } from '@/src/components/ui/input';
import { getActiveVaultKey } from '@/src/core/crypto/vaultManager';
import {
  deleteScannedDocument,
  listScannedDocuments,
  saveScannedDocument,
} from '@/src/core/db/encryptedStore';
import type {
  DocumentSummaryData,
  ExtractedDateItem,
  ScannedDocument,
  ScannerStep,
} from '@/src/types/scanner';
import type { VaultMetaRecord } from '@/src/types/vault';
import { CaptureStep } from './CaptureStep';
import { DatesStep } from './DatesStep';
import { OcrStep } from './OcrStep';
import { SummarizeStep } from './SummarizeStep';
import { TranslateStep } from './TranslateStep';

interface ScannerPageProps {
  meta: VaultMetaRecord;
}

const STEPS: Array<{ id: ScannerStep; label: string; num: number }> = [
  { id: 'capture', label: 'Capture', num: 1 },
  { id: 'ocr', label: 'OCR', num: 2 },
  { id: 'translate', label: 'Translate', num: 3 },
  { id: 'summarize', label: 'Summarize', num: 4 },
  { id: 'dates', label: 'Key Dates', num: 5 },
];

export const ScannerPage: React.FC<ScannerPageProps> = ({ meta }) => {
  const [documents, setDocuments] = useState<ScannedDocument[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeStep, setActiveStep] = useState<ScannerStep>('capture');

  const [docId, setDocId] = useState<string>(() => crypto.randomUUID());
  const [title, setTitle] = useState('Untitled Document');
  const [sourceType, setSourceType] = useState<'camera' | 'image' | 'pdf'>('image');
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [croppedImage, setCroppedImage] = useState<string | null>(null);
  const [ocrLanguage, setOcrLanguage] = useState('eng');
  const [ocrConfidence, setOcrConfidence] = useState(0);
  const [ocrText, setOcrText] = useState('');
  const [translationPairId, setTranslationPairId] = useState('Xenova/opus-mt-es-en');
  const [translatedText, setTranslatedText] = useState('');
  const [summary, setSummary] = useState<DocumentSummaryData | undefined>(undefined);
  const [extractedDates, setExtractedDates] = useState<ExtractedDateItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    const key = getActiveVaultKey();
    if (!key) return;
    const docs = await listScannedDocuments(key);
    setDocuments(docs);
  }, []);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const startNewScan = () => {
    setDocId(crypto.randomUUID());
    setTitle('Untitled Document');
    setSourceType('image');
    setOriginalImage(null);
    setCroppedImage(null);
    setOcrConfidence(0);
    setOcrText('');
    setTranslatedText('');
    setSummary(undefined);
    setExtractedDates([]);
    setActiveStep('capture');
    setSaveNote(null);
  };

  const openDocument = (doc: ScannedDocument) => {
    setDocId(doc.id);
    setTitle(doc.title);
    setSourceType(doc.sourceType);
    setOriginalImage(doc.originalImageDataUrl);
    setCroppedImage(doc.croppedImageDataUrl);
    setOcrLanguage(doc.ocrLanguage);
    setOcrConfidence(doc.ocrConfidence);
    setOcrText(doc.ocrText);
    setTranslatedText(doc.translatedText ?? '');
    setSummary(doc.summary);
    setExtractedDates(doc.extractedDates);
    setActiveStep(doc.ocrText ? 'dates' : 'capture');
    setSaveNote(null);
  };

  const handleSaveDocument = async () => {
    const key = getActiveVaultKey();
    if (!key) return;
    setSaving(true);
    setSaveNote(null);
    try {
      const existing = documents.find((d) => d.id === docId);
      const now = Date.now();
      const record: ScannedDocument = {
        id: docId,
        title: title.trim() || 'Untitled Document',
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        originalImageDataUrl: originalImage ?? '',
        croppedImageDataUrl: croppedImage ?? originalImage ?? '',
        ocrLanguage,
        ocrConfidence,
        ocrText,
        translatedText: translatedText || undefined,
        summary,
        extractedDates,
        sourceType,
      };
      await saveScannedDocument(record, key);
      await loadDocuments();
      setSaveNote('Document, OCR text, summary, and dates encrypted & saved.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDocument = async (id: string) => {
    await deleteScannedDocument(id);
    await loadDocuments();
    if (docId === id) {
      startNewScan();
    }
  };

  const filteredDocuments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return documents;
    return documents.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.ocrText.toLowerCase().includes(q) ||
        (d.summary?.plainSummary.toLowerCase().includes(q) ?? false) ||
        d.extractedDates.some((dt) => dt.label.toLowerCase().includes(q) || dt.isoDate.includes(q)),
    );
  }, [documents, searchQuery]);

  const activeIdx = STEPS.findIndex((s) => s.id === activeStep);

  return (
    <div className="space-y-5">
      {/* Persistent Legal & Accuracy Notice */}
      <div
        role="note"
        className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-4 py-3 flex items-center gap-2.5 text-xs text-[var(--text-secondary)]"
      >
        <AlertCircle className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden="true" />
        <span>
          OCR and AI can make mistakes. Verify important details. This is not legal advice.
        </span>
      </div>

      {/* Header + Document Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Document title"
            placeholder="Document title"
            className="font-medium"
          />
        </div>

        <Button variant="outline" size="sm" onClick={startNewScan}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>New Scan</span>
        </Button>
      </div>

      {/* Visible Step-by-Step Progress UI */}
      <nav
        aria-label="Document scanner steps"
        className="grid grid-cols-5 gap-1.5 sm:gap-2 p-1.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)]"
      >
        {STEPS.map((step, idx) => {
          const isCurrent = step.id === activeStep;
          const isPast = idx < activeIdx;
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => setActiveStep(step.id)}
              className={`min-h-[40px] px-2 py-1.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
                isCurrent
                  ? 'bg-[var(--accent)] text-[var(--accent-foreground)]'
                  : isPast
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)] dark:text-[#7ac4d8]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]'
              }`}
            >
              {isPast ? (
                <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <span className="font-mono-tabular">{step.num}.</span>
              )}
              <span className="truncate">{step.label}</span>
            </button>
          );
        })}
      </nav>

      {saveNote && (
        <div className="rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/30 p-3 text-xs text-emerald-900 dark:text-emerald-200">
          {saveNote}
        </div>
      )}

      {/* Active Step Panel + Encrypted Document Library */}
      <div className="grid lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-8">
          {activeStep === 'capture' && (
            <CaptureStep
              originalImage={originalImage}
              croppedImage={croppedImage}
              onCaptureComplete={({
                originalImage: orig,
                croppedImage: crop,
                sourceType: src,
                suggestedTitle,
              }) => {
                setOriginalImage(orig);
                setCroppedImage(crop);
                setSourceType(src);
                if (title === 'Untitled Document') setTitle(suggestedTitle);
              }}
              onProceedToOcr={() => setActiveStep('ocr')}
            />
          )}

          {activeStep === 'ocr' && (
            <OcrStep
              imageDataUrl={croppedImage ?? originalImage}
              language={ocrLanguage}
              ocrText={ocrText}
              confidence={ocrConfidence}
              onLanguageChange={setOcrLanguage}
              onOcrUpdate={(text, conf) => {
                setOcrText(text);
                setOcrConfidence(conf);
              }}
              onProceedToTranslate={() => setActiveStep('translate')}
            />
          )}

          {activeStep === 'translate' && (
            <TranslateStep
              originalText={ocrText}
              translatedText={translatedText}
              selectedPairId={translationPairId}
              onPairChange={setTranslationPairId}
              onTranslatedUpdate={setTranslatedText}
              onProceedToSummarize={() => setActiveStep('summarize')}
            />
          )}

          {activeStep === 'summarize' && (
            <SummarizeStep
              sourceText={translatedText.trim() || ocrText}
              selectedLlmId={meta.selectedLlmId}
              summary={summary}
              onSummaryUpdate={setSummary}
              onProceedToDates={() => setActiveStep('dates')}
            />
          )}

          {activeStep === 'dates' && (
            <DatesStep
              documentTitle={title}
              sourceText={ocrText}
              croppedImageUrl={croppedImage ?? originalImage}
              selectedLlmId={meta.selectedLlmId}
              dates={extractedDates}
              onDatesChange={setExtractedDates}
              onSaveDocument={handleSaveDocument}
              saving={saving}
            />
          )}
        </div>

        {/* Searchable Encrypted Document Library */}
        <aside className="lg:col-span-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Encrypted Library</h3>
            <span className="text-xs font-mono-tabular text-[var(--text-muted)]">
              {documents.length} saved
            </span>
          </div>

          <div className="relative">
            <Search
              className="h-4 w-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search scans, summaries, dates..."
              className="pl-9"
              aria-label="Search scanned documents"
            />
          </div>

          <Card>
            <CardContent className="p-0 divide-y divide-[var(--border-hairline)] max-h-[520px] overflow-y-auto">
              {filteredDocuments.length === 0 ? (
                <div className="p-5 text-xs text-[var(--text-muted)]">
                  No saved documents yet. Scan or upload an image/PDF and save it to your encrypted
                  library.
                </div>
              ) : (
                filteredDocuments.map((doc) => (
                  <div
                    key={doc.id}
                    className={`p-3.5 flex items-start justify-between gap-2 ${
                      doc.id === docId ? 'bg-[var(--accent-soft)]' : ''
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => openDocument(doc)}
                      className="text-left min-w-0 flex-1"
                    >
                      <p className="text-sm font-medium truncate">{doc.title}</p>
                      <p className="text-[11px] text-[var(--text-muted)] font-mono-tabular mt-0.5">
                        {new Date(doc.updatedAt).toISOString().slice(0, 10)} · {doc.sourceType} ·{' '}
                        {doc.extractedDates.length} dates
                      </p>
                      {doc.summary?.plainSummary && (
                        <p className="text-xs text-[var(--text-secondary)] line-clamp-2 mt-1">
                          {doc.summary.plainSummary}
                        </p>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteDocument(doc.id)}
                      aria-label={`Delete ${doc.title}`}
                      className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
};
