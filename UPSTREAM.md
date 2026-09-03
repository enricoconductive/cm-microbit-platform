# Upstream delivery: Inky:Bit image field

This is a ready-to-review proposal description, not a claim that Microsoft has
accepted or deployed the change.

## Proposed pxt-microbit PR

**Title:** Add a versioned Inky:Bit full-screen image field

**Problem:** `pxt-inkybit` needs a block field that edits a 250x120 three-colour
bitmap while preserving a compact, stable value that the extension can decode
on hardware. A text fallback would expose a 15,020-character literal and is not
an acceptable reduced editor.

**Target-only change:**

| File | Responsibility |
| --- | --- |
| `fieldeditors/inkyImageCodec.ts` | IBIT v1 validation, encode/decode and hex literal boundary |
| `fieldeditors/inkyImageField.ts` | Blockly value/thumbnail/editor lifecycle only |
| `fieldeditors/inkyImageEditor.ts` | Drawing UI and tools |
| `fieldeditors/inkyImageEditorGeometry.ts` | Viewport transforms and clamped pan geometry |
| `fieldeditors/inkyBitFont.ts` | Fixed 5x5 text glyph data |
| `fieldeditors/extensions.ts` | Registers selector `inkyimage` |
| `tests/inkybit-codec/*` | Golden, malformed, round-trip and literal tests |
| `tests/inkybit-editor/*` | Geometry and field lifecycle regressions |

No Pimoroni C++ driver, SPI code, package source, or hardware dependency belongs
in the target PR. Capacity benchmarks and the extension integration fixture are
review evidence, not required upstream production files.

## Stable interface

- Selector: `inkyimage`.
- Serialized value: `hex` literal containing IBIT v1 bytes.
- Header: magic `IBIT`, version `1`, palette `1`, width `250`, height `120`.
- Payload: 30,000 two-bit pixels packed four per byte; total 7,510 bytes.
- Colours: `0` white, `1` black, `2` accent red; `3` is rejected.
- Unknown version, palette, dimensions, length, or colour is rejected; there is
  no silent fallback.
- `decompileLiterals=true` and parent-block ownership preserve Blocks/XML to
  TypeScript round trips.

The concrete consumer is
`enricoconductive/cm-inkybit@9474207126c4e33b670dac54973d0a803772e3c9`:
`drawFullScreenImage(data: Buffer)` declares `data.shadow=inkyimage_picker`, and
the hidden identity block declares `image.fieldEditor="inkyimage"`.

## Review commits and verification

The feature branch is based on upstream commit
`4b304c58999bd330bc37b7fb01577e6122760ae3`. The target implementation is kept
in reviewable layers:

1. `ded7dc40` - IBIT v1 codec foundation.
2. `96eb14bd` - field lifecycle and placeholder editor.
3. `f2420b09` - drawing tools and full editor.
4. `f854c9e6` - pinned consumer integration and capacity evidence.

Run before submission:

```bash
npm ci
npm run test:inkybit-codec
npm run test:inkybit-persistence
npm run test:inkybit-integration
```

The delivery workflow additionally builds the exact consumer into a static
target and browser-boots the result from a clean checkout.

## Maintainer decisions requested

1. Is a product-specific selector acceptable in `pxt-microbit`, or should the
   codec/editor become a configurable generic bitmap field first?
2. If generic, which options are supported ABI: dimensions, palette, encoding,
   font, maximum encoded length?
3. Should the editor remain in target `fieldeditors`, or move to pxt-core after
   another consumer exists?

The smallest safe first PR is the target-only selector above. Generalising
before an API contract is agreed would expand scope and risk changing the stable
IBIT v1 format. If maintainers require a generic field, split that design into a
separate prerequisite PR and keep the Inky:Bit codec adapter target-local.

## Extension release gate

Do not merge/tag/publish the selector consumer on public `pxt-inkybit/master`
until the capability is accepted and released in a public micro:bit target, the
extension pin is updated to that release, and the edit/save/reopen/compile browser
journey passes there. The detailed checklist lives in
`pxt-inkybit/docs/IMAGE_EDITOR_RELEASE.md`.
