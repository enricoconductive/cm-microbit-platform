import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const output = resolve(root, process.env.PREVIEW_OUTPUT || "built/packaged/pxt-microbit");
const index = readFileSync(resolve(output, "index.html"), "utf8");
const manifest = JSON.parse(readFileSync(resolve(output, "inkybit-preview-manifest.json"), "utf8"));
const targetText = readFileSync(resolve(output, "target.json"), "utf8");

assert(index.includes("inkybit-development-preview"), "development label is missing");
assert.equal(manifest.extension.commit.length, 40, "extension revision is not a full commit SHA");
assert.notEqual(manifest.target.commit, undefined, "target revision is missing");
assert(targetText.includes('"inkybit"'), "pinned Inky:Bit consumer was not bundled");
assert(targetText.includes("inkyimage_picker"), "selector consumer API is absent from target bundle");
console.log(`verified packaged preview: target ${manifest.target.commit}, extension ${manifest.extension.commit}`);
