import type { EmotionPrediction } from '@/src/types/ai';
import type { JournalCorrelation, JournalEntry } from '@/src/types/journal';

export const DAILY_PROMPTS = [
  'What felt quietly meaningful today, even if it was small?',
  'What drained your attention today, and what restored it?',
  'If you set down one obligation tonight, which one gives you the most room to breathe?',
  'What assumption did you notice yourself carrying this week?',
  'Describe a moment today where you felt completely present.',
  'What is one conversation you have been postponing, and what makes it feel heavy?',
];

export const MOOD_OPTIONS = [
  'calm',
  'curiosity',
  'gratitude',
  'joy',
  'optimism',
  'neutral',
  'relief',
  'pride',
  'tiredness',
  'sadness',
  'anxiety',
  'frustration',
  'overwhelm',
] as const;

export const MOOD_VALENCE: Record<string, number> = {
  joy: 0.9,
  gratitude: 0.85,
  optimism: 0.8,
  pride: 0.8,
  relief: 0.75,
  admiration: 0.75,
  approval: 0.7,
  caring: 0.7,
  curiosity: 0.65,
  calm: 0.7,
  amusement: 0.8,
  excitement: 0.85,
  love: 0.9,
  neutral: 0.5,
  realization: 0.55,
  surprise: 0.55,
  tiredness: 0.35,
  nervousness: 0.3,
  anxiety: 0.25,
  confusion: 0.35,
  disappointment: 0.25,
  sadness: 0.2,
  frustration: 0.25,
  annoyance: 0.25,
  anger: 0.15,
  fear: 0.15,
  grief: 0.1,
  overwhelm: 0.2,
  remorse: 0.25,
};

export function getDailyPrompt(date: Date = new Date()): string {
  const dayOfYear = Math.floor(
    (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86_400_000,
  );
  return DAILY_PROMPTS[dayOfYear % DAILY_PROMPTS.length] ?? DAILY_PROMPTS[0]!;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const va = a[i] ?? 0;
    const vb = b[i] ?? 0;
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export function tokenOverlapSimilarity(textA: string, textB: string): number {
  const wordsA = new Set(
    textA
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3),
  );
  const wordsB = new Set(
    textB
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3),
  );
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection += 1;
  }
  return intersection / Math.sqrt(wordsA.size * wordsB.size);
}

/**
 * Lightweight deterministic fallback emotion scorer used only if the GoEmotions ONNX model
 * is not yet cached/downloaded in the browser.
 */
export function heuristicEmotionFallback(text: string): EmotionPrediction[] {
  const lower = text.toLowerCase();
  const buckets: Array<{ label: string; keywords: string[] }> = [
    { label: 'gratitude', keywords: ['grateful', 'thankful', 'appreciate', 'blessed'] },
    { label: 'joy', keywords: ['happy', 'joy', 'excited', 'delighted', 'wonderful', 'smile'] },
    { label: 'calm', keywords: ['calm', 'peaceful', 'quiet', 'settled', 'breathe', 'steady'] },
    { label: 'curiosity', keywords: ['curious', 'wonder', 'explore', 'learn', 'interesting'] },
    {
      label: 'anxiety',
      keywords: ['anxious', 'worried', 'nervous', 'stressed', 'tense', 'uncertain'],
    },
    { label: 'sadness', keywords: ['sad', 'lonely', 'down', 'grief', 'miss', 'heavy'] },
    { label: 'frustration', keywords: ['frustrated', 'angry', 'annoyed', 'stuck', 'exhausted'] },
  ];

  const scores: EmotionPrediction[] = [];
  for (const b of buckets) {
    let hits = 0;
    for (const kw of b.keywords) {
      if (lower.includes(kw)) hits += 1;
    }
    if (hits > 0) {
      scores.push({ label: b.label, score: Math.min(0.95, 0.45 + hits * 0.15) });
    }
  }

  if (scores.length === 0) {
    return [{ label: 'neutral', score: 0.68 }];
  }
  return scores.sort((a, b) => b.score - a.score).slice(0, 5);
}

export function getMoodValence(mood: string): number {
  return MOOD_VALENCE[mood.toLowerCase()] ?? 0.5;
}

const STOPWORDS = new Set([
  'that',
  'this',
  'with',
  'from',
  'have',
  'been',
  'were',
  'they',
  'them',
  'what',
  'when',
  'where',
  'which',
  'there',
  'their',
  'about',
  'would',
  'could',
  'should',
  'today',
  'really',
  'just',
  'feel',
  'feeling',
  'felt',
  'more',
  'some',
  'into',
  'after',
  'before',
  'still',
  'very',
  'much',
]);

export function extractRecurringThemes(
  entries: JournalEntry[],
  limit = 6,
): Array<{ theme: string; count: number }> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const seenInEntry = new Set<string>();
    const words = `${entry.title} ${entry.content}`.toLowerCase().match(/[a-z]{4,}/g) ?? [];
    for (const word of words) {
      if (!STOPWORDS.has(word) && !seenInEntry.has(word)) {
        seenInEntry.add(word);
        counts.set(word, (counts.get(word) ?? 0) + 1);
      }
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([theme, count]) => ({ theme, count }));
}

export function computeJournalCorrelations(entries: JournalEntry[]): {
  byDayOfWeek: JournalCorrelation[];
  byTimeOfDay: JournalCorrelation[];
  byTag: JournalCorrelation[];
} {
  const summarizeGroup = (label: string, group: JournalEntry[]): JournalCorrelation => {
    const moodFreq = new Map<string, number>();
    let totalValence = 0;
    for (const e of group) {
      moodFreq.set(e.primaryMood, (moodFreq.get(e.primaryMood) ?? 0) + 1);
      totalValence += getMoodValence(e.primaryMood);
    }
    const topMood = Array.from(moodFreq.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'neutral';
    return {
      label,
      topMood,
      averageValence: Math.round((totalValence / group.length) * 100),
      entryCount: group.length,
    };
  };

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayBuckets = new Map<string, JournalEntry[]>();
  const timeBuckets = new Map<string, JournalEntry[]>();
  const tagBuckets = new Map<string, JournalEntry[]>();

  for (const entry of entries) {
    const d = new Date(entry.createdAt);
    const dayLabel = dayNames[d.getDay()] ?? 'Mon';
    dayBuckets.set(dayLabel, [...(dayBuckets.get(dayLabel) ?? []), entry]);

    const hour = d.getHours();
    const timeSlot =
      hour < 12 ? 'Morning (5am–12pm)' : hour < 17 ? 'Afternoon (12pm–5pm)' : 'Evening (5pm+)';
    timeBuckets.set(timeSlot, [...(timeBuckets.get(timeSlot) ?? []), entry]);

    for (const tag of entry.tags) {
      tagBuckets.set(`#${tag}`, [...(tagBuckets.get(`#${tag}`) ?? []), entry]);
    }
  }

  return {
    byDayOfWeek: Array.from(dayBuckets.entries()).map(([k, g]) => summarizeGroup(k, g)),
    byTimeOfDay: Array.from(timeBuckets.entries()).map(([k, g]) => summarizeGroup(k, g)),
    byTag: Array.from(tagBuckets.entries())
      .map(([k, g]) => summarizeGroup(k, g))
      .sort((a, b) => b.entryCount - a.entryCount)
      .slice(0, 6),
  };
}

export function calculateStreakDays(entries: JournalEntry[]): number {
  if (entries.length === 0) return 0;
  const uniqueDates = Array.from(new Set(entries.map((e) => e.dateKey)))
    .sort()
    .reverse();
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  if (uniqueDates[0] !== today && uniqueDates[0] !== yesterday) {
    return 0;
  }

  let streak = 1;
  let cursor = new Date(`${uniqueDates[0]}T00:00:00`);
  for (let i = 1; i < uniqueDates.length; i++) {
    cursor = new Date(cursor.getTime() - 86_400_000);
    const expected = cursor.toISOString().slice(0, 10);
    if (uniqueDates[i] === expected) {
      streak += 1;
    } else {
      break;
    }
  }
  return streak;
}
