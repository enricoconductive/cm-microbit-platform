# Ticket 05 verification status

## Automated passes

- The extension native-loader host test consumes the same deterministic editor
  fixture as an IBIT source buffer and compares both 4,250-byte native bitplanes
  byte-for-byte. Reserved colour input is rejected before buffer mutation.
- The pinned integration project compiles the full-screen literal, native
  loader, later rectangle/text calls, and one final refresh.
- `results/latest.json` preserves the 1/2/4/8/64 compile matrix. Four and eight
  independent inline images compile; 64 produces MakeCode's normal
  `TS9283: program too big` diagnostic.
- `results/persistence-latest.json` preserves byte-exact headless model load,
  edit, save, and reload timing for 1/2/4/8 images.
- `pxt staticpkg --output /tmp/inkybit-staticpkg` exits successfully and
  produces an `index.html`.

## Browser and preview gate

The local target itself loads in Chromium with no page errors. The exact
feature extension cannot yet be loaded reproducibly by the current preview:

- A GitHub URL suffixed with `#<commit>` installed public `v0.0.5`; the feature
  block was absent because the fragment is not retained by the extension UI.
- A `/tree/feature/inkybit-image-editor-v1` URL was interpreted as a package
  subdirectory and failed with GitHub 404 responses.
- Direct `github:owner/repo#commit` search recognised the already-installed
  public package rather than updating it.

Therefore block-open/edit/save/reload browser latency and the full editor smoke
journey are not claimed as passed. The preview must bundle/pin the feature
extension or expose a resolvable preview ref before this gate can be rerun.

The existing Pages workflow also uploads `built/`, while `pxt staticpkg`
defaults to `built/packaged/`; `built/` has no root `index.html`. The target has
no explicit preview/development label. `UPSTREAM.md` describes a reference
proposal but does not contain the focused decompiler/browser tests required for
a ready-to-submit upstream patch. These are Ticket 06 delivery blockers, not
public-release claims.

## Physical user-action gate

No hardware result is claimed. Follow the exact generator, flashing steps, and
observation checklist in the pinned extension's
`fixtures/ibit-v1/HARDWARE.md`, then attach pass/fail observations and photos.
