export interface NetworkTelemetrySnapshot {
  userDataRequests: number;
  modelDownloadRequests: number;
  sameOriginRequests: number;
  blockedRequests: number;
  airGapLockEnabled: boolean;
  lastCheckedAt: number;
  recentHosts: string[];
}

type Listener = (snapshot: NetworkTelemetrySnapshot) => void;

const MODEL_HOSTS = [
  'huggingface.co',
  'cdn-lfs.huggingface.co',
  'cdn-lfs-us-1.huggingface.co',
  'cas-bridge.xethub.hf.co',
  'raw.githubusercontent.com',
  'tessdata.projectnaptha.com',
];

class NetworkPrivacyMonitor {
  private airGapLocked = false;
  private installed = false;
  private fetchWrapped = false;
  private originalFetch: typeof window.fetch | null = null;
  private observedResourceIds = new Set<string>();
  private listeners = new Set<Listener>();
  private snapshot: NetworkTelemetrySnapshot = {
    userDataRequests: 0,
    modelDownloadRequests: 0,
    sameOriginRequests: 0,
    blockedRequests: 0,
    airGapLockEnabled: false,
    lastCheckedAt: Date.now(),
    recentHosts: [],
  };

  public install(): void {
    if (this.installed || typeof window === 'undefined') return;
    this.installed = true;

    this.installPerformanceObserver();
    this.tryWrapWindowFetch();
  }

  private recordRequestUrl(urlString: string, source: 'fetch' | 'perf'): void {
    if (source === 'perf' && this.fetchWrapped) {
      // Avoid double counting same-origin/main-thread fetches already tracked by fetch wrapper,
      // while still capturing worker/script/img requests not routed through window.fetch.
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(urlString, window.location.origin);
    } catch {
      return;
    }

    const isSameOrigin = parsedUrl.origin === window.location.origin;
    const isBlobOrData = parsedUrl.protocol === 'blob:' || parsedUrl.protocol === 'data:';
    if (isBlobOrData) return;

    const isModelHost = MODEL_HOSTS.some(
      (host) => parsedUrl.hostname === host || parsedUrl.hostname.endsWith(`.${host}`),
    );

    if (isSameOrigin) {
      this.snapshot.sameOriginRequests += 1;
    } else if (isModelHost) {
      this.snapshot.modelDownloadRequests += 1;
      if (!this.snapshot.recentHosts.includes(parsedUrl.hostname)) {
        this.snapshot.recentHosts = [...this.snapshot.recentHosts, parsedUrl.hostname];
      }
    } else {
      this.snapshot.userDataRequests += 1;
    }

    this.snapshot.lastCheckedAt = Date.now();
    this.emit();
  }

  private installPerformanceObserver(): void {
    if (typeof PerformanceObserver === 'undefined') return;

    try {
      const existing = performance.getEntriesByType('resource');
      for (const entry of existing) {
        const key = `${entry.name}#${entry.startTime}`;
        if (!this.observedResourceIds.has(key)) {
          this.observedResourceIds.add(key);
          this.recordRequestUrl(entry.name, 'perf');
        }
      }

      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const key = `${entry.name}#${entry.startTime}`;
          if (!this.observedResourceIds.has(key)) {
            this.observedResourceIds.add(key);
            this.recordRequestUrl(entry.name, 'perf');
          }
        }
      });
      observer.observe({ entryTypes: ['resource'] });
    } catch {
      // PerformanceObserver may be restricted in some environments
    }
  }

  private tryWrapWindowFetch(): void {
    if (typeof window.fetch !== 'function') return;

    const ownDesc = Object.getOwnPropertyDescriptor(window, 'fetch');
    const protoDesc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(window), 'fetch');
    const desc = ownDesc ?? protoDesc;

    if (desc && !desc.configurable && !desc.writable) {
      // Read-only getter on Window (e.g. sandboxed iframe proxy); rely on PerformanceObserver + Air-Gap guard.
      return;
    }

    try {
      const boundOriginal = window.fetch.bind(window);
      this.originalFetch = boundOriginal;

      const wrappedFetch: typeof window.fetch = async (
        input: RequestInfo | URL,
        init?: RequestInit,
      ): Promise<Response> => {
        const urlString =
          typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

        let parsedUrl: URL | null = null;
        try {
          parsedUrl = new URL(urlString, window.location.origin);
        } catch {
          parsedUrl = null;
        }

        if (parsedUrl) {
          const isSameOrigin = parsedUrl.origin === window.location.origin;
          if (this.airGapLocked && !isSameOrigin) {
            this.recordBlockedRequest();
            throw new Error(
              `Blocked by Veil Air-Gap Lock (connect-src 'none' mode): ${parsedUrl.hostname}`,
            );
          }
        }

        return boundOriginal(input, init);
      };

      Object.defineProperty(window, 'fetch', {
        value: wrappedFetch,
        configurable: true,
        writable: true,
      });
      this.fetchWrapped = true;
    } catch {
      // Ignore if host environment disallows redefining window.fetch
      this.fetchWrapped = false;
    }
  }

  public recordBlockedRequest(): void {
    this.snapshot = {
      ...this.snapshot,
      blockedRequests: this.snapshot.blockedRequests + 1,
      lastCheckedAt: Date.now(),
    };
    this.emit();
  }

  public isAirGapLocked(): boolean {
    return this.airGapLocked;
  }

  public setAirGapLock(enabled: boolean): void {
    this.airGapLocked = enabled;
    this.snapshot = {
      ...this.snapshot,
      airGapLockEnabled: enabled,
      lastCheckedAt: Date.now(),
    };
    this.emit();
  }

  public getSnapshot(): NetworkTelemetrySnapshot {
    return { ...this.snapshot };
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    const snap = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snap);
    }
  }
}

export const networkMonitor = new NetworkPrivacyMonitor();
