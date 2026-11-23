import { Sparkles, Square } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@/src/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/card';
import { aiClient } from '@/src/core/ai/aiClient';
import { getActiveVaultKey } from '@/src/core/crypto/vaultManager';
import {
  listJournalEntries,
  listWeeklyReflections,
  saveWeeklyReflection,
} from '@/src/core/db/encryptedStore';
import type { JournalEntry, WeeklyReflectionRecord } from '@/src/types/journal';
import type { VaultMetaRecord } from '@/src/types/vault';
import {
  computeJournalCorrelations,
  extractRecurringThemes,
  getMoodValence,
} from './similarEntries';

interface JournalInsightsProps {
  meta: VaultMetaRecord;
}

export const JournalInsights: React.FC<JournalInsightsProps> = ({ meta }) => {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [reflections, setReflections] = useState<WeeklyReflectionRecord[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const key = getActiveVaultKey();
    if (!key) return;
    setLoading(true);
    void Promise.all([listJournalEntries(key), listWeeklyReflections(key)])
      .then(([loadedEntries, loadedReflections]) => {
        setEntries(loadedEntries);
        setReflections(loadedReflections);
        const last7Days = Date.now() - 7 * 86_400_000;
        const recent = loadedEntries.filter((e) => e.createdAt >= last7Days).slice(0, 5);
        setSelectedIds((recent.length > 0 ? recent : loadedEntries.slice(0, 5)).map((e) => e.id));
      })
      .finally(() => setLoading(false));
  }, []);

  const chartData = useMemo(() => {
    return [...entries]
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(-20)
      .map((entry) => ({
        date: entry.dateKey.slice(5),
        valence: Math.round(getMoodValence(entry.primaryMood) * 100),
        mood: entry.primaryMood,
      }));
  }, [entries]);

  // Last 35 days calendar mood heatmap
  const heatmapDays = useMemo(() => {
    const byDate = new Map<string, JournalEntry[]>();
    for (const e of entries) {
      byDate.set(e.dateKey, [...(byDate.get(e.dateKey) ?? []), e]);
    }

    const cells: Array<{ dateKey: string; count: number; avgValence: number; topMood: string }> =
      [];
    for (let i = 34; i >= 0; i--) {
      const dateKey = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
      const dayEntries = byDate.get(dateKey) ?? [];
      if (dayEntries.length === 0) {
        cells.push({ dateKey, count: 0, avgValence: 0, topMood: 'none' });
      } else {
        const avgValence =
          dayEntries.reduce((acc, item) => acc + getMoodValence(item.primaryMood), 0) /
          dayEntries.length;
        cells.push({
          dateKey,
          count: dayEntries.length,
          avgValence,
          topMood: dayEntries[0]!.primaryMood,
        });
      }
    }
    return cells;
  }, [entries]);

  const themes = useMemo(() => extractRecurringThemes(entries, 8), [entries]);
  const correlations = useMemo(() => computeJournalCorrelations(entries), [entries]);

  const toggleSelectEntry = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleGenerateReflection = async () => {
    const key = getActiveVaultKey();
    if (!key) return;
    const chosen = entries.filter((e) => selectedIds.includes(e.id)).slice(0, 5);
    if (chosen.length === 0) {
      setError('Select at least one entry to summarize.');
      return;
    }

    setError(null);
    setGenerating(true);
    setStreamingText('');

    const compactPrompt = chosen
      .map(
        (e) =>
          `[${e.dateKey} · ${e.primaryMood}] ${e.title}: ${e.content.slice(0, 320).replace(/\s+/g, ' ')}`,
      )
      .join('\n');

    try {
      await aiClient.loadModel(meta.selectedLlmId, () => undefined);
      const output = await aiClient.generate(
        `Summarize the recurring personal themes and gentle self-reflection observations across these ${chosen.length} journal entries in 3 short paragraphs:\n\n${compactPrompt}`,
        {
          modelId: meta.selectedLlmId,
          systemPrompt:
            'You are a quiet, respectful self-reflection assistant. Frame observations strictly as personal reflection—never as clinical diagnosis or therapy.',
          maxTokens: 280,
          temperature: 0.4,
        },
        (_token, accumulated) => {
          setStreamingText(accumulated);
        },
      );

      const record: WeeklyReflectionRecord = {
        id: crypto.randomUUID(),
        weekLabel: new Date().toISOString().slice(0, 10),
        generatedAt: Date.now(),
        entryIds: chosen.map((e) => e.id),
        summary: output,
      };
      await saveWeeklyReflection(record, key);
      setReflections((prev) => [record, ...prev]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to run local LLM. Download your chosen model in the Models tab first.',
      );
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-[var(--text-muted)]">Decrypting mood insights...</p>;
  }

  if (entries.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Journal Insights Yet</CardTitle>
          <CardDescription>
            Save a few private entries in your Journal to unlock mood trends, calendar heatmaps,
            correlations, and on-device weekly reflections.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-12 gap-5">
        {/* Mood Over Time Chart */}
        <Card className="lg:col-span-7">
          <CardHeader>
            <CardTitle>Mood Over Time</CardTitle>
            <CardDescription>
              Emotional valence (0–100) derived locally from your saved entries.
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-hairline)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-hairline)',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="valence"
                  stroke="var(--accent)"
                  fill="var(--accent)"
                  fillOpacity={0.14}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* 35-Day Calendar Mood Heatmap */}
        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle>35-Day Mood Heatmap</CardTitle>
            <CardDescription>Each square represents one calendar day.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-7 gap-2" role="grid" aria-label="35 day mood heatmap">
              {heatmapDays.map((cell) => {
                const bg =
                  cell.count === 0
                    ? 'bg-[var(--bg-subtle)]'
                    : cell.avgValence >= 0.65
                      ? 'bg-emerald-600/80 dark:bg-emerald-500/75'
                      : cell.avgValence >= 0.45
                        ? 'bg-[var(--accent)]/80'
                        : 'bg-amber-600/75 dark:bg-amber-500/70';
                return (
                  <div
                    key={cell.dateKey}
                    title={`${cell.dateKey}: ${cell.count} entries (${cell.topMood})`}
                    className={`aspect-square rounded-md border border-[var(--border-hairline)] ${bg}`}
                  />
                );
              })}
            </div>
            <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
              <span>5 weeks ago</span>
              <span>Today</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Themes & Correlations */}
      <div className="grid md:grid-cols-2 gap-5">
        <Card>
          <CardHeader>
            <CardTitle>Top Recurring Themes</CardTitle>
            <CardDescription>Frequently appearing words across your private notes.</CardDescription>
          </CardHeader>
          <CardContent>
            {themes.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">
                Write longer entries to extract themes.
              </p>
            ) : (
              <div className="divide-y divide-[var(--border-hairline)] text-sm">
                {themes.map((t) => (
                  <div key={t.theme} className="py-2 flex items-center justify-between">
                    <span className="capitalize">{t.theme}</span>
                    <span className="font-mono-tabular text-xs text-[var(--text-muted)]">
                      {t.count} {t.count === 1 ? 'entry' : 'entries'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mood Correlations</CardTitle>
            <CardDescription>Patterns by day of week, time of day, and tags.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div>
              <p className="font-medium text-[var(--text-secondary)] mb-1.5">By Time of Day</p>
              <div className="space-y-1">
                {correlations.byTimeOfDay.map((row) => (
                  <div key={row.label} className="flex justify-between font-mono-tabular">
                    <span>{row.label}</span>
                    <span className="capitalize">
                      {row.topMood} · {row.averageValence}/100 ({row.entryCount})
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="font-medium text-[var(--text-secondary)] mb-1.5">By Day of Week</p>
              <div className="space-y-1">
                {correlations.byDayOfWeek.map((row) => (
                  <div key={row.label} className="flex justify-between font-mono-tabular">
                    <span>{row.label}</span>
                    <span className="capitalize">
                      {row.topMood} · {row.averageValence}/100 ({row.entryCount})
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {correlations.byTag.length > 0 && (
              <div>
                <p className="font-medium text-[var(--text-secondary)] mb-1.5">By Tag</p>
                <div className="space-y-1">
                  {correlations.byTag.map((row) => (
                    <div key={row.label} className="flex justify-between font-mono-tabular">
                      <span>{row.label}</span>
                      <span className="capitalize">
                        {row.topMood} · {row.averageValence}/100 ({row.entryCount})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Weekly Self-Reflection (Local LLM Streaming, Selected Entries Only) */}
      <Card>
        <CardHeader>
          <CardTitle>Weekly Self-Reflection (On-Device LLM)</CardTitle>
          <CardDescription>
            Select up to 5 entries below. Only those selected excerpts are passed into the local
            worker prompt—never your full history. Framed for self-reflection, not therapy.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {entries.slice(0, 9).map((entry) => {
              const checked = selectedIds.includes(entry.id);
              return (
                <label
                  key={entry.id}
                  className={`flex items-start gap-2.5 p-3 rounded-lg border text-xs cursor-pointer ${
                    checked
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                      : 'border-[var(--border-hairline)]'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSelectEntry(entry.id)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0">
                    <p className="font-medium truncate">{entry.title}</p>
                    <p className="text-[var(--text-muted)] font-mono-tabular">
                      {entry.dateKey} · {entry.primaryMood}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => void handleGenerateReflection()}
              disabled={generating || selectedIds.length === 0}
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              <span>
                {generating ? 'Streaming Local Summary...' : 'Generate Weekly Reflection'}
              </span>
            </Button>
            {generating && (
              <Button variant="outline" size="sm" onClick={() => void aiClient.cancel()}>
                <Square className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Stop</span>
              </Button>
            )}
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-3 text-xs text-red-800 dark:text-red-200"
            >
              {error}
            </div>
          )}

          {streamingText && (
            <div className="p-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] font-prose text-sm leading-relaxed whitespace-pre-wrap">
              {streamingText}
            </div>
          )}

          {reflections.length > 0 && !streamingText && (
            <div className="space-y-2 pt-2 border-t border-[var(--border-hairline)]">
              <p className="text-xs font-medium text-[var(--text-muted)]">Saved Reflections</p>
              {reflections.slice(0, 2).map((ref) => (
                <div
                  key={ref.id}
                  className="p-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] space-y-1.5"
                >
                  <p className="text-xs font-mono-tabular text-[var(--text-muted)]">
                    {ref.weekLabel} · {ref.entryIds.length} entries summarized
                  </p>
                  <p className="font-prose text-sm whitespace-pre-wrap leading-relaxed">
                    {ref.summary}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
