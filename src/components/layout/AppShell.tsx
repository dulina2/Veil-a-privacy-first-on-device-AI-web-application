import { BarChart3, BookOpen, Cpu, Lock, Moon, ScanText, Shield, Sun, WifiOff } from 'lucide-react';
import React, { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { PWAInstallButton } from '@/src/components/layout/PWAInstallButton';
import { Button } from '@/src/components/ui/button';
import { useOnlineStatus } from '@/src/core/pwa/useOnlineStatus';
import type { VaultMetaRecord } from '@/src/types/vault';
import { cn } from '@/src/utils/cn';

interface AppShellProps {
  meta: VaultMetaRecord;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onLockVault: () => void;
  children: React.ReactNode;
}

const NAV_ITEMS = [
  { to: '/journal', label: 'Journal', shortLabel: 'Journal', icon: BookOpen },
  { to: '/insights', label: 'Insights', shortLabel: 'Insights', icon: BarChart3 },
  { to: '/scanner', label: 'Scanner', shortLabel: 'Scan', icon: ScanText },
  { to: '/models', label: 'Models', shortLabel: 'Models', icon: Cpu },
  { to: '/privacy', label: 'Privacy', shortLabel: 'Privacy', icon: Shield },
] as const;

export const AppShell: React.FC<AppShellProps> = ({
  meta,
  theme,
  onToggleTheme,
  onLockVault,
  children,
}) => {
  const location = useLocation();
  const isOnline = useOnlineStatus();

  useEffect(() => {
    if (meta.autoLockMinutes <= 0) return;
    const timeoutMs = meta.autoLockMinutes * 60_000;
    let timer = window.setTimeout(onLockVault, timeoutMs);

    const resetTimer = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(onLockVault, timeoutMs);
    };

    const events: Array<keyof WindowEventMap> = [
      'pointerdown',
      'keydown',
      'mousemove',
      'touchstart',
    ];
    for (const ev of events) {
      window.addEventListener(ev, resetTimer, { passive: true });
    }

    return () => {
      window.clearTimeout(timer);
      for (const ev of events) {
        window.removeEventListener(ev, resetTimer);
      }
    };
  }, [meta.autoLockMinutes, onLockVault]);

  const activeItem =
    NAV_ITEMS.find((item) => location.pathname.startsWith(item.to)) ?? NAV_ITEMS[0];

  return (
    <div className="min-h-screen flex bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      {/* Desktop Sidebar */}
      <aside
        aria-label="Primary navigation"
        className="hidden md:flex md:w-[248px] md:flex-col md:fixed md:inset-y-0 border-r border-[var(--border-hairline)] bg-[var(--bg-surface)]"
      >
        <div className="h-14 px-5 flex items-center gap-2.5 border-b border-[var(--border-hairline)]">
          <img src="/icon.svg" alt="" className="h-6 w-6 rounded-md" />
          <span className="text-base font-semibold tracking-tight whitespace-nowrap">Veil</span>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[42px] whitespace-nowrap',
                    isActive
                      ? 'bg-[var(--accent-soft)] text-[var(--accent)] dark:text-[#7ac4d8]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]',
                  )
                }
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="p-3 border-t border-[var(--border-hairline)] space-y-2">
          <button
            type="button"
            onClick={onToggleTheme}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] min-h-[40px]"
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            <span>{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
            {theme === 'dark' ? (
              <Sun className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Moon className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
          <Button variant="outline" size="sm" className="w-full" onClick={onLockVault}>
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Lock Vault</span>
          </Button>
        </div>
      </aside>

      {/* Main Content Column */}
      <div className="flex-1 md:pl-[248px] flex flex-col min-w-0">
        {/* Top Bar (Compact 48px mobile / 56px desktop) */}
        <header className="sticky top-0 z-30 h-12 md:h-14 border-b border-[var(--border-hairline)] bg-[var(--bg-surface)]/95 backdrop-blur-sm px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="md:hidden text-sm font-semibold tracking-tight whitespace-nowrap">
              Veil
            </span>
            <span className="md:hidden text-[var(--text-muted)]" aria-hidden="true">
              /
            </span>
            <h1 className="text-sm sm:text-base font-semibold truncate">{activeItem.label}</h1>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!isOnline && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)] pr-2">
                <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Offline</span>
              </span>
            )}
            <PWAInstallButton />
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              className="md:hidden min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg hover:bg-[var(--bg-subtle)]"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <Button
              variant="outline"
              size="sm"
              className="md:hidden"
              onClick={onLockVault}
              aria-label="Lock vault"
            >
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sr-only">Lock</span>
            </Button>
          </div>
        </header>

        {/* Scrollable Workspace */}
        <div className="flex-1 pb-20 md:pb-8 px-4 sm:px-6 py-5 max-w-6xl w-full mx-auto">
          {children}
        </div>
      </div>

      {/* Mobile Bottom Navigation Bar (52px height, total sticky <= 100px = <15% viewport) */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-[52px] border-t border-[var(--border-hairline)] bg-[var(--bg-surface)]/95 backdrop-blur-md grid grid-cols-5"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center min-h-[44px] text-[10px] font-medium transition-colors',
                  isActive
                    ? 'text-[var(--accent)] dark:text-[#7ac4d8]'
                    : 'text-[var(--text-muted)]',
                )
              }
            >
              <Icon className="h-4 w-4 mb-0.5" aria-hidden="true" />
              <span className="whitespace-nowrap">{item.shortLabel}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
};
