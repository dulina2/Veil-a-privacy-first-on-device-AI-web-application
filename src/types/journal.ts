import type { EmotionPrediction } from './ai';

export interface JournalEntry {
  id: string;
  title: string;
  content: string; // markdown or plain prose
  createdAt: number;
  updatedAt: number;
  dateKey: string; // YYYY-MM-DD
  tags: string[];
  detectedMoods: EmotionPrediction[];
  primaryMood: string;
  moodOverridden: boolean;
  promptUsed?: string;
}

export interface JournalCorrelation {
  label: string;
  topMood: string;
  averageValence: number;
  entryCount: number;
}

export interface WeeklyReflectionRecord {
  id: string;
  weekLabel: string;
  generatedAt: number;
  entryIds: string[];
  summary: string;
}
