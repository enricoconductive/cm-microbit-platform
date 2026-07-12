/// <reference path="../node_modules/pxt-core/localtypings/pxtblockly.d.ts"/>
/// <reference path="../node_modules/pxt-core/built/pxtsim.d.ts"/>

import { IBIT_WIDTH, IBIT_HEIGHT, IBIT_ENCODED_LENGTH, decodeInkyBitImage } from "./inkyImageCodec";
import { InkyImageEditor } from "./inkyImageEditor";

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
    private activeEditor: InkyImageEditor | null = null;

    constructor(text: string, options: FieldInkyImageOptions, validator?: Function) {
        super(text, options, validator);
    }

    protected onInit(): void {
        this.render_();
    }

    protected onDispose(): void {
        if (this.activeEditor) this.activeEditor.dispose();
        this.activeEditor = null;
    }

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
            textEl.textContent = this.errorBlock ? 'invalid inky:bit image' : 'inky:bit image';
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
        // Malformed, indirect and future IBIT expressions are source-preserving.
        if (this.errorBlock || !this.pixels) return;

        if (this.activeEditor) this.activeEditor.dispose();
        const currentPixels = new Uint8Array(this.pixels);

        const editor = new InkyImageEditor(currentPixels);
        this.activeEditor = editor;
        editor.onDone((hexLiteral: string) => {
            this.setValue(hexLiteral);
        });
        editor.onClosed(() => {
            if (this.activeEditor === editor) this.activeEditor = null;
        });
    }
}
