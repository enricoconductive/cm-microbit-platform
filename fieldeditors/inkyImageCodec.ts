/**
 * Reference browser codec for the fixed-size Inky:Bit packed image format.
 *
 * Version 1 is 250x120, row-major, and packs four 2-bit pixels per byte.
 * This module deliberately has no Blockly, DOM, or target-runtime dependency.
 */

export const IBIT_MAGIC = [0x49, 0x42, 0x49, 0x54];
export const IBIT_VERSION = 1;
export const IBIT_ENCODING_PACKED_2BPP = 1;
export const IBIT_WIDTH = 250;
export const IBIT_HEIGHT = 120;
export const IBIT_PIXEL_COUNT = IBIT_WIDTH * IBIT_HEIGHT;
export const IBIT_HEADER_LENGTH = 10;
export const IBIT_PAYLOAD_LENGTH = IBIT_PIXEL_COUNT / 4;
export const IBIT_ENCODED_LENGTH = IBIT_HEADER_LENGTH + IBIT_PAYLOAD_LENGTH;

export enum InkyBitColour {
    White = 0,
    Black = 1,
    Red = 2
}

function fail(message: string): never {
    throw new Error("Invalid IBIT v1 image: " + message);
}

function readUint16LE(bytes: ArrayLike<number>, offset: number): number {
    return bytes[offset] | (bytes[offset + 1] << 8);
}

export function encodeInkyBitImage(pixels: ArrayLike<number>): Uint8Array {
    if (!pixels || pixels.length !== IBIT_PIXEL_COUNT) {
        fail("expected " + IBIT_PIXEL_COUNT + " pixels");
    }

    const encoded = new Uint8Array(IBIT_ENCODED_LENGTH);
    encoded.set(IBIT_MAGIC, 0);
    encoded[4] = IBIT_VERSION;
    encoded[5] = IBIT_ENCODING_PACKED_2BPP;
    encoded[6] = IBIT_WIDTH & 0xff;
    encoded[7] = IBIT_WIDTH >> 8;
    encoded[8] = IBIT_HEIGHT & 0xff;
    encoded[9] = IBIT_HEIGHT >> 8;

    for (let pixelIndex = 0; pixelIndex < IBIT_PIXEL_COUNT; pixelIndex += 4) {
        let packed = 0;
        for (let slot = 0; slot < 4; slot++) {
            const colour = pixels[pixelIndex + slot];
            if (colour !== InkyBitColour.White &&
                colour !== InkyBitColour.Black &&
                colour !== InkyBitColour.Red) {
                fail("pixel " + (pixelIndex + slot) + " has unsupported colour code " + colour);
            }
            packed |= colour << (6 - slot * 2);
        }
        encoded[IBIT_HEADER_LENGTH + pixelIndex / 4] = packed;
    }

    return encoded;
}

export function decodeInkyBitImage(encoded: ArrayLike<number>): Uint8Array {
    if (!encoded || encoded.length !== IBIT_ENCODED_LENGTH) {
        fail("expected " + IBIT_ENCODED_LENGTH + " encoded bytes");
    }

    for (let i = 0; i < IBIT_MAGIC.length; i++) {
        if (encoded[i] !== IBIT_MAGIC[i]) fail("wrong magic");
    }
    if (encoded[4] !== IBIT_VERSION) fail("unsupported version " + encoded[4]);
    if (encoded[5] !== IBIT_ENCODING_PACKED_2BPP) {
        fail("unsupported encoding " + encoded[5]);
    }
    if (readUint16LE(encoded, 6) !== IBIT_WIDTH) fail("wrong width");
    if (readUint16LE(encoded, 8) !== IBIT_HEIGHT) fail("wrong height");

    const pixels = new Uint8Array(IBIT_PIXEL_COUNT);
    for (let payloadIndex = 0; payloadIndex < IBIT_PAYLOAD_LENGTH; payloadIndex++) {
        const packed = encoded[IBIT_HEADER_LENGTH + payloadIndex];
        for (let slot = 0; slot < 4; slot++) {
            const colour = (packed >> (6 - slot * 2)) & 0x03;
            if (colour === 3) {
                fail("payload byte " + payloadIndex + " uses reserved colour code 3");
            }
            pixels[payloadIndex * 4 + slot] = colour;
        }
    }

    return pixels;
}

export function encodedImageToHexLiteral(encoded: ArrayLike<number>): string {
    if (!encoded || encoded.length !== IBIT_ENCODED_LENGTH) {
        fail("expected " + IBIT_ENCODED_LENGTH + " encoded bytes");
    }
    let hex = "";
    for (let i = 0; i < encoded.length; i++) {
        hex += encoded[i].toString(16).padStart(2, "0");
    }
    return "hex`" + hex + "`";
}

export function createWhiteInkyBitImageLiteral(): string {
    return encodedImageToHexLiteral(encodeInkyBitImage(new Uint8Array(IBIT_PIXEL_COUNT)));
}
