# Inky:Bit Image Designer

Conductive Music MakeCode includes Inky:Bit as a built-in capability. New Blocks and JavaScript projects already contain the **Inky:Bit** category, so no Extensions installation is required.

## Create an image

1. Create a new project and open **Inky:Bit** in the toolbox.
2. Drag **draw image** into the workspace.
3. Select the image thumbnail in that block.
4. Draw using White, Black, or Red, then choose **Done** to save the image into the block.
5. Add **display your changes** after the image block when the physical e-ink display should refresh.

The image is 250 × 120 pixels. It replaces the drawable Inky:Bit image buffer but does not automatically refresh the display, allowing additional drawing blocks to run first.

## Workspace behaviour

The designer keeps the normal MakeCode header visible so Home, sharing, help, and platform navigation stay available. The designer then uses the entire workspace below that header instead of appearing as a small dimmed modal.

- The canvas expands to the remaining workspace and refits when the window changes size.
- The tool rail contains Pencil, Eraser, Line, Rectangle, Circle, Text, and Pan.
- The inspector provides the Inky:Bit palette, image preview, and text controls.
- On compact screens, the rail becomes horizontal and the inspector moves below the canvas so the canvas remains the primary surface.

## Visual integration

The editor deliberately uses the surrounding Conductive Music MakeCode styling rather than a separate visual system. Its font, panels, borders, focus rings, selected tools, and primary **Done** action read MakeCode theme variables. This means theme or accessibility changes in the host editor propagate to the image designer without changing the Inky:Bit image data or the hardware palette.

White, Black, and Red remain fixed image colours because they describe the Inky:Bit display itself; they are not branding choices.

## Save and recovery

- **Done** encodes the current pixels into the block and closes the designer.
- Reopening the thumbnail restores the saved pixels.
- **Cancel** closes immediately when nothing changed; after edits it asks before discarding them.
- Undo and redo are editor-local. They do not create additional MakeCode project history entries until **Done** saves the image.

## Development verification

The preview smoke test exercises the full journey: create a project, find Inky:Bit without Extensions, open `draw image`, edit, save, reopen, and discard. It additionally checks that the persistent header remains visible, the editor occupies the workspace below it, the legacy dimmed backdrop is absent, and the compact layout retains a usable canvas and inspector.

Run the packaged preview checks with:

```sh
npm run preview:prepare
npx pxt staticpkg --route pxt-microbit --output built/packaged --no-appcache
npm run preview:finalize
npm run preview:verify
npm run preview:smoke
```
