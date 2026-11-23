export interface NormalizedPoint {
  x: number; // 0..1 normalized
  y: number; // 0..1 normalized
}

export type CropQuad = [NormalizedPoint, NormalizedPoint, NormalizedPoint, NormalizedPoint];

export interface DocumentSummaryData {
  plainSummary: string;
  parties: string[];
  amounts: string[];
  obligations: string[];
}

export interface ExtractedDateItem {
  id: string;
  rawText: string;
  isoDate: string; // YYYY-MM-DD
  label: string; // e.g. "Payment due", "Contract end", "Notice deadline"
  confirmed: boolean;
  startOffset: number;
  endOffset: number;
}

export interface ScannedDocument {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  originalImageDataUrl: string;
  croppedImageDataUrl: string;
  ocrLanguage: string;
  ocrConfidence: number;
  ocrText: string;
  translatedText?: string;
  translationPair?: { src: string; tgt: string };
  summary?: DocumentSummaryData;
  extractedDates: ExtractedDateItem[];
  sourceType: 'camera' | 'image' | 'pdf';
}

export type ScannerStep = 'capture' | 'ocr' | 'translate' | 'summarize' | 'dates';
