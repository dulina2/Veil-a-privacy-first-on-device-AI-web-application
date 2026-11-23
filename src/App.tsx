import React, { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { JournalInsights } from '@/src/components/journal/JournalInsights';
import { JournalPage } from '@/src/components/journal/JournalPage';
import { AppShell } from '@/src/components/layout/AppShell';
import { LockScreen } from '@/src/components/layout/LockScreen';
import { OnboardingFlow } from '@/src/components/layout/OnboardingFlow';
import { ModelManagerPage } from '@/src/components/models/ModelManagerPage';
import { PrivacyPage } from '@/src/components/privacy/PrivacyPage';
import { ScannerPage } from '@/src/components/scanner/ScannerPage';
import { ModuleErrorBoundary } from '@/src/components/ui/ErrorBoundary';
import { networkMonitor } from '@/src/core/ai/networkMonitor';
import { getActiveVaultKey, getVaultMeta, lockVaultMemory } from '@/src/core/crypto/vaultManager';
import type { VaultMetaRecord } from '@/src/types/vault';

const THEME_STORAGE_KEY = 'veil-theme-preference';

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'dark';
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const [meta, setMeta] = useState<VaultMetaRecord | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    void getVaultMeta()
      .then((found) => {
        if (found) {
          setMeta(found);
          setUnlocked(getActiveVaultKey() !== null);
          networkMonitor.setAirGapLock(Boolean(found.airGapLockEnabled));
        }
      })
      .finally(() => setBooting(false));
  }, []);

  const handleToggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const handleLockVault = useCallback(() => {
    lockVaultMemory();
    setUnlocked(false);
  }, []);

  const handleVaultWiped = useCallback(() => {
    lockVaultMemory();
    setMeta(null);
    setUnlocked(false);
  }, []);

  if (booting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-canvas)] text-sm text-[var(--text-muted)]">
        Initializing Veil local vault...
      </div>
    );
  }

  if (!meta || !meta.onboardingCompleted) {
    return (
      <OnboardingFlow
        onComplete={(createdMeta) => {
          setMeta(createdMeta);
          setUnlocked(true);
        }}
      />
    );
  }

  if (!unlocked) {
    return (
      <LockScreen
        meta={meta}
        onUnlocked={(unlockedMeta) => {
          setMeta(unlockedMeta);
          setUnlocked(true);
        }}
      />
    );
  }

  return (
    <BrowserRouter>
      <AppShell
        meta={meta}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onLockVault={handleLockVault}
      >
        <Routes>
          <Route
            path="/journal"
            element={
              <ModuleErrorBoundary moduleName="Private Journal">
                <JournalPage meta={meta} onMetaUpdated={setMeta} />
              </ModuleErrorBoundary>
            }
          />
          <Route
            path="/insights"
            element={
              <ModuleErrorBoundary moduleName="Mood Insights">
                <JournalInsights meta={meta} />
              </ModuleErrorBoundary>
            }
          />
          <Route
            path="/scanner"
            element={
              <ModuleErrorBoundary moduleName="Smart Document Scanner">
                <ScannerPage meta={meta} />
              </ModuleErrorBoundary>
            }
          />
          <Route
            path="/models"
            element={
              <ModuleErrorBoundary moduleName="Model Manager">
                <ModelManagerPage meta={meta} onMetaUpdated={setMeta} />
              </ModuleErrorBoundary>
            }
          />
          <Route
            path="/privacy"
            element={
              <ModuleErrorBoundary moduleName="Privacy & Security">
                <PrivacyPage meta={meta} onMetaUpdated={setMeta} onVaultWiped={handleVaultWiped} />
              </ModuleErrorBoundary>
            }
          />
          <Route path="*" element={<Navigate to="/journal" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
