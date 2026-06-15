# Helpers warehouse system

[![CI](https://github.com/amrhanygomaa/Inv_system/actions/workflows/ci.yml/badge.svg)](https://github.com/amrhanygomaa/Inv_system/actions/workflows/ci.yml)

Professional offline desktop system for warehouse, inventory, sales, purchasing, cashbox, returns, reports, and user permissions.

The application is built for Windows desktop deployment using Electron, React, TypeScript, Vite, and an encrypted local SQLite database.

**Current version: v3.0.0** — stable production release.

## Product Overview

`Helpers warehouse system` is a proprietary desktop application developed by Helpers Technologies for small and medium businesses that need an offline-first warehouse and sales workflow.

Core capabilities:

| Area | Details |
| --- | --- |
| Products and stock | Product catalog, stock levels, expiry tracking, and stock movements |
| Sales and purchasing | Sales invoices, purchase invoices, A4 printing, and PDF export |
| Customers and suppliers | Contact data, balances, account statements, and transaction history |
| Cashbox | Incoming and outgoing payments with daily operational tracking |
| Returns | Sales and purchase returns with automatic stock and balance updates |
| Reports | Business reports, employee commission reports, and Excel export |
| Alerts | Low stock, near-expiry, and overdue supplier payment alerts |
| Users and roles | Owner/admin setup, employee accounts, and permission-based access |
| Audit log | Full operation history with user, timestamp, and affected data |
| Backups | On-close and manual backup/restore with configurable destination folder |
| Feature gating | Per-client module enable/disable controlled by signed license and owner settings |

## Security Model

| Layer | Implementation |
| --- | --- |
| Database encryption | SQLCipher through `better-sqlite3-multiple-ciphers` |
| Password hashing | Argon2id |
| Runtime hardening | Context isolation, sandboxing, CSP, restricted preload bridge |
| Production packaging | ASAR packaging, Electron fuses, minified renderer build |
| License protection | Local machine-bound signed license tokens |
| Brute-force protection | Login and support-code rate limiting |

Production license material is intentionally not committed. Each local development or release machine must provide `electron/license-public-key.cjs` from a private channel.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Desktop shell | Electron 39 |
| Renderer | React 19, TypeScript 6, Tailwind CSS |
| Build tooling | Vite 8, electron-builder |
| Database | Encrypted SQLite |
| Native modules | `argon2`, `better-sqlite3-multiple-ciphers` |

## Requirements

- Windows 10/11 64-bit for the packaged desktop app
- Node.js 22 or newer
- npm 10 or newer

## Local Setup

Install dependencies:

```bash
npm install
```

Create the local license public key file:

```bash
copy electron\license-public-key.example.cjs electron\license-public-key.cjs
```

Replace the example key with the production public key when preparing a real release.

Run the renderer only:

```bash
npm run dev
```

Run the full desktop app in development:

```bash
npm run electron:dev
```

## Production Build

Build the Windows installer:

```bash
npm run dist:win
```

The installer is generated under `release/` using the `productName` and `version` from `package.json`.

Current artifact name:

```text
release/Helpers warehouse system-3.0.0-Setup.exe
```

Release artifacts, signing certificates, private keys, and client USB packages are not committed to this repository.

### License Studio

Generate and manage client licenses using the companion tool:

```bash
# Interactive GUI license generator
npm run license:studio

# CLI — generate a single license
npm run license:generate -- --machine <HTW-...> --client "Client Name" --expiry 2027-12-31

# CLI — generate with feature package
npm run license:generate -- --machine <HTW-...> --client "Client Name" --plan pro --features sales,purchases,inventory,customers,suppliers,cashbox,employees,reports,alerts,audit,categories,units,users

# Initialize a new Ed25519 keypair (run once)
npm run license:init
```

The license studio lives at `../helpers-warehouse-system-activate/`.

## Code Signing

The current internal distribution flow uses a self-signed Windows code-signing certificate owned by Helpers Technologies.

Keep these files outside the repository:

| File | Purpose |
| --- | --- |
| `.pfx` private certificate backup | Used by the developer to sign future releases |
| `.cer` public certificate | Installed on client machines to trust the publisher |
| Client USB package ZIP | Installer package prepared for field installation |

Never commit `.pfx`, `.cer`, private keys, generated releases, or customer-specific license data.

## Testing

```bash
# Full test suite (498 tests)
npm run test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage

# E2E (Playwright — requires built Electron app)
npm run test:e2e
```

**Current status:** 498/498 unit + component + integration ✅ | 5/5 E2E ✅

Test categories:

- `tests/unit/` — pure functions in `src/store/_pure.ts` and `src/lib/`
- `tests/component/` — React pages rendered in JSDOM
- `tests/integration/` — full data-flow probes using the real store
- `tests/e2e/` — full Electron process via Playwright

## Validation

Run the main checks before building or publishing changes:

```bash
npm run lint
npm run build
```

The GitHub Actions workflow runs the same checks on pull requests and pushes to `main`.

## Project Structure

```text
helpers-warehouse-system/
├── .github/              GitHub Actions and PR templates
├── build/                Application icons used by Electron Builder
├── docs/                 Installation and support documentation
├── electron/             Electron main process, preload, print bridge, license key example
├── public/               Static renderer assets
├── src/                  React application source
├── package.json          Scripts, dependencies, and Electron Builder config
└── vite.config.ts        Vite build configuration
```

## Client Installation

Arabic installation guidance for field technicians is available in:

```text
docs/client-installation-guide-ar.md
```

The client delivery package should be generated outside Git and copied to USB or secure offline storage.

## First Run

On first launch, the application starts with no default credentials. The owner/admin account must be created during initial setup, then the machine-bound license flow activates the deployment.

## Contact

| Item | Details |
| --- | --- |
| Company | Helpers Technologies |
| WhatsApp | [+201118445625](https://wa.me/201118445625) |
| Website | [helpers-tech.com](https://helpers-tech.com) |

## License

Proprietary. All rights reserved by Helpers Technologies.
