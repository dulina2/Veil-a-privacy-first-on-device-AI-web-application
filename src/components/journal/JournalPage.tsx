import { Flame, HeartHandshake, Plus, Search, Sparkles, Tag, Trash2 } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent } from '@/src/components/ui/card';
import { Input, Textarea } from '@/src/components/ui/input';
import { Switch } from '@/src/components/ui/progress';
import { aiClient } from '@/src/core/ai/aiClient';
import { inspectCachedModelStatus } from '@/src/core/ai/modelCatalog';
import { getActiveVaultKey, updateVaultMeta } from '@/src/core/crypto/vaultManager';
import {
  deleteJournalEntry,
  listEmbeddings,
  listJournalEntries,
  saveEmbedding,
  saveJournalEntry,
  type EmbeddingRecord,
} from '@/src/core/db/encryptedStore';
import type { EmotionPrediction } from '@/src/types/ai';
import type { JournalEntry } from '@/src/types/journal';
import type { VaultMetaRecord } from '@/src/types/vault';
import { checkTransientDistress } from '@/src/utils/distressDetector';
import {
  calculateStreakDays,
  cosineSimilarity,
  getDailyPrompt,
  heuristicEmotionFallback,
  MOOD_OPTIONS,
  tokenOverlapSimilarity,
} from './similarEntries';

interface JournalPageProps {
  meta: VaultMetaRecord;
  onMetaUpdated: (meta: VaultMetaRecord) => void;
}

export const JournalPage: React.FC<JournalPageProps> = ({ meta, onMetaUpdated }) => {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [embeddings, setEmbeddings] = useState<EmbeddingRecord[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [detectedMoods, setDetectedMoods] = useState<EmotionPrediction[]>([]);
  const [primaryMood, setPrimaryMood] = useState('neutral');
  const [moodOverridden, setMoodOverridden] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [queryVector, setQueryVector] = useState<number[] | null>(null);
  const [savingState, setSavingState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [moodEngineNote, setMoodEngineNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const dailyPrompt = useMemo(() => getDailyPrompt(), []);

  const loadAll = useCallback(async () => {
    const key = getActiveVaultKey();
    if (!key) return;
    setLoading(true);
    try {
      const [loadedEntries, loadedEmbeddings] = await Promise.all([
        listJournalEntries(key),
        listEmbeddings('journal', key),
      ]);
      setEntries(loadedEntries);
      setEmbeddings(loadedEmbeddings);
      if (loadedEntries.length > 0 && !activeId) {
        const first = loadedEntries[0]!;
        setActiveId(first.id);
        setTitle(first.title);
        setContent(first.content);
        setTags(first.tags);
        setDetectedMoods(first.detectedMoods);
        setPrimaryMood(first.primaryMood);
        setMoodOverridden(first.moodOverridden);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to decrypt journal entries.');
    } finally {
      setLoading(false);
    }
  }, [activeId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const startNewEntry = (usePrompt = false) => {
    const id = crypto.randomUUID();
    setActiveId(id);
    setTitle(usePrompt ? dailyPrompt : '');
    setContent('');
    setTags([]);
    setDetectedMoods([]);
    setPrimaryMood('neutral');
    setMoodOverridden(false);
    setSavingState('idle');
    setMoodEngineNote(null);
  };

  const selectEntry = (entry: JournalEntry) => {
    setActiveId(entry.id);
    setTitle(entry.title);
    setContent(entry.content);
    setTags(entry.tags);
    setDetectedMoods(entry.detectedMoods);
    setPrimaryMood(entry.primaryMood);
    setMoodOverridden(entry.moodOverridden);
    setSavingState('idle');
  };

  const persistEntry = useCallback(
    async (runAi: boolean) => {
      const key = getActiveVaultKey();
      if (!key) return;
      const trimmedContent = content.trim();
      const trimmedTitle = title.trim() || 'Untitled reflection';
      if (!trimmedContent && !title.trim()) return;

      const entryId = activeId ?? crypto.randomUUID();
      if (!activeId) setActiveId(entryId);

      setSavingState('saving');
      setError(null);

      const existing = entries.find((e) => e.id === entryId);
      const now = Date.now();
      const dateKey = existing?.dateKey ?? new Date(now).toISOString().slice(0, 10);

      let nextMoods = detectedMoods;
      let nextPrimary = primaryMood;

      if (runAi && trimmedContent.length >= 12) {
        try {
          const cached = await inspectCachedModelStatus();
          if (cached['MicahB/roberta-base-go_emotions'] === 'ready' || navigator.onLine) {
            nextMoods = await aiClient.classify(trimmedContent);
            setMoodEngineNote('Emotion scored locally via GoEmotions ONNX.');
          } else {
            nextMoods = heuristicEmotionFallback(trimmedContent);
            setMoodEngineNote(
              'Offline heuristic used (download GoEmotions in Models for neural scoring).',
            );
          }
        } catch {
          nextMoods = heuristicEmotionFallback(trimmedContent);
          setMoodEngineNote(
            'Local heuristic used (download GoEmotions in Models for neural scoring).',
          );
        }

        if (!moodOverridden && nextMoods.length > 0) {
          nextPrimary = nextMoods[0]!.label;
          setPrimaryMood(nextPrimary);
        }
        setDetectedMoods(nextMoods);

        // Generate local semantic embedding if MiniLM is cached or online
        try {
          const cached = await inspectCachedModelStatus();
          if (cached['Xenova/all-MiniLM-L6-v2'] === 'ready' || navigator.onLine) {
            const vector = await aiClient.embed(`${trimmedTitle}\n${trimmedContent}`);
            await saveEmbedding(entryId, 'journal', vector, key);
            setEmbeddings((prev) => {
              const filtered = prev.filter((item) => item.id !== entryId);
              return [...filtered, { id: entryId, kind: 'journal', vector, updatedAt: now }];
            });
          }
        } catch {
          // Embedding generation is non-blocking; keyword similarity fallback remains available
        }
      }

      const record: JournalEntry = {
        id: entryId,
        title: trimmedTitle,
        content,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        dateKey,
        tags,
        detectedMoods: nextMoods,
        primaryMood: nextPrimary,
        moodOverridden,
      };

      await saveJournalEntry(record, key);
      setEntries((prev) => {
        const others = prev.filter((item) => item.id !== entryId);
        return [record, ...others].sort((a, b) => b.createdAt - a.createdAt);
      });
      setSavingState('saved');
    },
    [activeId, content, detectedMoods, entries, moodOverridden, primaryMood, tags, title],
  );

  // Encrypted autosave every 1.4s while typing
  useEffect(() => {
    if (!activeId || (!title.trim() && !content.trim())) return;
    const timer = window.setTimeout(() => {
      void persistEntry(false);
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [activeId, title, content, tags, primaryMood, moodOverridden, persistEntry]);

  // Semantic query embedding when searching
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 4) {
      setQueryVector(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const cached = await inspectCachedModelStatus();
        if (cached['Xenova/all-MiniLM-L6-v2'] === 'ready') {
          const vec = await aiClient.embed(q);
          if (!cancelled) setQueryVector(vec);
        }
      } catch {
        // Fallback to keyword matching
      }
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchQuery]);

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return entries;
    const embeddingMap = new Map(embeddings.map((e) => [e.id, e.vector]));

    return [...entries]
      .map((entry) => {
        const textMatch =
          entry.title.toLowerCase().includes(q) ||
          entry.content.toLowerCase().includes(q) ||
          entry.primaryMood.toLowerCase().includes(q) ||
          entry.tags.some((t) => t.toLowerCase().includes(q));
        const vec = embeddingMap.get(entry.id);
        const semanticScore =
          queryVector && vec
            ? cosineSimilarity(queryVector, vec)
            : tokenOverlapSimilarity(q, entry.content);
        return { entry, score: (textMatch ? 1 : 0) + semanticScore };
      })
      .filter((item) => item.score > 0.12)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.entry);
  }, [embeddings, entries, queryVector, searchQuery]);

  const similarEntries = useMemo(() => {
    if (!activeId || entries.length < 2) return [];
    const embeddingMap = new Map(embeddings.map((e) => [e.id, e.vector]));
    const activeVec = embeddingMap.get(activeId);

    return entries
      .filter((e) => e.id !== activeId)
      .map((other) => {
        const otherVec = embeddingMap.get(other.id);
        const score =
          activeVec && otherVec
            ? cosineSimilarity(activeVec, otherVec)
            : tokenOverlapSimilarity(content, other.content);
        return { entry: other, score };
      })
      .filter((item) => item.score > 0.15)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }, [activeId, content, embeddings, entries]);

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = tagInput.trim().toLowerCase().replace(/^#/, '');
    if (cleaned && !tags.includes(cleaned)) {
      setTags((prev) => [...prev, cleaned]);
    }
    setTagInput('');
  };

  const handleDeleteEntry = async (id: string) => {
    await deleteJournalEntry(id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
    if (activeId === id) {
      startNewEntry(false);
    }
  };

  const handleOverrideMood = (newMood: string) => {
    setPrimaryMood(newMood);
    setMoodOverridden(true);
  };

  const handleToggleStreaks = async (enabled: boolean) => {
    const updated = await updateVaultMeta({ streaksEnabled: enabled });
    onMetaUpdated(updated);
  };

  const showDistressCare = useMemo(() => checkTransientDistress(content), [content]);
  const streakDays = useMemo(() => calculateStreakDays(entries), [entries]);

  return (
    <div className="space-y-5">
      {/* Workspace Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button onClick={() => startNewEntry(false)} size="sm">
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>New Entry</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => startNewEntry(true)}>
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            <span>Use Daily Prompt</span>
          </Button>
        </div>

        <div className="flex items-center gap-3">
          {meta.streaksEnabled && (
            <span className="inline-flex items-center gap-1.5 text-xs font-mono-tabular text-[var(--text-secondary)]">
              <Flame
                className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400"
                aria-hidden="true"
              />
              <span>{streakDays} day streak</span>
            </span>
          )}
          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
            <span>Streaks</span>
            <Switch
              checked={meta.streaksEnabled}
              onCheckedChange={(checked) => void handleToggleStreaks(checked)}
              aria-label="Toggle optional writing streaks"
            />
          </label>
        </div>
      </div>

      {/* Gentle non-logging safety support message (transient UI only) */}
      {showDistressCare && (
        <Card className="border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30">
          <CardContent className="p-4 flex items-start gap-3 text-sm">
            <HeartHandshake
              className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300 mt-0.5"
              aria-hidden="true"
            />
            <div className="space-y-1">
              <p className="font-medium text-amber-950 dark:text-amber-100">
                It sounds like you might be carrying a heavy moment.
              </p>
              <p className="text-xs text-amber-900 dark:text-amber-200/90 leading-relaxed">
                This notice stays strictly on your screen and is never logged or flagged. If you
                would like to talk to someone, free confidential local support is available at{' '}
                <a
                  href="https://findahelpline.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-medium"
                >
                  findahelpline.com
                </a>
                .
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-3 text-xs text-red-800 dark:text-red-200"
        >
          {error}
        </div>
      )}

      <div className="grid lg:grid-cols-12 gap-5 items-start">
        {/* Left: Search + Entry List */}
        <div className="lg:col-span-4 space-y-3">
          <div className="relative">
            <Search
              className="h-4 w-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search or semantic match..."
              className="pl-9"
              aria-label="Search journal entries"
            />
          </div>

          <div className="border border-[var(--border-hairline)] rounded-xl bg-[var(--bg-surface)] divide-y divide-[var(--border-hairline)] max-h-[520px] overflow-y-auto">
            {loading ? (
              <div className="p-5 text-xs text-[var(--text-muted)]">Decrypting entries...</div>
            ) : filteredEntries.length === 0 ? (
              <div className="p-5 text-xs text-[var(--text-muted)] space-y-2">
                <p>No journal entries yet.</p>
                <p>Write your first private reflection on the right.</p>
              </div>
            ) : (
              filteredEntries.map((entry) => {
                const isSelected = entry.id === activeId;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => selectEntry(entry)}
                    className={`w-full text-left p-4 transition-colors ${
                      isSelected ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--bg-subtle)]'
                    }`}
                  >
                    <p className="text-sm font-medium truncate">{entry.title}</p>
                    <p className="text-xs text-[var(--text-secondary)] line-clamp-2 mt-1">
                      {entry.content || 'Empty draft'}
                    </p>
                    <div className="mt-2 flex items-center gap-2 text-[11px] text-[var(--text-muted)] font-mono-tabular">
                      <span>{entry.dateKey}</span>
                      <span aria-hidden="true">·</span>
                      <span className="capitalize">{entry.primaryMood}</span>
                      {entry.tags.length > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="truncate">#{entry.tags.join(' #')}</span>
                        </>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Editor + Mood + Similar Entries */}
        <div className="lg:col-span-8 space-y-4">
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
                <span>Prompt: {dailyPrompt}</span>
                <span className="font-mono-tabular">
                  {savingState === 'saving'
                    ? 'Encrypting...'
                    : savingState === 'saved'
                      ? 'Encrypted & saved'
                      : 'AES-GCM Ready'}
                </span>
              </div>

              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Entry title"
                className="text-base font-semibold border-0 border-b border-[var(--border-hairline)] rounded-none px-0 focus-visible:outline-none"
                aria-label="Journal entry title"
              />

              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write freely in markdown or plain prose. Everything is encrypted before touching IndexedDB..."
                className="min-h-[240px] font-prose text-base leading-relaxed border-0 px-0 resize-y focus-visible:outline-none"
                aria-label="Journal entry content"
              />

              {/* Tags row */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--border-hairline)]">
                <Tag className="h-3.5 w-3.5 text-[var(--text-muted)]" aria-hidden="true" />
                {tags.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTags((prev) => prev.filter((item) => item !== t))}
                    className="text-xs text-[var(--text-secondary)] hover:text-red-600"
                    title="Remove tag"
                  >
                    #{t} ×
                  </button>
                ))}
                <form onSubmit={handleAddTag} className="inline-flex items-center gap-1.5">
                  <input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    placeholder="Add tag..."
                    className="text-xs bg-transparent border-b border-[var(--border-hairline)] py-1 px-1 w-24 focus:outline-none"
                    aria-label="Add tag"
                  />
                </form>
              </div>

              {/* Save + Mood Override Row */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--border-hairline)]">
                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor="mood-override" className="text-xs text-[var(--text-muted)]">
                    Mood:
                  </label>
                  <select
                    id="mood-override"
                    value={primaryMood}
                    onChange={(e) => handleOverrideMood(e.target.value)}
                    className="min-h-[36px] rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 text-xs capitalize"
                  >
                    {!MOOD_OPTIONS.includes(primaryMood as (typeof MOOD_OPTIONS)[number]) && (
                      <option value={primaryMood}>{primaryMood}</option>
                    )}
                    {MOOD_OPTIONS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  {moodOverridden && (
                    <span className="text-[11px] text-[var(--text-muted)]">(manual override)</span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {activeId && entries.some((e) => e.id === activeId) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleDeleteEntry(activeId)}
                      aria-label="Delete journal entry"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={() => void persistEntry(true)}
                    disabled={savingState === 'saving' || (!content.trim() && !title.trim())}
                  >
                    <span>Save & Analyze Mood</span>
                  </Button>
                </div>
              </div>

              {(detectedMoods.length > 0 || moodEngineNote) && (
                <div className="text-xs text-[var(--text-secondary)] space-y-1 pt-1">
                  {detectedMoods.length > 0 && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono-tabular">
                      <span className="text-[var(--text-muted)]">Detected scores:</span>
                      {detectedMoods.slice(0, 4).map((m) => (
                        <span key={m.label} className="capitalize">
                          {m.label} {(m.score * 100).toFixed(0)}%
                        </span>
                      ))}
                    </div>
                  )}
                  {moodEngineNote && (
                    <p className="text-[11px] text-[var(--text-muted)]">{moodEngineNote}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Find Similar Entries */}
          {similarEntries.length > 0 && (
            <Card>
              <CardContent className="p-4 space-y-2.5">
                <h3 className="text-xs font-semibold text-[var(--text-secondary)]">
                  Similar Past Reflections (Local Embeddings)
                </h3>
                <div className="divide-y divide-[var(--border-hairline)]">
                  {similarEntries.map(({ entry, score }) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => selectEntry(entry)}
                      className="w-full py-2 text-left flex items-center justify-between gap-3 hover:opacity-80"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{entry.title}</p>
                        <p className="text-xs text-[var(--text-muted)] font-mono-tabular">
                          {entry.dateKey} · {entry.primaryMood}
                        </p>
                      </div>
                      <span className="text-xs font-mono-tabular text-[var(--text-muted)] shrink-0">
                        {Math.round(score * 100)}% match
                      </span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
