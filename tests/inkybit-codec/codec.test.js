"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const golden = require("./golden-v1.json");
const codec = require("../../built/inkybit-codec/inkyImageCodec");

function makePixels(pattern) {
    const pixels = new Uint8Array(codec.IBIT_PIXEL_COUNT);
    switch (pattern) {
        case "white":
            return pixels;
        case "black":
            pixels.fill(codec.InkyBitColour.Black);
            return pixels;
        case "red":
            pixels.fill(codec.InkyBitColour.Red);
            return pixels;
        case "alternating":
            for (let i = 0; i < pixels.length; i++) pixels[i] = i % 3;
            return pixels;
        case "boundaries": {
            const marks = [
                [0, 1], [1, 2], [2, 1], [3, 2], [4, 2],
                [248, 1], [249, 2], [250, 2], [251, 1],
                [29996, 1], [29997, 2], [29998, 1], [29999, 2]
            ];
            for (const [index, colour] of marks) pixels[index] = colour;
            return pixels;
        }
        default:
            throw new Error("unknown golden pattern " + pattern);
    }
}

function sha256(bytes) {
    return createHash("sha256").update(bytes).digest("hex");
}

function assertPixelsEqual(actual, expected, label) {
    assert.deepEqual(Buffer.from(actual), Buffer.from(expected), label);
}

function expectInvalid(action, message) {
    assert.throws(action, /Invalid IBIT v1 image/, message);
}

assert.equal(codec.IBIT_PIXEL_COUNT, golden.pixelCount);
assert.equal(codec.IBIT_ENCODED_LENGTH, golden.encodedLength);

for (const vector of golden.vectors) {
    const pixels = makePixels(vector.pattern);
    const encoded = codec.encodeInkyBitImage(pixels);
    assert.equal(encoded.length, 7510, vector.name + " encoded length");
    assert.equal(Buffer.from(encoded.subarray(0, 10)).toString("hex"), golden.headerHex);
    assert.equal(sha256(encoded), vector.sha256, vector.name + " golden SHA-256");
    assertPixelsEqual(codec.decodeInkyBitImage(encoded), pixels, vector.name + " round trip");
}

const packingPixels = new Uint8Array(codec.IBIT_PIXEL_COUNT);
packingPixels.set([0, 1, 2, 0, 2, 1, 0, 2]);
const packingBytes = codec.encodeInkyBitImage(packingPixels);
assert.equal(packingBytes[10], 0x18, "first pixel occupies bits 7-6");
assert.equal(packingBytes[11], 0x92, "four pixels pack in row-major order");

for (const seed of [0, 1, 0x12345678, 0xffffffff]) {
    let state = seed >>> 0;
    const pixels = new Uint8Array(codec.IBIT_PIXEL_COUNT);
    for (let i = 0; i < pixels.length; i++) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        pixels[i] = state % 3;
    }
    assertPixelsEqual(
        codec.decodeInkyBitImage(codec.encodeInkyBitImage(pixels)),
        pixels,
        "generated fixture seed " + seed
    );
}

expectInvalid(() => codec.encodeInkyBitImage(new Uint8Array(29999)), "short pixels");
expectInvalid(() => codec.encodeInkyBitImage(new Uint8Array(30001)), "long pixels");
for (const invalidColour of [3, 4, -1, 255]) {
    const pixels = new Array(codec.IBIT_PIXEL_COUNT).fill(0);
    pixels[1234] = invalidColour;
    expectInvalid(() => codec.encodeInkyBitImage(pixels), "invalid colour " + invalidColour);
}

const valid = codec.encodeInkyBitImage(new Uint8Array(codec.IBIT_PIXEL_COUNT));
expectInvalid(() => codec.decodeInkyBitImage(valid.subarray(0, 7509)), "short encoded image");
expectInvalid(() => codec.decodeInkyBitImage(new Uint8Array(7511)), "long encoded image");

for (const [label, offset, value] of [
    ["magic", 0, 0],
    ["version", 4, 2],
    ["encoding", 5, 2],
    ["width", 6, 249],
    ["height", 8, 119],
    ["reserved colour", 10, 0xc0]
]) {
    const malformed = valid.slice();
    malformed[offset] = value;
    expectInvalid(() => codec.decodeInkyBitImage(malformed), label);
}

const literal = codec.createWhiteInkyBitImageLiteral();
assert.ok(literal.startsWith("hex`494249540101fa007800"));
assert.equal(literal.length, 5 + 7510 * 2, "MakeCode hex literal source length");

console.log("IBIT v1 codec: 5 goldens, 4 generated round trips, malformed input coverage");
