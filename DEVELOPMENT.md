# Development: Self-hosted MakeCode Target

This document explains how to clone, build, and deploy the Inky:Bit
self-hosted MakeCode target.

## Prerequisites

- **Node.js 22.x** (see `.nvmrc` for the exact version)
- **npm 11.x** (bundled with Node 22)

```bash
# If using nvm:
nvm use          # reads .nvmrc → 22.23.1

# Verify:
node -v          # v22.x
npm -v           # 11.x
```

## Clone and install

```bash
git clone https://github.com/Pimoroni/pxt-microbit.git
cd pxt-microbit
git checkout feature/inkybit-image-editor-v1
npm ci
```

`npm ci` installs the exact versions from `package-lock.json` and is
recommended over `npm install` for reproducible builds.

## Load the Inky:Bit extension

The Inky:Bit extension is already bundled in this fork. The field editor
registration lives in `fieldeditors/extensions.ts` and is compiled into
`built/fieldeditors.js` during the normal build.

If you need to modify the extension source:

```bash
# The field editor TypeScript files:
ls fieldeditors/
# extensions.ts            – PXT field registration
# inkyImageField.ts        – Blockly field subclass
# inkyImageEditor.ts       – pixel editor overlay
# inkyBitFont.ts           – 5×5 bitmap font data
# inkyImageCodec.ts        – encode/decode helpers
```

## Run the editor locally

```bash
npx pxt serve
```

This starts a local dev server (default `https://localhost:3232`) with
live-reload. The browser opens the MakeCode editor; the Inky:Bit blocks
appear under the Extensions menu.

## Build a static package

To produce a self-contained HTML/JS/CSS build in `built/`:

```bash
npx pxt staticpkg
```

The output in `built/` can be served by any static file server or
deployed to GitHub Pages.

## Deploy to GitHub Pages

Deploys are handled by the GitHub Actions workflow in
`.github/workflows/deploy-preview.yml`.

**Trigger:** push to `feature/inkybit-image-editor-v1`.

**What it does:**
1. Checks out the code
2. Sets up Node.js 22
3. Runs `npm ci`
4. Runs `npx pxt staticpkg`
5. Deploys `built/` to GitHub Pages via `actions/deploy-pages@v4`

**Enabling GitHub Pages:** In the repository settings, set the Pages
source to "GitHub Actions" (not "Deploy from a branch").

The deployed URL will be shown in the Actions deployment summary.

## Run tests

```bash
# Inky:Bit codec unit tests
npm run test:inkybit-codec

# Integration build test (requires pxt buildtarget to have run first)
npm run test:inkybit-integration
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `pxt: command not found` | `npm install -g pxt` or use `npx pxt` |
| Build fails with OOM | Increase Node memory: `NODE_OPTIONS=--max-old-space-size=4096 npx pxt buildtarget` |
| GitHub Pages deploy 404 | Ensure Pages source is set to "GitHub Actions" in repo settings |
| Field editor not showing | Check `built/fieldeditors.js` exists; clear browser cache |
