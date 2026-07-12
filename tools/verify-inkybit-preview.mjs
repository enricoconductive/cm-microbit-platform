import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const output = resolve(root, process.env.PREVIEW_OUTPUT || "built/packaged/pxt-microbit");
const pins = JSON.parse(readFileSync(resolve(root, "inkybit-toolchain.json"), "utf8"));
const index = readFileSync(resolve(output, "index.html"), "utf8");
const manifest = JSON.parse(readFileSync(resolve(output, "inkybit-preview-manifest.json"), "utf8"));
const targetText = readFileSync(resolve(output, "target.json"), "utf8");

assert(index.includes("inkybit-development-preview"), "development label is missing");
assert.equal(manifest.extension.repository, pins.extension.repository, "extension repository does not match toolchain pin");
assert.equal(manifest.extension.commit, pins.extension.commit, "extension revision does not match toolchain pin");
assert.equal(manifest.target.repository, pins.target.repository, "target repository does not match toolchain pin");
assert.equal(manifest.target.upstreamCommit, pins.target.upstreamCommit, "target upstream revision does not match toolchain pin");
assert.equal(manifest.target.pxtCore, pins.target.pxtCore, "pxt-core revision does not match toolchain pin");
assert.equal(manifest.target.pxtCommonPackages, pins.target.pxtCommonPackages, "pxt-common-packages revision does not match toolchain pin");
assert.notEqual(manifest.target.commit, undefined, "target revision is missing");
if (process.env.PREVIEW_TARGET_SHA) {
    assert.equal(manifest.target.commit, process.env.PREVIEW_TARGET_SHA, "target revision does not match build environment");
}
assert(targetText.includes('"inkybit"'), "pinned Inky:Bit consumer was not bundled");
assert(targetText.includes("inkyimage_picker"), "selector consumer API is absent from target bundle");
console.log(`verified packaged preview: target ${manifest.target.commit}, extension ${manifest.extension.commit}`);
