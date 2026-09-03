import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const source = resolve(root, process.env.PREVIEW_OUTPUT || "built/packaged/cm-microbit-platform");
const fixture = mkdtempSync(resolve(tmpdir(), "inkybit-stale-preview-"));

try {
    for (const file of ["index.html", "target.json", "inkybit-preview-manifest.json", "cm-toolbox.css"]) {
        cpSync(resolve(source, file), resolve(fixture, file));
    }
    const manifestPath = resolve(fixture, "inkybit-preview-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.extension.commit = "39af70c3d257d65833c463641bb6eb963d64d09b";
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

    let output = "";
    try {
        execFileSync(process.execPath, [resolve(root, "tools/verify-inkybit-preview.mjs")], {
            cwd: root,
            env: { ...process.env, PREVIEW_OUTPUT: fixture },
            encoding: "utf8",
            stdio: "pipe"
        });
        assert.fail("verification unexpectedly accepted a stale extension revision");
    } catch (error) {
        output = `${error.stdout || ""}${error.stderr || ""}`;
    }
    assert.match(output, /extension revision does not match toolchain pin/);
    console.log("stale extension revision was rejected by preview verification");
} finally {
    rmSync(fixture, { recursive: true, force: true });
}
