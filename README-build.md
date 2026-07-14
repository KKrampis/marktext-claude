# MarkText — Build & Release Guide

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | ≥ 20.19.0 | https://nodejs.org |
| pnpm | ≥ 10 | `npm install -g pnpm` |
| Python | 3.12 | required by native module builds |
| Git | any | https://git-scm.com |

### Linux only
```bash
sudo apt-get install -y icnsutils graphicsmagick xz-utils \
  libx11-dev libxkbfile-dev gnome-keyring libsecret-1-dev \
  libfontconfig-dev rpm
```

### macOS only
Builds are **unsigned** (no Apple Developer ID). After installing, clear the quarantine flag once:
```bash
xattr -cr /Applications/marktext.app
```

---

## Install dependencies

```bash
git clone https://github.com/KKrampis/marktext-claude.git
cd marktext-claude
pnpm install
```

`pnpm install` automatically runs the postinstall script which:
- Downloads the Electron binary
- Applies patches via patch-package
- Rebuilds native modules (electron-rebuild)
- Minifies locale files

---

## Development

```bash
pnpm run dev
```

The renderer hot-reloads automatically via Vite HMR. Changes to the main
process require restarting `pnpm run dev`. Press `Ctrl+R` in the app window
to reload the renderer and re-run the preload script.

---

## Build for production

```bash
pnpm run build:linux    # AppImage, snap, deb, rpm, tar.gz → dist/
pnpm run build:mac      # DMG + zip (x64 + arm64) → dist/
pnpm run build:win      # NSIS installer + zip (x64) → dist/

# Single architecture (macOS / Windows)
pnpm run build:mac:x64
pnpm run build:mac:arm64
pnpm run build:win:x64
pnpm run build:win:arm64
```

All platform build scripts run `minify-locales` and `electron-rebuild`
before packaging. Output lands in the repo-root `dist/` directory.

---

## Run tests

```bash
pnpm run test          # all unit tests (Vitest)
pnpm run test:e2e      # end-to-end tests (Playwright)
pnpm run lint          # ESLint — run before committing
pnpm run typecheck     # vue-tsc --noEmit
```

---

## GitHub Actions CI

| Workflow | Trigger | What it does |
|---|---|---|
| `build.yml` | Pull request | Builds all platforms, posts artifact links as a PR comment |
| `lint.yml` | Pull request | ESLint + typecheck |
| `test.yml` | Pull request | Unit tests |
| `e2e.yml` | Pull request | Playwright end-to-end tests |
| `release.yml` | `v*` tag push | Builds all platforms and publishes a GitHub Release |
| `auto-release.yml` | Push to `develop` | Builds all platforms and publishes a pre-release automatically |

---

## Creating a tagged release

Push a semantic version tag — the `release.yml` workflow builds all
platforms and publishes a public GitHub Release automatically:

```bash
# Bump version in package.json first, then:
git tag v0.20.0
git push origin v0.20.0
```

Pre-releases use a hyphen suffix:
```bash
git tag v0.20.0-beta.1
git push origin v0.20.0-beta.1
```

---

## Automatic pre-release on every `develop` push

The `auto-release.yml` workflow runs on every push to `develop`. It:
1. Builds all platforms in parallel
2. Tags the commit as `nightly-YYYYMMDD-<sha>`
3. Publishes a pre-release named **Nightly** on GitHub Releases,
   replacing the previous nightly automatically

No manual tagging needed — just push to `develop`.

---

## Claude Code integration (this fork)

This fork adds a **Claude explain panel** to the editor. Requirements:

- [Claude Code CLI](https://claude.ai/code) installed and authenticated
- `claude -p "hello"` must return a response from the terminal

### Usage

1. Open a markdown file in MarkText
2. Select any text
3. Press `Ctrl+Shift+E` (or `Cmd+Shift+E` on Mac), or click the chat icon at the bottom of the sidebar
4. Click **Explain selection** in the right panel
5. Optionally click **Save to README-build.md** to append the explanation to this file

Switch to the **terminal tab** (the `>_` icon in the panel header) to start
an interactive Claude Code session inside the editor.
