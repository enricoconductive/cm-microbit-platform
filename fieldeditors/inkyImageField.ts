/// <reference path="../node_modules/pxt-core/localtypings/pxtblockly.d.ts"/>
/// <reference path="../node_modules/pxt-core/built/pxtsim.d.ts"/>

import { IBIT_WIDTH, IBIT_HEIGHT, IBIT_ENCODED_LENGTH, IBIT_PIXEL_COUNT, decodeInkyBitImage, encodeInkyBitImage, encodedImageToHexLiteral } from "./inkyImageCodec";

const pxtblockly = pxt.blocks.requirePxtBlockly();
const Blockly = pxt.blocks.requireBlockly();

const COLOUR_MAP: Record<number, string> = {
    0: '#ffffff', // White
    1: '#000000', // Black
    2: '#e03030', // Red (accent)
};

const THUMB_WIDTH = 48;
const THUMB_HEIGHT = 22;

function hexStringToBytes(hex: string): Uint8Array | null {
    const clean = hex.replace(/\s/g, '');
    if (clean.length !== IBIT_ENCODED_LENGTH * 2) return null;
    if (!/^[0-9a-fA-F]+$/.test(clean)) return null;
    const bytes = new Uint8Array(IBIT_ENCODED_LENGTH);
    for (let i = 0; i < IBIT_ENCODED_LENGTH; i++) {
        bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

function extractHexFromExpr(text: string): string | null {
    const hexMatch = text.match(/hex`([0-9a-fA-F]+)`/);
    if (hexMatch) return hexMatch[1];
    const rawHex = text.replace(/\s/g, '');
    if (/^[0-9a-fA-F]+$/.test(rawHex) && rawHex.length === IBIT_ENCODED_LENGTH * 2) return rawHex;
    return null;
}

function renderPixelsToCanvas(pixels: Uint8Array, canvas: HTMLCanvasElement, scale: number): void {
    canvas.width = IBIT_WIDTH * scale;
    canvas.height = IBIT_HEIGHT * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    for (let y = 0; y < IBIT_HEIGHT; y++) {
        for (let x = 0; x < IBIT_WIDTH; x++) {
            const colour = pixels[y * IBIT_WIDTH + x];
            ctx.fillStyle = COLOUR_MAP[colour] || '#cccccc';
            ctx.fillRect(x * scale, y * scale, scale, scale);
        }
    }
}

export interface FieldInkyImageOptions {}

export class FieldInkyImage extends (pxtblockly.FieldBase as any) {
    public isFieldCustom_: true = true;
    public SERIALIZABLE = true;

    private pixels: Uint8Array | null = null;
    private svgGroup_: SVGElement | null = null;
    private thumbImage_: SVGImageElement | null = null;
    private errorBlock = false;

    constructor(text: string, options: FieldInkyImageOptions, validator?: Function) {
        super(text, options, validator);
    }

    protected onInit(): void {
        this.render_();
    }

    protected onDispose(): void {}

    protected onValueChanged(newValue: string): string {
        const hex = extractHexFromExpr(newValue);
        if (!hex) {
            this.errorBlock = true;
            this.pixels = null;
            return newValue;
        }
        try {
            const bytes = hexStringToBytes(hex);
            if (!bytes) throw new Error('bad hex length');
            this.pixels = decodeInkyBitImage(bytes);
            this.errorBlock = false;
        } catch {
            this.errorBlock = true;
            this.pixels = null;
        }
        return newValue;
    }

    render_(): void {
        const group = Blockly.utils.dom.createSvgElement('g', {});
        this.svgGroup_ = group as unknown as SVGElement;

        if (this.errorBlock || !this.pixels) {
            const textEl = Blockly.utils.dom.createSvgElement('text', {
                'class': 'blocklyText',
                'x': '4',
                'y': '14',
                'font-size': '10',
                'fill': '#999',
            }) as SVGTextElement;
            textEl.textContent = 'inky:bit image';
            group.appendChild(textEl);
            this.size_ = { width: 100, height: 26 } as any;
        } else {
            const canvas = document.createElement('canvas');
            const scale = Math.max(1, Math.floor(THUMB_WIDTH / IBIT_WIDTH));
            renderPixelsToCanvas(this.pixels, canvas, scale);

            const dataUrl = canvas.toDataURL();

            const bgRect = Blockly.utils.dom.createSvgElement('rect', {
                'width': String(THUMB_WIDTH),
                'height': String(THUMB_HEIGHT),
                'rx': '4',
                'ry': '4',
                'fill': '#f0f0f0',
                'stroke': '#ccc',
                'stroke-width': '1',
            });
            group.appendChild(bgRect);

            const img = Blockly.utils.dom.createSvgElement('image', {
                'href': dataUrl,
                'width': String(THUMB_WIDTH),
                'height': String(THUMB_HEIGHT),
                'x': '0',
                'y': '0',
            }) as unknown as SVGImageElement;
            this.thumbImage_ = img;
            group.appendChild(img);

            this.size_ = { width: THUMB_WIDTH + 8, height: THUMB_HEIGHT + 8 } as any;
        }

        (this as any).svgGroup_ = group;

        if (!(this as any).fieldGroup_) {
            (this as any).fieldGroup_ = Blockly.utils.dom.createSvgElement('g', {});
        }
        while ((this as any).fieldGroup_.firstChild) {
            (this as any).fieldGroup_.removeChild((this as any).fieldGroup_.firstChild);
        }
        (this as any).fieldGroup_.appendChild(group);
    }

    showEditor_(): void {
        if (this.errorBlock || !this.pixels) {
            this.showPlaceholderEditor();
            return;
        }
        this.showPlaceholderEditor();
    }

    private showPlaceholderEditor(): void {
        const currentPixels = this.pixels
            ? new Uint8Array(this.pixels)
            : new Uint8Array(IBIT_PIXEL_COUNT).fill(0);

        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';

        const modal = document.createElement('div');
        modal.style.cssText = 'background:#fff;border-radius:8px;padding:16px;box-shadow:0 4px 20px rgba(0,0,0,0.3);display:flex;flex-direction:column;align-items:center;gap:12px;';

        const title = document.createElement('div');
        title.textContent = 'Inky:Bit Image Editor';
        title.style.cssText = 'font-family:sans-serif;font-size:14px;font-weight:bold;color:#333;';
        modal.appendChild(title);

        const previewCanvas = document.createElement('canvas');
        const thumbScale = 2;
        renderPixelsToCanvas(currentPixels, previewCanvas, thumbScale);
        previewCanvas.style.cssText = 'border:1px solid #ccc;border-radius:4px;image-rendering:pixelated;';
        modal.appendChild(previewCanvas);

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:8px;';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = 'padding:6px 16px;border:1px solid #ccc;border-radius:4px;background:#f5f5f5;cursor:pointer;font-size:13px;';
        cancelBtn.onclick = () => document.body.removeChild(overlay);

        const doneBtn = document.createElement('button');
        doneBtn.textContent = 'Done';
        doneBtn.style.cssText = 'padding:6px 16px;border:1px solid #0078d7;border-radius:4px;background:#0078d7;color:#fff;cursor:pointer;font-size:13px;';
        doneBtn.onclick = () => {
            try {
                const encoded = encodeInkyBitImage(currentPixels);
                const hexLiteral = encodedImageToHexLiteral(encoded);
                this.setValue(hexLiteral);
            } catch (e) {
                pxt.debug('Failed to encode IBIT image: ' + e);
            }
            document.body.removeChild(overlay);
        };

        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(doneBtn);
        modal.appendChild(btnRow);

        overlay.appendChild(modal);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) document.body.removeChild(overlay);
        });
        document.body.appendChild(overlay);
    }
}
