import { Download, X } from 'lucide-react';
import React, { useState } from 'react';
import { Button } from '@/src/components/ui/button';
import { usePWAInstall } from '@/src/core/pwa/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <Button
        onClick={() => {
          void install();
        }}
        variant="outline"
        size="sm"
        aria-label="Install Veil as an offline app"
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        <span>Install App</span>
      </Button>
    );
  }

  if (isIOS) {
    return (
      <>
        <Button
          onClick={() => setShowIOSGuide(true)}
          variant="outline"
          size="sm"
          aria-label="How to install Veil on iOS"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          <span>Install</span>
        </Button>

        {showIOSGuide && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          >
            <div className="w-full max-w-sm rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6">
              <div className="flex items-center justify-between">
                <h2 id="ios-install-title" className="text-base font-semibold">
                  Install Veil on iPhone / iPad
                </h2>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Close installation guide"
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg hover:bg-[var(--bg-subtle)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <ol className="mt-3 space-y-2 text-sm text-[var(--text-secondary)] list-decimal list-inside">
                <li>Tap the Share icon in the Safari toolbar.</li>
                <li>Scroll down and tap Add to Home Screen.</li>
                <li>Launch Veil from your home screen for offline use.</li>
              </ol>
              <Button
                className="mt-5 w-full"
                variant="secondary"
                onClick={() => setShowIOSGuide(false)}
              >
                Done
              </Button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
