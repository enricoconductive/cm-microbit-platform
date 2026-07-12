# Inky:Bit development preview

This branch builds a development-only MakeCode target. It is visibly labelled
`DEVELOPMENT PREVIEW - Inky:Bit Image Editor`; it is not public MakeCode and
does not imply Microsoft or Pimoroni approval.

## Revisions

`inkybit-toolchain.json` is authoritative. Every preview manifest records:

- target revision: the workflow's exact `${GITHUB_SHA}`;
- target upstream base: `4b304c58999bd330bc37b7fb01577e6122760ae3`;
- extension revision: `39af70c3d257d65833c463641bb6eb963d64d09b`;
- pxt-core `13.0.1`, pxt-common-packages `14.0.2`, Node `22.23.1`, and npm `11.18.0`.

The manifest is published as `inkybit-preview-manifest.json` beside the editor.

## Clean local build

Clone the target and the exact extension revision, then build the routed static
package. The preview helper verifies the extension Git commit before adapting
only its `core` dependency to the target's sibling `libs/core` path.

```bash
git clone https://github.com/enricoconductive/pxt-microbit.git
cd pxt-microbit
git checkout feature/inkybit-image-editor-v1
git clone https://github.com/enricoconductive/pxt-inkybit.git libs/inkybit
git -C libs/inkybit checkout --detach 39af70c3d257d65833c463641bb6eb963d64d09b
nvm use
npm install --global npm@11.18.0
npm ci
cp pxtarget.json /tmp/pxtarget.json
npm run preview:prepare
npx pxt staticpkg --route pxt-microbit --output built/packaged --no-appcache
PREVIEW_TARGET_SHA="$(git rev-parse HEAD)" npm run preview:finalize
npm run preview:verify
npx puppeteer browsers install chrome-headless-shell
npm run preview:smoke
cp /tmp/pxtarget.json pxtarget.json
```

Serve `built/packaged` and open `/pxt-microbit/`. The deployable Pages artifact
root is `built/packaged/pxt-microbit`, because GitHub Pages already mounts that
artifact at the repository route.

## CI and deployment

`.github/workflows/deploy-preview.yml` runs on feature-branch pushes, pull
requests, and manual dispatch. It checks out the extension by full SHA, verifies
both Git revisions, runs extension, codec, native-loader and integration tests,
builds `built/packaged/pxt-microbit`, verifies the manifest and bundled consumer,
then boots the output in headless Chromium. Only a feature-branch `push` enters
the Pages deployment job.

Repository Settings -> Pages must use **GitHub Actions** before the deploy job can
publish. Until a successful Pages environment deployment exists, no public URL
should be claimed.

The feature-branch deployment is live at
`https://enricoconductive.github.io/pxt-microbit/`. Its adjacent
`inkybit-preview-manifest.json` is the source of truth for the revisions behind
the currently published preview.

## Browser journey and boundary

The automated browser smoke proves that the labelled editor boots, the exact
bundled `inkybit` package exposes `inkyimage_picker`, and the `inkyimage` field
bundle is loadable. On 12 July 2026 the generated package was also exercised in
Chromium through: new project -> Extensions -> bundled `inkybit` -> drag
full-screen image block -> open editor -> draw a pixel -> Done. A consumer call
compiled with zero Monaco diagnostics.

The full SVG drag/edit journey is not CI-gated because PXT/Blockly exposes the
flyout block as overlapping SVG paths and the locked Puppeteer Chromium is older
than the browser used for the manual journey, making pointer targeting unstable.
Persistence and native compile are instead deterministic gates:
`test:inkybit-persistence` verifies byte-exact save/reload and
`test:inkybit-integration` compiles the pinned extension with a full IBIT image.
Cloud sharing, login, and production compile-service parity are not provided by
the static preview.
