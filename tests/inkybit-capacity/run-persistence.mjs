import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const require = createRequire(import.meta.url);
const codec = require(resolve(root, "built/inkybit-codec/inkyImageCodec.js"));
const results = [];

function distinctPixels(seed) {
    const pixels = new Uint8Array(codec.IBIT_PIXEL_COUNT);
    let state = seed + 1;
    for (let i = 0; i < pixels.length; i++) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        pixels[i] = state % 3;
    }
    return pixels;
}

for (const imageCount of [1, 2, 4, 8]) {
    const literals = [];
    const started = performance.now();
    for (let i = 0; i < imageCount; i++) {
        literals.push(codec.encodedImageToHexLiteral(codec.encodeInkyBitImage(distinctPixels(i))));
    }
    const loadMs = performance.now() - started;

    const editStarted = performance.now();
    const edited = literals.map((value, i) => {
        const hex = value.slice(4, -1);
        const bytes = Uint8Array.from(Buffer.from(hex, "hex"));
        const pixels = codec.decodeInkyBitImage(bytes);
        pixels[i] = (pixels[i] + 1) % 3;
        return codec.encodedImageToHexLiteral(codec.encodeInkyBitImage(pixels));
    });
    const editMs = performance.now() - editStarted;

    const dir = resolve(tmpdir(), `inkybit-persistence-${process.pid}-${imageCount}`);
    mkdirSync(dir, { recursive: true });
    const project = resolve(dir, "project.json");
    const saveStarted = performance.now();
    writeFileSync(project, JSON.stringify({ images: edited }));
    const reloaded = JSON.parse(readFileSync(project, "utf8")).images;
    const saveReloadMs = performance.now() - saveStarted;
    assert.deepEqual(reloaded, edited, `${imageCount}-image save/reload literal equality`);
    for (let i = 0; i < imageCount; i++) {
        const bytes = Buffer.from(reloaded[i].slice(4, -1), "hex");
        assert.equal(bytes.length, codec.IBIT_ENCODED_LENGTH);
        assert.deepEqual(codec.decodeInkyBitImage(bytes), codec.decodeInkyBitImage(
            Buffer.from(edited[i].slice(4, -1), "hex")));
    }
    rmSync(dir, { recursive: true, force: true });
    results.push({ imageCount, loadMs, editMs, saveReloadMs });
}

const output = {
    generatedAt: new Date().toISOString(),
    node: process.version,
    note: "Headless codec/project-model timings; browser UI timings remain a separate gate.",
    results
};
const resultDir = resolve(root, "tests/inkybit-capacity/results");
mkdirSync(resultDir, { recursive: true });
writeFileSync(resolve(resultDir, "persistence-latest.json"), JSON.stringify(output, null, 2) + "\n");
console.log("IBIT persistence: 1/2/4/8-image byte-exact edit and save/reload passed");
