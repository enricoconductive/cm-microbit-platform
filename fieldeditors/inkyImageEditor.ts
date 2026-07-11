/**
 * Inky:Bit 250×120 pixel image editor for MakeCode.
 *
 * Self-contained HTML overlay that manages its own DOM, event listeners,
 * and state.  When Done/Cancel is chosen the overlay is torn down and the
 * field's setValue() callback is invoked.
 */

import {
    IBIT_WIDTH, IBIT_HEIGHT, IBIT_PIXEL_COUNT,
    encodeInkyBitImage, encodedImageToHexLiteral,
} from "./inkyImageCodec";
import { FONT_DATA, FONT_START, FONT_END } from "./inkyBitFont";

// ── colour helpers ───────────────────────────────────────────────────
const COLOUR_MAP: Record<number, string> = {
    0: "#ffffff",
    1: "#000000",
    2: "#d32020",
};

type Tool = "pencil" | "eraser" | "line" | "rect" | "circle" | "text" | "pan";

// ── Bresenham line ───────────────────────────────────────────────────
function bresenhamLine(
    x0: number, y0: number, x1: number, y1: number,
    cb: (x: number, y: number) => void,
) {
    let dx = Math.abs(x1 - x0);
    let dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    while (true) {
        cb(x0, y0);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x0 += sx; }
        if (e2 < dx) { err += dx; y0 += sy; }
    }
}

// ── midpoint ellipse ─────────────────────────────────────────────────
function midpointEllipse(
    cx: number, cy: number, rx: number, ry: number,
    cb: (x: number, y: number) => void,
) {
    if (rx <= 0 || ry <= 0) return;
    let x = 0; let y = ry;
    let d1 = ry * ry - rx * rx * ry + rx * rx / 4;
    while (2 * ry * ry * x <= 2 * rx * rx * y) {
        cb(cx + x, cy + y); cb(cx - x, cy + y);
        cb(cx + x, cy - y); cb(cx - x, cy - y);
        x++;
        if (d1 < 0) d1 += 2 * ry * ry * x + ry * ry;
        else { y--; d1 += 2 * ry * ry * x - 2 * rx * rx * y + ry * ry; }
    }
    let d2 = ry * ry * (x + 0.5) * (x + 0.5) + rx * rx * (y - 1) * (y - 1) - rx * rx * ry * ry;
    while (y >= 0) {
        cb(cx + x, cy + y); cb(cx - x, cy + y);
        cb(cx + x, cy - y); cb(cx - x, cy - y);
        y--;
        if (d2 > 0) d2 -= 2 * rx * rx * y + rx * rx;
        else { x++; d2 += 2 * ry * ry * x - 2 * rx * rx * y + rx * rx; }
    }
}

// ── font helpers ─────────────────────────────────────────────────────
function getCharBitmap(ch: string): number[] | null {
    const code = ch.charCodeAt(0);
    if (code < FONT_START || code > FONT_END) return null;
    const idx = (code - FONT_START) * 5;
    return FONT_DATA.slice(idx, idx + 5);
}

/** Returns the advance width (1–5) of a character. */
function charWidth(ch: string): number {
    const bmp = getCharBitmap(ch);
    if (!bmp) return 5;
    // Check from right: column 5 (bit 0), 4 (bit 1), 3 (bit 2)...
    let w = 5;
    while (w > 1) {
        let used = false;
        for (const row of bmp) {
            if (row & (1 << (5 - w))) { used = true; break; }
        }
        if (used) break;
        w--;
    }
    return w;
}

function rasteriseChar(
    pixels: Uint8Array, ch: string, x: number, y: number,
    scale: number, colour: number,
) {
    const bmp = getCharBitmap(ch);
    if (!bmp) return 0;
    const w = charWidth(ch);
    for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 5; col++) {
            if (bmp[row] & (0x10 >> col)) {
                for (let sy = 0; sy < scale; sy++) {
                    for (let sx = 0; sx < scale; sx++) {
                        const px = x + col * scale + sx;
                        const py = y + row * scale + sy;
                        if (px >= 0 && px < IBIT_WIDTH && py >= 0 && py < IBIT_HEIGHT) {
                            pixels[py * IBIT_WIDTH + px] = colour;
                        }
                    }
                }
            }
        }
    }
    return w * scale;
}

// ── Main editor ──────────────────────────────────────────────────────
export class InkyImageEditor {
    private overlay!: HTMLDivElement;
    private canvasEl!: HTMLCanvasElement;
    private ctx!: CanvasRenderingContext2D;
    private thumbCanvas!: HTMLCanvasElement;
    private thumbCtx!: CanvasRenderingContext2D;

    // pixel data
    private pixels!: Uint8Array;
    private originalPixels: Uint8Array | null = null;

    // state
    private tool: Tool = "pencil";
    private colour = 1;          // Black
    private brushSize = 1;
    private zoom = 1;
    private panX = 0;
    private panY = 0;
    private hasChanges = false;

    // undo / redo
    private undoStack: Uint8Array[] = [];
    private redoStack: Uint8Array[] = [];
    private maxUndo = 80;

    // interaction
    private isPointerDown = false;
    private lastPx = -1;
    private lastPy = -1;
    private startPx = -1;
    private startPy = -1;

    // shape preview snapshot
    private previewSnapshot: Uint8Array | null = null;

    // pan state
    private panStartX = 0;
    private panStartY = 0;
    private panOrigOffsetX = 0;
    private panOrigOffsetY = 0;
    private spaceHeld = false;
    private prevToolBeforeSpace: Tool = "pencil";

    // rect fill toggle
    private rectFilled = false;
    private circleFilled = false;

    // text
    private textContent = "";
    private textSize = 2;         // 1x, 2x, 3x, 4x
    private textCursorX = 0;
    private textCursorY = 0;

    // coord display
    private coordLabel!: HTMLSpanElement;
    private zoomLabel!: HTMLSpanElement;

    // rect/circle toggle containers
    private rectToggleWrap!: HTMLDivElement;
    private circleToggleWrap!: HTMLDivElement;
    private textPanel!: HTMLDivElement;

    // cleanup
    private boundHandlers: Array<[string, EventListenerOrEventListenerObject, EventTarget]> = [];
    private animFrameId = 0;

    constructor(initialPixels: Uint8Array) {
        this.pixels = new Uint8Array(initialPixels);
        this.originalPixels = new Uint8Array(initialPixels);
        this.buildDOM();
        this.fitToView();
        this.render();
        this.updateThumb();
        this.attachGlobalHandlers();
    }

    // ── DOM construction ─────────────────────────────────────────────
    private el<K extends keyof HTMLElementTagNameMap>(
        tag: K, styles: string, attrs?: Record<string, string>,
    ): HTMLElementTagNameMap[K] {
        const e = document.createElement(tag);
        e.style.cssText = styles;
        if (attrs) for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
        return e;
    }

    private btn(label: string, css: string, onclick: () => void): HTMLButtonElement {
        const b = this.el("button", css);
        b.textContent = label;
        b.onclick = onclick;
        return b;
    }

    private buildDOM() {
        const ov = this.el("div",
            "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10001;display:flex;align-items:center;justify-content:center;font-family:sans-serif;font-size:13px;color:#222;");
        this.overlay = ov;

        const modal = this.el("div",
            "background:#fff;border-radius:10px;box-shadow:0 8px 40px rgba(0,0,0,.35);display:flex;flex-direction:column;overflow:hidden;max-width:98vw;max-height:96vh;");

        // ── top bar ──────────────────────────────────────────────────
        const topBar = this.el("div",
            "display:flex;align-items:center;gap:6px;padding:8px 12px;background:#f7f7f7;border-bottom:1px solid #ddd;flex-wrap:wrap;");

        const title = this.el("span", "font-weight:600;margin-right:auto;");
        title.textContent = "Inky:Bit Image – 250×120";
        topBar.appendChild(title);

        const undoBtn = this.btn("Undo",
            "padding:4px 10px;border:1px solid #bbb;border-radius:4px;background:#fff;cursor:pointer;font-size:12px;",
            () => this.undo());
        undoBtn.id = "ib-undo";
        topBar.appendChild(undoBtn);

        const redoBtn = this.btn("Redo",
            "padding:4px 10px;border:1px solid #bbb;border-radius:4px;background:#fff;cursor:pointer;font-size:12px;",
            () => this.redo());
        redoBtn.id = "ib-redo";
        topBar.appendChild(redoBtn);

        topBar.appendChild(this.el("span", "width:1px;height:20px;background:#ccc;margin:0 4px;"));

        // size buttons
        for (const sz of [1, 3, 5]) {
            const b = this.btn(String(sz),
                `padding:3px 8px;border:1px solid #bbb;border-radius:4px;cursor:pointer;font-size:12px;${sz === this.brushSize ? "background:#0078d7;color:#fff;border-color:#0078d7;" : "background:#fff;"}`,
                () => this.setBrushSize(sz));
            b.className = "ib-size-btn";
            b.dataset.size = String(sz);
            topBar.appendChild(b);
        }

        topBar.appendChild(this.el("span", "width:1px;height:20px;background:#ccc;margin:0 4px;"));

        const clearBtn = this.btn("Clear",
            "padding:4px 10px;border:1px solid #bbb;border-radius:4px;background:#fff;cursor:pointer;font-size:12px;",
            () => this.clearCanvas());
        topBar.appendChild(clearBtn);

        const cancelBtn = this.btn("Cancel",
            "padding:4px 10px;border:1px solid #bbb;border-radius:4px;background:#fff;cursor:pointer;font-size:12px;",
            () => this.cancel());
        topBar.appendChild(cancelBtn);

        const doneBtn = this.btn("Done",
            "padding:4px 14px;border:1px solid #0078d7;border-radius:4px;background:#0078d7;color:#fff;cursor:pointer;font-size:12px;font-weight:600;",
            () => this.done());
        topBar.appendChild(doneBtn);

        modal.appendChild(topBar);

        // ── middle: left-rail | canvas | right panel ─────────────────
        const middle = this.el("div", "display:flex;flex:1;min-height:0;");

        // left rail
        const rail = this.el("div",
            "display:flex;flex-direction:column;gap:2px;padding:6px 4px;background:#f0f0f0;border-right:1px solid #ddd;width:36px;align-items:center;flex-shrink:0;");
        const toolDefs: [Tool, string][] = [
            ["pencil", "✏"], ["eraser", "⌫"], ["line", "╱"],
            ["rect", "▭"], ["circle", "○"], ["text", "T"],
            ["pan", "✋"],
        ];
        for (const [id, icon] of toolDefs) {
            const b = this.btn(icon,
                `width:28px;height:28px;border:1px solid #bbb;border-radius:4px;cursor:pointer;font-size:14px;line-height:1;text-align:center;padding:0;${id === this.tool ? "background:#0078d7;color:#fff;border-color:#0078d7;" : "background:#fff;"}`,
                () => this.setTool(id));
            b.className = "ib-tool-btn";
            b.dataset.tool = id;
            rail.appendChild(b);
        }
        middle.appendChild(rail);

        // rect/circle fill toggles (shown below rail when active)
        this.rectToggleWrap = this.buildFillToggle("rect");
        this.circleToggleWrap = this.buildFillToggle("circle");
        rail.appendChild(this.rectToggleWrap);
        rail.appendChild(this.circleToggleWrap);

        // canvas area
        const canvasWrap = this.el("div",
            "flex:1;overflow:hidden;position:relative;background:#e8e8e8;cursor:crosshair;");
        canvasWrap.id = "ib-canvas-wrap";

        this.canvasEl = this.el("canvas", "") as HTMLCanvasElement;
        this.canvasEl.style.cssText = "image-rendering:pixelated;display:block;";
        canvasWrap.appendChild(this.canvasEl);
        this.ctx = this.canvasEl.getContext("2d")!;
        this.ctx.imageSmoothingEnabled = false;

        middle.appendChild(canvasWrap);

        // right panel
        const rightPanel = this.el("div",
            "width:200px;border-left:1px solid #ddd;background:#f7f7f7;padding:8px;display:flex;flex-direction:column;gap:8px;flex-shrink:0;overflow-y:auto;");

        // colour palette
        const palLabel = this.el("div", "font-weight:600;font-size:11px;text-transform:uppercase;color:#666;");
        palLabel.textContent = "Colour";
        rightPanel.appendChild(palLabel);

        const palRow = this.el("div", "display:flex;gap:6px;");
        for (const [code, hex] of Object.entries(COLOUR_MAP)) {
            const b = this.el("button",
                `width:30px;height:30px;border-radius:4px;cursor:pointer;border:2px solid ${Number(code) === this.colour ? "#0078d7" : "#bbb"};background:${hex};`);
            b.dataset.colour = code;
            b.onclick = () => this.setColour(Number(code));
            b.className = "ib-colour-btn";
            palRow.appendChild(b);
        }
        rightPanel.appendChild(palRow);

        // mini preview
        const thumbLabel = this.el("div", "font-weight:600;font-size:11px;text-transform:uppercase;color:#666;");
        thumbLabel.textContent = "Preview";
        rightPanel.appendChild(thumbLabel);

        this.thumbCanvas = this.el("canvas", "border:1px solid #ccc;border-radius:4px;image-rendering:pixelated;width:184px;height:88px;") as HTMLCanvasElement;
        this.thumbCanvas.width = IBIT_WIDTH;
        this.thumbCanvas.height = IBIT_HEIGHT;
        this.thumbCtx = this.thumbCanvas.getContext("2d")!;
        this.thumbCtx.imageSmoothingEnabled = false;
        rightPanel.appendChild(this.thumbCanvas);

        // viewport indicator drawn over thumb
        const vpIndicator = this.el("div",
            "position:absolute;border:1.5px solid rgba(0,120,215,.8);pointer-events:none;display:none;");
        rightPanel.style.position = "relative";
        rightPanel.appendChild(vpIndicator);
        (vpIndicator as any)._update = (zoom: number, px: number, py: number) => {
            if (zoom <= 1.01) { vpIndicator.style.display = "none"; return; }
            vpIndicator.style.display = "block";
            const scale = 184 / IBIT_WIDTH;
            const left = (-px / zoom) * scale;
            const top = (-py / zoom) * scale;
            const w = (IBIT_WIDTH / zoom) * scale;
            const h = (IBIT_HEIGHT / zoom) * scale;
            vpIndicator.style.left = (8 + left) + "px";
            vpIndicator.style.top = (8 + thumbLabel.offsetHeight + 4 + top) + "px";
            vpIndicator.style.width = w + "px";
            vpIndicator.style.height = h + "px";
        };

        // text panel (hidden unless text tool active)
        this.textPanel = this.el("div", "display:none;border-top:1px solid #ddd;padding-top:8px;");
        this.buildTextPanel(rightPanel);
        rightPanel.appendChild(this.textPanel);

        middle.appendChild(rightPanel);
        modal.appendChild(middle);

        // ── bottom bar ───────────────────────────────────────────────
        const bottomBar = this.el("div",
            "display:flex;align-items:center;gap:8px;padding:4px 12px;background:#f7f7f7;border-top:1px solid #ddd;font-size:11px;");

        this.coordLabel = this.el("span", "min-width:100px;");
        this.coordLabel.textContent = "x: —  y: —";
        bottomBar.appendChild(this.coordLabel);

        bottomBar.appendChild(this.el("span", "flex:1;"));

        const zoomOut = this.btn("−",
            "width:24px;height:24px;border:1px solid #bbb;border-radius:4px;cursor:pointer;font-size:14px;line-height:1;padding:0;",
            () => this.zoomBy(0.8));
        bottomBar.appendChild(zoomOut);

        this.zoomLabel = this.el("span", "min-width:48px;text-align:center;");
        bottomBar.appendChild(this.zoomLabel);

        const zoomIn = this.btn("+",
            "width:24px;height:24px;border:1px solid #bbb;border-radius:4px;cursor:pointer;font-size:14px;line-height:1;padding:0;",
            () => this.zoomBy(1.25));
        bottomBar.appendChild(zoomIn);

        const fitBtn = this.btn("Fit",
            "padding:3px 8px;border:1px solid #bbb;border-radius:4px;cursor:pointer;font-size:11px;",
            () => this.fitToView());
        bottomBar.appendChild(fitBtn);

        modal.appendChild(bottomBar);

        ov.appendChild(modal);

        // click-through on overlay background → close
        ov.addEventListener("click", (e) => {
            if (e.target === ov) this.cancel();
        });

        document.body.appendChild(ov);

        // attach pointer events to canvasWrap
        this.attachPointerHandlers(canvasWrap);
        this.updateVPIndicator();
    }

    private buildFillToggle(type: "rect" | "circle"): HTMLDivElement {
        const wrap = this.el("div", "display:none;flex-direction:column;gap:2px;margin-top:2px;");
        const label = this.el("div", "font-size:9px;text-align:center;color:#666;");
        label.textContent = type === "rect" ? "Rect" : "Circle";
        wrap.appendChild(label);
        for (const mode of ["outline", "filled"]) {
            const b = this.btn(mode === "outline" ? "▢" : "■",
                `width:28px;height:24px;border:1px solid #bbb;border-radius:3px;cursor:pointer;font-size:12px;line-height:1;padding:0;${(type === "rect" ? this.rectFilled : this.circleFilled) === (mode === "filled") ? "background:#0078d7;color:#fff;border-color:#0078d7;" : "background:#fff;"}`,
                () => {
                    if (type === "rect") this.rectFilled = mode === "filled";
                    else this.circleFilled = mode === "filled";
                    this.rebuildFillToggles();
                });
            b.className = `ib-fill-${type}`;
            b.dataset.mode = mode;
            wrap.appendChild(b);
        }
        return wrap;
    }

    private rebuildFillToggles() {
        for (const wrap of [this.rectToggleWrap, this.circleToggleWrap]) {
            const type = wrap === this.rectToggleWrap ? "rect" : "circle";
            const filled = type === "rect" ? this.rectFilled : this.circleFilled;
            for (const btn of Array.from(wrap.querySelectorAll("button")) as HTMLButtonElement[]) {
                const mode = btn.dataset.mode!;
                const active = (mode === "filled") === filled;
                btn.style.background = active ? "#0078d7" : "#fff";
                btn.style.color = active ? "#fff" : "";
                btn.style.borderColor = active ? "#0078d7" : "#bbb";
            }
        }
    }

    private buildTextPanel(_parent: HTMLElement) {
        const tp = this.textPanel;

        const lbl = this.el("div", "font-weight:600;font-size:11px;text-transform:uppercase;color:#666;");
        lbl.textContent = "Text";
        tp.appendChild(lbl);

        const input = this.el("input",
            "width:100%;padding:4px 6px;border:1px solid #bbb;border-radius:4px;font-size:12px;box-sizing:border-box;") as HTMLInputElement;
        input.placeholder = "Text to place…";
        input.value = this.textContent;
        input.oninput = () => { this.textContent = input.value; };
        tp.appendChild(input);

        const sizeRow = this.el("div", "display:flex;gap:4px;align-items:center;margin-top:4px;");
        const sizeLbl = this.el("span", "font-size:11px;");
        sizeLbl.textContent = "Size:";
        sizeRow.appendChild(sizeLbl);
        const sel = this.el("select",
            "flex:1;padding:3px;border:1px solid #bbb;border-radius:4px;font-size:11px;") as HTMLSelectElement;
        for (const [v, lbl] of [["1", "Tiny (1×)"], ["2", "Regular (2×)"], ["3", "Medium (3×)"], ["4", "Large (4×)"]]) {
            const opt = document.createElement("option");
            opt.value = v; opt.textContent = lbl;
            if (Number(v) === this.textSize) opt.selected = true;
            sel.appendChild(opt);
        }
        sel.onchange = () => { this.textSize = Number(sel.value); };
        sizeRow.appendChild(sel);
        tp.appendChild(sizeRow);

        const placeBtn = this.btn("Place text",
            "margin-top:4px;width:100%;padding:5px;border:1px solid #0078d7;border-radius:4px;background:#0078d7;color:#fff;cursor:pointer;font-size:12px;font-weight:600;",
            () => this.placeText());
        tp.appendChild(placeBtn);
    }

    // ── Pointer handling ─────────────────────────────────────────────
    private attachPointerHandlers(target: HTMLElement) {
        const onDown = (e: PointerEvent) => {
            if (e.button !== 0) return;
            e.preventDefault();
            target.setPointerCapture(e.pointerId);
            this.isPointerDown = true;
            const { ix, iy } = this.screenToImage(e);
            this.startPx = ix; this.startPy = iy;
            this.lastPx = ix; this.lastPy = iy;

            if (this.tool === "pan" || this.spaceHeld) {
                this.panStartX = e.clientX;
                this.panStartY = e.clientY;
                this.panOrigOffsetX = this.panX;
                this.panOrigOffsetY = this.panY;
                return;
            }
            if (this.tool === "pencil" || this.tool === "eraser") {
                this.pushUndo();
                const c = this.tool === "eraser" ? 0 : this.colour;
                this.drawBrush(ix, iy, c);
                this.render();
            }
            if (this.tool === "line" || this.tool === "rect" || this.tool === "circle") {
                this.pushUndo();
                this.previewSnapshot = new Uint8Array(this.pixels);
            }
            if (this.tool === "text") {
                this.textCursorX = ix;
                this.textCursorY = iy;
                this.render();
            }
        };

        const onMove = (e: PointerEvent) => {
            const { ix, iy } = this.screenToImage(e);
            this.coordLabel.textContent = `x: ${ix}  y: ${iy}`;
            if (ix < 0 || ix >= IBIT_WIDTH || iy < 0 || iy >= IBIT_HEIGHT) {
                this.coordLabel.textContent = "x: —  y: —";
            }

            if (!this.isPointerDown) {
                // hover preview for text
                if (this.tool === "text") {
                    this.textCursorX = ix; this.textCursorY = iy;
                    this.render();
                }
                return;
            }

            if (this.tool === "pan" || this.spaceHeld) {
                this.panX = this.panOrigOffsetX + (e.clientX - this.panStartX);
                this.panY = this.panOrigOffsetY + (e.clientY - this.panStartY);
                this.render();
                this.updateVPIndicator();
                return;
            }

            if (this.tool === "pencil" || this.tool === "eraser") {
                const c = this.tool === "eraser" ? 0 : this.colour;
                bresenhamLine(this.lastPx, this.lastPy, ix, iy, (x, y) => this.drawBrush(x, y, c));
                this.lastPx = ix; this.lastPy = iy;
                this.render();
            }
            if ((this.tool === "line" || this.tool === "rect" || this.tool === "circle") && this.previewSnapshot) {
                // restore then draw preview
                this.pixels.set(this.previewSnapshot);
                this.drawShapePreview(ix, iy);
                this.render();
            }
            if (this.tool === "text") {
                this.textCursorX = ix; this.textCursorY = iy;
                this.render();
            }
        };

        const onUp = (e: PointerEvent) => {
            if (!this.isPointerDown) return;
            this.isPointerDown = false;
            target.releasePointerCapture(e.pointerId);
            const { ix, iy } = this.screenToImage(e);

            if (this.tool === "pan" || this.spaceHeld) return;

            if (this.tool === "line" && this.previewSnapshot) {
                this.pixels.set(this.previewSnapshot);
                this.drawShapePreview(ix, iy);
                this.previewSnapshot = null;
                this.render();
                this.commitChange();
            }
            if (this.tool === "rect" && this.previewSnapshot) {
                this.pixels.set(this.previewSnapshot);
                this.drawShapePreview(ix, iy);
                this.previewSnapshot = null;
                this.render();
                this.commitChange();
            }
            if (this.tool === "circle" && this.previewSnapshot) {
                this.pixels.set(this.previewSnapshot);
                this.drawShapePreview(ix, iy);
                this.previewSnapshot = null;
                this.render();
                this.commitChange();
            }
            if (this.tool === "pencil" || this.tool === "eraser") {
                this.commitChange();
            }
        };

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
            // zoom towards cursor
            const rect = this.canvasEl.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            const oldZoom = this.zoom;
            this.zoom = Math.max(0.5, Math.min(20, this.zoom * factor));
            const ratio = this.zoom / oldZoom;
            this.panX = mx - ratio * (mx - this.panX);
            this.panY = my - ratio * (my - this.panY);
            this.render();
            this.updateZoomLabel();
            this.updateVPIndicator();
        };

        this.boundHandlers.push(["pointerdown", onDown as any, target]);
        this.boundHandlers.push(["pointermove", onMove as any, target]);
        this.boundHandlers.push(["pointerup", onUp as any, target]);
        this.boundHandlers.push(["wheel", onWheel as any, target]);
        target.addEventListener("pointerdown", onDown as any);
        target.addEventListener("pointermove", onMove as any);
        target.addEventListener("pointerup", onUp as any);
        target.addEventListener("wheel", onWheel as any, { passive: false });
    }

    private attachGlobalHandlers() {
        const onKey = (e: KeyboardEvent) => {
            if (!this.overlay.parentNode) return;
            if (e.key === " " && !this.spaceHeld && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement)) {
                e.preventDefault();
                this.spaceHeld = true;
                this.prevToolBeforeSpace = this.tool;
                this.setTool("pan");
            }
            if (e.key === "Escape") {
                if (this.previewSnapshot) {
                    this.pixels.set(this.previewSnapshot);
                    this.previewSnapshot = null;
                    this.render();
                }
            }
            if (e.ctrlKey || e.metaKey) {
                if (e.key === "z" && !e.shiftKey) { e.preventDefault(); this.undo(); }
                if (e.key === "y" || (e.key === "z" && e.shiftKey)) { e.preventDefault(); this.redo(); }
                if (e.key === "=" || e.key === "+") { e.preventDefault(); this.zoomBy(1.25); }
                if (e.key === "-") { e.preventDefault(); this.zoomBy(0.8); }
                if (e.key === "0") { e.preventDefault(); this.fitToView(); }
            }
            if (!e.ctrlKey && !e.metaKey) {
                if (e.key === "1") this.setBrushSize(1);
                if (e.key === "2") this.setBrushSize(3);
                if (e.key === "3") this.setBrushSize(5);
            }
        };
        const onKeyUp = (e: KeyboardEvent) => {
            if (e.key === " " && this.spaceHeld) {
                this.spaceHeld = false;
                this.setTool(this.prevToolBeforeSpace);
            }
        };
        this.boundHandlers.push(["keydown", onKey, document]);
        this.boundHandlers.push(["keyup", onKeyUp, document]);
        document.addEventListener("keydown", onKey);
        document.addEventListener("keyup", onKeyUp);
    }

    private cleanup() {
        for (const [evt, fn, target] of this.boundHandlers) target.removeEventListener(evt, fn);
        this.boundHandlers = [];
        if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
        if (this.overlay.parentNode) this.overlay.parentNode.removeChild(this.overlay);
    }

    // ── Coordinate transforms ────────────────────────────────────────
    private screenToImage(e: PointerEvent): { ix: number; iy: number } {
        const rect = this.canvasEl.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const ix = Math.floor((sx - this.panX) / this.zoom);
        const iy = Math.floor((sy - this.panY) / this.zoom);
        return { ix, iy };
    }

    // ── Drawing primitives ───────────────────────────────────────────
    private setPixel(x: number, y: number, c: number) {
        if (x < 0 || x >= IBIT_WIDTH || y < 0 || y >= IBIT_HEIGHT) return;
        this.pixels[y * IBIT_WIDTH + x] = c;
    }

    private drawBrush(cx: number, cy: number, c: number) {
        const r = Math.floor(this.brushSize / 2);
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                this.setPixel(cx + dx, cy + dy, c);
            }
        }
    }

    private drawShapePreview(ex: number, ey: number) {
        const sx = this.startPx, sy = this.startPy;
        const c = this.colour;
        const thick = this.brushSize;

        if (this.tool === "line") {
            // draw thick line by drawing parallel lines
            const dx = Math.abs(ex - sx), dy = Math.abs(ey - sy);
            const steps = Math.max(dx, dy, 1);
            for (let i = 0; i <= steps; i++) {
                const t = i / steps;
                const px = Math.round(sx + (ex - sx) * t);
                const py = Math.round(sy + (ey - sy) * t);
                const r = Math.floor(thick / 2);
                for (let ddy = -r; ddy <= r; ddy++) {
                    for (let ddx = -r; ddx <= r; ddx++) {
                        this.setPixel(px + ddx, py + ddy, c);
                    }
                }
            }
        }

        if (this.tool === "rect") {
            const x0 = Math.min(sx, ex), y0 = Math.min(sy, ey);
            const x1 = Math.max(sx, ex), y1 = Math.max(sy, ey);
            if (this.rectFilled) {
                for (let y = y0; y <= y1; y++)
                    for (let x = x0; x <= x1; x++) this.setPixel(x, y, c);
            } else {
                const r = Math.floor(thick / 2);
                for (let t = -r; t <= r; t++) {
                    for (let x = x0; x <= x1; x++) { this.setPixel(x, y0 + t, c); this.setPixel(x, y1 + t, c); }
                    for (let y = y0; y <= y1; y++) { this.setPixel(x0 + t, y, c); this.setPixel(x1 + t, y, c); }
                }
            }
        }

        if (this.tool === "circle") {
            const rx = Math.abs(ex - sx) / 2;
            const ry = Math.abs(ey - sy) / 2;
            const cx = (sx + ex) / 2;
            const cy = (sy + ey) / 2;
            const drawPx = (px: number, py: number) => this.setPixel(Math.round(px), Math.round(py), c);

            if (this.circleFilled) {
                midpointEllipse(Math.round(cx), Math.round(cy), Math.round(rx), Math.round(ry),
                    (px, py) => {
                        // fill horizontal spans
                        const icx = Math.round(cx);
                        if (px >= icx) {
                            for (let x = icx - (px - icx); x <= px; x++) drawPx(x, py);
                        }
                    });
            } else {
                // outline – draw thick
                const r = Math.floor(thick / 2);
                midpointEllipse(Math.round(cx), Math.round(cy), Math.round(rx), Math.round(ry),
                    (px, py) => {
                        for (let ddy = -r; ddy <= r; ddy++)
                            for (let ddx = -r; ddx <= r; ddx++)
                                drawPx(px + ddx, py + ddy);
                    });
            }
        }
    }

    // ── Rendering ────────────────────────────────────────────────────
    private render() {
        const z = this.zoom;
        const cw = Math.ceil(IBIT_WIDTH * z);
        const ch = Math.ceil(IBIT_HEIGHT * z);

        if (this.canvasEl.width !== cw || this.canvasEl.height !== ch) {
            this.canvasEl.width = cw;
            this.canvasEl.height = ch;
        }

        const ctx = this.ctx;
        ctx.fillStyle = "#e8e8e8";
        ctx.fillRect(0, 0, cw, ch);

        ctx.save();
        ctx.translate(this.panX, this.panY);
        ctx.scale(z, z);

        // white background
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, IBIT_WIDTH, IBIT_HEIGHT);

        // draw grid if zoomed enough
        if (z >= 6) {
            ctx.strokeStyle = "rgba(0,0,0,.08)";
            ctx.lineWidth = 0.5 / z;
            ctx.beginPath();
            for (let x = 0; x <= IBIT_WIDTH; x++) { ctx.moveTo(x, 0); ctx.lineTo(x, IBIT_HEIGHT); }
            for (let y = 0; y <= IBIT_HEIGHT; y++) { ctx.moveTo(0, y); ctx.lineTo(IBIT_WIDTH, y); }
            ctx.stroke();
        }

        // draw pixels
        const imgData = ctx.createImageData(IBIT_WIDTH, IBIT_HEIGHT);
        const d = imgData.data;
        for (let i = 0; i < IBIT_PIXEL_COUNT; i++) {
            const c = this.pixels[i];
            const hex = COLOUR_MAP[c] || "#cccccc";
            const off = i * 4;
            if (hex === "#ffffff") { d[off] = 255; d[off + 1] = 255; d[off + 2] = 255; d[off + 3] = 255; }
            else if (hex === "#000000") { d[off] = 0; d[off + 1] = 0; d[off + 2] = 0; d[off + 3] = 255; }
            else if (hex === "#d32020") { d[off] = 211; d[off + 1] = 32; d[off + 2] = 32; d[off + 3] = 255; }
            else { d[off] = 0xcc; d[off + 1] = 0xcc; d[off + 2] = 0xcc; d[off + 3] = 255; }
        }
        // draw to offscreen then scale
        const offscreen = document.createElement("canvas");
        offscreen.width = IBIT_WIDTH;
        offscreen.height = IBIT_HEIGHT;
        const octx = offscreen.getContext("2d")!;
        octx.putImageData(imgData, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(offscreen, 0, 0);

        // text preview
        if (this.tool === "text" && this.textContent) {
            ctx.globalAlpha = 0.5;
            let tx = this.textCursorX;
            for (const ch of this.textContent) {
                const bmp = getCharBitmap(ch);
                if (!bmp) { tx += 6 * this.textSize; continue; }
                for (let row = 0; row < 5; row++) {
                    for (let col = 0; col < 5; col++) {
                        if (bmp[row] & (0x10 >> col)) {
                            ctx.fillStyle = COLOUR_MAP[this.colour] || "#000";
                            ctx.fillRect(tx + col * this.textSize, this.textCursorY + row * this.textSize, this.textSize, this.textSize);
                        }
                    }
                }
                tx += charWidth(ch) * this.textSize;
            }
            ctx.globalAlpha = 1;
        }

        ctx.restore();
        this.updateZoomLabel();
    }

    // ── Thumbnail ────────────────────────────────────────────────────
    private updateThumb() {
        const ctx = this.thumbCtx;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, IBIT_WIDTH, IBIT_HEIGHT);
        const imgData = ctx.createImageData(IBIT_WIDTH, IBIT_HEIGHT);
        const d = imgData.data;
        for (let i = 0; i < IBIT_PIXEL_COUNT; i++) {
            const c = this.pixels[i];
            const off = i * 4;
            if (c === 0) { d[off] = 255; d[off + 1] = 255; d[off + 2] = 255; d[off + 3] = 255; }
            else if (c === 1) { d[off] = 0; d[off + 1] = 0; d[off + 2] = 0; d[off + 3] = 255; }
            else if (c === 2) { d[off] = 211; d[off + 1] = 32; d[off + 2] = 32; d[off + 3] = 255; }
            else { d[off] = 0xcc; d[off + 1] = 0xcc; d[off + 2] = 0xcc; d[off + 3] = 255; }
        }
        ctx.putImageData(imgData, 0, 0);
    }

    // ── Zoom helpers ─────────────────────────────────────────────────
    private fitToView() {
        const wrap = document.getElementById("ib-canvas-wrap");
        if (!wrap) return;
        const w = wrap.clientWidth - 4;
        const h = wrap.clientHeight - 4;
        this.zoom = Math.min(w / IBIT_WIDTH, h / IBIT_HEIGHT);
        this.panX = Math.max(0, (w - IBIT_WIDTH * this.zoom) / 2);
        this.panY = Math.max(0, (h - IBIT_HEIGHT * this.zoom) / 2);
        this.render();
        this.updateZoomLabel();
        this.updateVPIndicator();
    }

    private zoomBy(factor: number) {
        const wrap = document.getElementById("ib-canvas-wrap");
        if (!wrap) return;
        const w = wrap.clientWidth;
        const h = wrap.clientHeight;
        const cx = w / 2, cy = h / 2;
        const oldZoom = this.zoom;
        this.zoom = Math.max(0.5, Math.min(20, this.zoom * factor));
        const ratio = this.zoom / oldZoom;
        this.panX = cx - ratio * (cx - this.panX);
        this.panY = cy - ratio * (cy - this.panY);
        this.render();
        this.updateZoomLabel();
        this.updateVPIndicator();
    }

    private updateZoomLabel() {
        this.zoomLabel.textContent = Math.round(this.zoom * 100) + "%";
    }

    private updateVPIndicator() {
        const vp = (this.thumbCanvas.parentElement?.querySelector("div:last-child") as any)?._update;
        if (vp) vp(this.zoom, this.panX, this.panY);
    }

    // ── Tool / colour / size setters ─────────────────────────────────
    private setTool(t: Tool) {
        this.tool = t;
        for (const btn of Array.from(document.querySelectorAll(".ib-tool-btn")) as HTMLButtonElement[]) {
            const active = btn.dataset.tool === t;
            btn.style.background = active ? "#0078d7" : "#fff";
            btn.style.color = active ? "#fff" : "";
            btn.style.borderColor = active ? "#0078d7" : "#bbb";
        }
        this.rectToggleWrap.style.display = t === "rect" ? "flex" : "none";
        this.circleToggleWrap.style.display = t === "circle" ? "flex" : "none";
        this.textPanel.style.display = t === "text" ? "block" : "none";

        const canvasWrap = document.getElementById("ib-canvas-wrap");
        if (canvasWrap) canvasWrap.style.cursor = t === "pan" || this.spaceHeld ? "grab" : "crosshair";
        this.render();
    }

    private setColour(c: number) {
        this.colour = c;
        for (const btn of Array.from(document.querySelectorAll(".ib-colour-btn")) as HTMLButtonElement[]) {
            btn.style.borderColor = Number(btn.dataset.colour) === c ? "#0078d7" : "#bbb";
            btn.style.borderWidth = Number(btn.dataset.colour) === c ? "2px" : "2px";
        }
    }

    private setBrushSize(s: number) {
        this.brushSize = s;
        for (const btn of Array.from(document.querySelectorAll(".ib-size-btn")) as HTMLButtonElement[]) {
            const active = Number(btn.dataset.size) === s;
            btn.style.background = active ? "#0078d7" : "#fff";
            btn.style.color = active ? "#fff" : "";
            btn.style.borderColor = active ? "#0078d7" : "#bbb";
        }
    }

    // ── Undo / Redo ──────────────────────────────────────────────────
    private pushUndo() {
        this.undoStack.push(new Uint8Array(this.pixels));
        if (this.undoStack.length > this.maxUndo) this.undoStack.shift();
        this.redoStack = [];
        this.hasChanges = true;
        this.updateUndoRedoButtons();
    }

    private undo() {
        if (!this.undoStack.length) return;
        this.redoStack.push(new Uint8Array(this.pixels));
        this.pixels.set(this.undoStack.pop()!);
        this.hasChanges = true;
        this.render();
        this.updateThumb();
        this.updateUndoRedoButtons();
    }

    private redo() {
        if (!this.redoStack.length) return;
        this.undoStack.push(new Uint8Array(this.pixels));
        this.pixels.set(this.redoStack.pop()!);
        this.hasChanges = true;
        this.render();
        this.updateThumb();
        this.updateUndoRedoButtons();
    }

    private commitChange() {
        this.hasChanges = true;
        this.updateThumb();
        this.updateUndoRedoButtons();
    }

    private updateUndoRedoButtons() {
        const ub = document.getElementById("ib-undo");
        const rb = document.getElementById("ib-redo");
        if (ub) ub.style.opacity = this.undoStack.length ? "1" : ".4";
        if (rb) rb.style.opacity = this.redoStack.length ? "1" : ".4";
    }

    // ── Clear ────────────────────────────────────────────────────────
    private clearCanvas() {
        const hasNonWhite = this.pixels.some(c => c !== 0);
        if (hasNonWhite) {
            const ok = confirm("Clear the entire canvas to white?");
            if (!ok) return;
        }
        this.pushUndo();
        this.pixels.fill(0);
        this.render();
        this.updateThumb();
    }

    // ── Text ─────────────────────────────────────────────────────────
    private placeText() {
        const txt = this.textContent;
        if (!txt) return;
        this.pushUndo();
        let tx = this.textCursorX;
        const startX = tx;
        for (const ch of txt) {
            const w = charWidth(ch);
            if (tx + w * this.textSize >= IBIT_WIDTH) {
                this.textCursorY += 6 * this.textSize;
                tx = startX;
            }
            rasteriseChar(this.pixels, ch, tx, this.textCursorY, this.textSize, this.colour);
            tx += w * this.textSize;
        }
        this.commitChange();
        this.render();
    }

    // ── Save / Cancel ────────────────────────────────────────────────
    private done() {
        try {
            const encoded = encodeInkyBitImage(this.pixels);
            const hexLiteral = encodedImageToHexLiteral(encoded);
            this._onDone(hexLiteral);
        } catch (e) {
            pxt.debug("Failed to encode IBIT image: " + e);
        }
        this.cleanup();
    }

    private cancel() {
        if (this.hasChanges) {
            const yes = confirm("Discard changes?");
            if (!yes) return;
        }
        if (this.originalPixels) {
            try {
                const encoded = encodeInkyBitImage(this.originalPixels);
                const hexLiteral = encodedImageToHexLiteral(encoded);
                this._onDone(hexLiteral);
            } catch { /* keep original */ }
        }
        this.cleanup();
    }

    // ── Callbacks (set externally) ───────────────────────────────────
    private _onDone: (hexLiteral: string) => void = () => {};

    public onDone(cb: (hexLiteral: string) => void) { this._onDone = cb; }
}
