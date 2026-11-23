# Veil — Privacy-First, On-Device AI Workspace

Veil is an installable Progressive Web App (PWA) where all AI inference, OCR, document perspective correction, embeddings, and AES-256-GCM encryption execute strictly inside your browser. After initial model caching, zero user data or network telemetry ever leaves your device.

## Architecture & Folder Structure

```
src/
├── core/
│   ├── ai/           # Comlink Web Workers (WebLLM, Transformers.js, Tesseract), Model Catalog, Capabilities, Network Monitor
│   ├── crypto/       # Web Crypto AES-256-GCM, PBKDF2-SHA256 (650k iterations), WebAuthn passkey, in-memory key manager
│   ├── db/           # Dexie IndexedDB schema & transparent encrypted CRUD + backup export/import
│   └── pwa/          # Install prompt and online/offline status hooks
├── components/
│   ├── layout/       # AppShell, OnboardingFlow, LockScreen, PWAInstallButton
│   ├── models/       # Model Manager (Lite/Standard, WebGPU/WASM probe, Cache Storage controls)
│   ├── privacy/      # Live 0-request indicator, Air-Gap Lock, Airplane Mode Test, Backup/Wipe
│   ├── journal/      # Module 1: Encrypted Journal, GoEmotions classifier, embeddings, Recharts insights, streaming Weekly Reflection
│   └── scanner/      # Module 2: Capture (camera/PDF/OpenCV crop), OCR, Opus-MT Translate, JSON Summarize, Chrono Key Dates + .ics
└── types/            # Strict TypeScript interfaces across AI, Vault, Journal, and Scanner
```

## Setup Instructions

```bash
npm install
npm run dev          # Start local dev server on port 3000
npm run build        # Production build with strict CSP & PWA service worker
npm run preview      # Preview production PWA locally
npm run lint         # TypeScript strict check + ESLint
npm test             # Run Vitest unit tests
npm run test:e2e     # Run Playwright E2E tests (onboarding, journal, scanner, offline)
```

## Supported Browsers & Acceleration

- **Chrome / Edge (Desktop & Android):** Full WebGPU acceleration via WebLLM (`SmolLM2-360M` Lite or `Qwen2.5-1.5B` Standard) plus WASM fallbacks.
- **Safari (macOS / iOS) & Firefox:** Automatically detects when WebGPU is unavailable or restricted and falls back to Transformers.js WASM (`Qwen2.5-0.5B-Instruct` + `MiniLM` + `GoEmotions`) inside Web Workers.
- **Offline PWA:** Installable on Desktop, Android, and iOS Safari (`Add to Home Screen`). All UI bundles, `pdf.js` worker, `tesseract.js` WASM core, and `opencv.js` are self-hosted with zero external CDNs.

## Model Sizes (Cached Once in Browser Storage)

| Model | Tier | Backend | Approx. Size | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `SmolLM2-360M-Instruct-q4f16_1-MLC` | Lite | WebLLM (WebGPU) | ~260 MB | Fast reflections, JSON summaries, date labels |
| `Qwen2.5-1.5B-Instruct-q4f16_1-MLC` | Standard | WebLLM (WebGPU) | ~980 MB | Higher-accuracy structured JSON & reflections |
| `onnx-community/Qwen2.5-0.5B-Instruct` | Lite | Transformers.js (WASM) | ~390 MB | Cross-browser CPU fallback when WebGPU is absent |
| `MicahB/roberta-base-go_emotions` | Lite | Transformers.js (WASM) | ~125 MB | 28-emotion classification for Journal entries |
| `Xenova/all-MiniLM-L6-v2` | Lite | Transformers.js (WASM) | ~23 MB | Local 384-dim embeddings for semantic search |
| `Xenova/opus-mt-{src}-{tgt}` | Lite | Transformers.js (WASM) | ~78 MB / pair | On-demand one-pair-at-a-time document translation |
| Tesseract OCR Packs (`eng`, `spa`, `fra`, `deu`) | Lite | Tesseract WASM | ~11–12 MB each | Offline optical character recognition |

## Threat Model

### What IS Protected
- **Data at rest in IndexedDB:** Every journal entry, emotion score, document scan image, OCR text, summary, and embedding vector is encrypted with AES-256-GCM (unique 96-bit IV per write) before entering IndexedDB.
- **Key confidentiality:** Your encryption key is derived via PBKDF2-SHA256 (650,000 iterations) and kept strictly in JavaScript RAM—never written to `localStorage`, `sessionStorage`, cookies, or IndexedDB. Locking or closing the tab discards it.
- **Network exfiltration:** Strict CSP (`default-src 'self'`, zero third-party scripts, zero external fonts or CDNs) and an optional runtime Air-Gap Lock (`connect-src 'none'` mode) prevent outbound user data transmission.

### What is NOT Protected
- **Compromised device / malicious browser extensions:** If your OS or an installed browser extension has DOM/memory read access while the vault is unlocked, it can inspect unlocked UI state.
- **Weak passphrases:** Because there is no server-side rate limiting, a short or dictionary passphrase weakens offline brute-force resistance. Use a long, unique passphrase.
- **Forgotten passphrases:** Zero-knowledge means Veil cannot recover or reset a lost passphrase. Always export encrypted `.veil.json` backups periodically.

## Known Limitations
- **Mobile RAM constraints:** Standard 1.5B WebGPU models require ~1.6 GB VRAM and may hit browser memory limits on lower-RAM mobile devices; switch to the Lite tier in Model Manager if OOM occurs.
- **Storage eviction:** Browsers may evict Cache Storage under extreme disk pressure unless the site is installed as a PWA or granted persistent storage.
- **First-run model download:** Initial neural weights download from Hugging Face Hub (`huggingface.co`) and `tessdata.projectnaptha.com` once; after caching, enable Air-Gap Lock or Airplane Mode.
