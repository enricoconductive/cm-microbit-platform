# Upstream Contribution: Custom Field Editor for Bitmap Images

This document describes the `inkyimage` custom field editor contributed to
`pxt-microbit` and what would be needed to upstream it as a generic
MakeCode capability.

## What was added

A custom Blockly field editor that provides a pixel-level image editor for
the Pimoroni Inky:Bit display (250×120 pixels, 3-colour: white, black, red).
The editor renders as a full-screen overlay inside the MakeCode editor and
supports drawing tools (pencil, eraser, line, rectangle, circle, text) with
a live preview in the block's thumbnail.

The editor produces a compact hex-encoded bitmap that is embedded directly
in the user's code via `hex\`...\`` literals.

## Files containing the contribution

| File | Purpose |
|------|---------|
| `fieldeditors/inkyImageField.ts` | `FieldBase` subclass; bridges Blockly ↔ editor overlay |
| `fieldeditors/inkyImageEditor.ts` | Self-contained HTML/CSS/JS overlay with all drawing tools |
| `fieldeditors/inkyBitFont.ts` | 5×5 bitmap font (pendolino3) for the text tool |
| `fieldeditors/extensions.ts` | Registration of the `"inkyimage"` selector with PXT |

Supporting codec (used by the above, but not new code):
`fieldeditors/inkyImageCodec.ts`.

## PXT core capabilities used

- **`FieldBase`** (`pxt.blocks.FieldBase`) — base class for custom fields;
  provides `getValue()`, `setValue()`, `createMainElement_()`, and editor
  lifecycle hooks.
- **Blockly integration** — the field constructs a DOM element that Blockly
  positions; it listens for Blockly selection events to open/close the
  editor overlay.
- **`pxt.editor.initFieldExtensionsAsync`** — the entry point PXT calls to
  discover custom field editors at startup.

## What would change to make this generic

1. **Remove Inky:Bit-specific constants** — replace the hardcoded 250×120
   dimensions and 3-colour palette with configurable parameters passed
   through the field definition (e.g. `{ width: 128, height: 64, palette: ['#000','#fff','#f00','#0f0'] }`).

2. **Configurable palette** — the colour map in `COLOUR_MAP` (field and
   editor) should accept an arbitrary `Record<number, string>` from the
   block definition.

3. **Font data** — `inkyBitFont.ts` embeds the micro:bit V2 pendolino3
   bitmap. A generic version would either make the font pluggable or ship
   a default 5×5 font and allow overrides.

4. **Encoding format** — the current encoder packs pixels into a dense
   byte stream specific to 3-colour. A generic editor would need to
   support variable colour depths (2-bit, 4-bit) or leave encoding to
   the target package.

5. **File naming** — rename files from `inky*` to something like
   `bitmapImageField`, `bitmapImageEditor`, etc.

6. **Tests** — add round-trip encode/decode tests, editor render tests,
   and Blockly integration tests (see below).

## Suggested test plan for an upstream PR

| Test | Description |
|------|-------------|
| Encode/decode round-trip | Verify `encodeInkyBitImage(decodeInkyBitImage(data)) === data` for a set of known bitmaps and random bitmaps. |
| Edge dimensions | Encode images at minimum (1×1) and maximum sizes; ensure no buffer overflows. |
| Font glyph coverage | Render every ASCII character (32–126) and verify the bitmap matches the expected 5×5 pattern. |
| Field value persistence | Open the editor, draw, save, re-open — verify the value round-trips through Blockly XML serialisation. |
| Thumbnail rendering | Verify `renderPixelsToCanvas` produces a canvas of the expected dimensions. |
| Cross-browser overlay | Open the editor overlay in Chromium, Firefox, and Safari; verify the canvas is interactive and closes cleanly. |
| Static package smoke test | Run `pxt staticpkg` and open the generated `built/index.html`; verify the block can be dragged and the editor opens. |

## Notes

This contribution is provided as a reference implementation, not as a
ready-to-merge upstream PR. A proper upstream submission would require
agreement from the MakeCode team on the generic API surface and likely
a design discussion per the [CONTRIBUTING.md](CONTRIBUTING.md) guidelines.
