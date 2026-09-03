# Conductive Music MakeCode: building and deploying

This branch builds Conductive Music's self-hosted MakeCode editor for the
micro:bit. It is not public MakeCode and does not imply Microsoft or Pimoroni
approval.

## Revisions

`inkybit-toolchain.json` is authoritative. It pins:

- the target's upstream base (`microsoft/pxt-microbit`), pxt-core, and
  pxt-common-packages;
- the Inky:Bit extension (`enricoconductive/cm-inkybit`) by full commit SHA,
  under `extension`;
- the CM music blocks extension (`enricoconductive/cm-music-blocks`) by full
  commit SHA, under `musicBlocks`;
- Node `22.23.1` and npm `11.18.0`.

Every build publishes `inkybit-preview-manifest.json` beside the editor with
the exact target commit and both extension commits.

## Clean local build

Clone the target and both extensions at their pinned revisions, then build the
routed static package. `preview:prepare` verifies each extension's Git commit
before adapting only its `core` dependency to the target's sibling `libs/core`
path.

```bash
git clone https://github.com/enricoconductive/cm-microbit-platform.git
cd cm-microbit-platform
git checkout feature/inkybit-image-editor-v1
git clone https://github.com/enricoconductive/cm-inkybit.git libs/inkybit
git -C libs/inkybit checkout --detach "$(node -p 'require("./inkybit-toolchain.json").extension.commit')"
git clone https://github.com/enricoconductive/cm-music-blocks.git libs/cm-music-blocks
git -C libs/cm-music-blocks checkout --detach "$(node -p 'require("./inkybit-toolchain.json").musicBlocks.commit')"
nvm use
npm install --global npm@11.18.0
npm ci
cp pxtarget.json /tmp/pxtarget.json
npm run preview:prepare
npx pxt staticpkg --route cm-microbit-platform --output built/packaged --no-appcache
PREVIEW_TARGET_SHA="$(git rev-parse HEAD)" npm run preview:finalize
npm run preview:verify
npm run test:preview-pin
npx puppeteer browsers install chrome-headless-shell
npm run preview:smoke
cp /tmp/pxtarget.json pxtarget.json
```

Serve `built/packaged` and open `/cm-microbit-platform/`. The deployable Pages
artifact root is `built/packaged/cm-microbit-platform`, because GitHub Pages
mounts that artifact at the repository route.

Both `libs/inkybit/` and `libs/cm-music-blocks/` are git-ignored clones. To
work on the blocks themselves, edit and commit in the extension repository,
push, then move the pin in `inkybit-toolchain.json` to the new SHA.

## CI and deployment

`.github/workflows/deploy-preview.yml` runs on feature-branch pushes, pull
requests, and manual dispatch. It checks out both extensions by full SHA,
verifies all three Git revisions, runs the Inky:Bit extension, codec,
native-loader and integration tests, compiles the CM music blocks against the
public micro:bit target, builds `built/packaged/cm-microbit-platform`,
verifies the manifest and bundled packages, then boots the output in headless
Chromium. Only a feature-branch `push` enters the Pages deployment job.

Repository Settings -> Pages must use **GitHub Actions** before the deploy job
can publish.

The feature-branch deployment is live at
`https://enricoconductive.github.io/cm-microbit-platform/`. Its adjacent
`inkybit-preview-manifest.json` is the source of truth for the revisions behind
the currently published editor.

## Editor customisation

`tools/prepare-inkybit-preview.mjs` rewrites `pxtarget.json` for the build
(name, title, home URL, bundled extension list). `tools/finalize-inkybit-preview.mjs`
copies `docs/static/cm-toolbox.css`, `cm-branding.js`, `cm-share.js` and
`share.html` beside the editor and links them from `index.html`.
`cm-toolbox.css` replaces the CM category's fallback glyph with the Conductive
Music waveform mark; `theme/style.less` carries the header branding.

## Browser journey and boundary

The automated browser smoke boots the editor and exercises: home page ->
new project -> C Music category present with the waveform mark -> Inky:Bit
category -> drag full-screen image block -> open editor -> draw a pixel ->
Done. It also checks the preview manifest against the exact toolchain pins
before the journey. Persistence and native compile are additional
deterministic gates: `test:inkybit-persistence` verifies byte-exact
save/reload and `test:inkybit-integration` compiles the pinned extension with
a full IBIT image. Cloud sharing, login, and production compile-service parity
are not provided by the static build.
