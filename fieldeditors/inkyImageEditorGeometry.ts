import { FONT_DATA, FONT_START, FONT_END } from "./inkyBitFont";

export interface InkyViewportTransform {
    zoom: number;
    panX: number;
    panY: number;
}

export interface InkyTextPlacement {
    ch: string;
    x: number;
    y: number;
    width: number;
}

export function getInkyCharBitmap(ch: string): number[] | null {
    const code = ch.charCodeAt(0);
    if (code < FONT_START || code > FONT_END) return null;
    const idx = (code - FONT_START) * 5;
    return FONT_DATA.slice(idx, idx + 5);
}

/** Mirrors the native getCharWidth shim, including its two-pixel blank glyph. */
export function getInkyCharWidth(ch: string): number {
    const bmp = getInkyCharBitmap(ch);
    if (!bmp) return 5;
    const usedColumns = bmp[0] | bmp[1] | bmp[2] | bmp[3] | bmp[4];
    if (usedColumns & 1) return 5;
    if (usedColumns & 2) return 4;
    if (usedColumns & 4) return 3;
    return 2;
}

export function getInkyCharAdvance(ch: string, scale: number): number {
    return (getInkyCharWidth(ch) + 1) * scale;
}

/** Uses the same width check, six-pixel line height and one-pixel gap as drawText. */
export function layoutInkyText(
    text: string, startX: number, startY: number, scale: number, imageWidth: number,
): InkyTextPlacement[] {
    const placements: InkyTextPlacement[] = [];
    let x = startX;
    let y = startY;
    for (const ch of text) {
        const width = getInkyCharWidth(ch) * scale;
        if (x + width >= imageWidth) {
            y += 6 * scale;
            x = startX;
        }
        placements.push({ ch, x, y, width });
        x += getInkyCharAdvance(ch, scale);
    }
    return placements;
}

export function clampInkyViewport(
    viewportWidth: number, viewportHeight: number,
    imageWidth: number, imageHeight: number,
    transform: InkyViewportTransform,
): InkyViewportTransform {
    const scaledWidth = imageWidth * transform.zoom;
    const scaledHeight = imageHeight * transform.zoom;
    const panX = scaledWidth <= viewportWidth
        ? (viewportWidth - scaledWidth) / 2
        : Math.max(viewportWidth - scaledWidth, Math.min(0, transform.panX));
    const panY = scaledHeight <= viewportHeight
        ? (viewportHeight - scaledHeight) / 2
        : Math.max(viewportHeight - scaledHeight, Math.min(0, transform.panY));
    return { zoom: transform.zoom, panX, panY };
}

export function fitInkyViewport(
    viewportWidth: number, viewportHeight: number, imageWidth: number, imageHeight: number,
): InkyViewportTransform {
    const zoom = Math.min(viewportWidth / imageWidth, viewportHeight / imageHeight);
    return clampInkyViewport(viewportWidth, viewportHeight, imageWidth, imageHeight, {
        zoom, panX: 0, panY: 0,
    });
}
