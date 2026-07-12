"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const geometry = require("../../built/inkybit-editor/inkyImageEditorGeometry");

assert.equal(geometry.getInkyCharWidth(" "), 2, "blank glyph matches native width");
assert.equal(geometry.getInkyCharAdvance(" ", 3), 9, "blank glyph includes scaled gap");
assert.equal(geometry.getInkyCharWidth("A"), 4, "golden A width");
assert.equal(geometry.getInkyCharAdvance("A", 2), 10, "glyph advance includes one-pixel gap");

assert.deepEqual(
    geometry.layoutInkyText("A A", 0, 0, 2, 20),
    [
        { ch: "A", x: 0, y: 0, width: 8 },
        { ch: " ", x: 10, y: 0, width: 4 },
        { ch: "A", x: 0, y: 12, width: 8 }
    ],
    "text layout matches runtime spacing and wrap"
);

assert.deepEqual(
    geometry.fitInkyViewport(600, 400, 250, 120),
    { zoom: 2.4, panX: 0, panY: 56 },
    "fit transform centres the complete image in the viewport"
);
assert.deepEqual(
    geometry.clampInkyViewport(600, 400, 250, 120, { zoom: 3, panX: 100, panY: -50 }),
    { zoom: 3, panX: 0, panY: 20 },
    "pan clamps a large image while centring a smaller dimension"
);
assert.deepEqual(
    geometry.clampInkyViewport(600, 300, 250, 120, { zoom: 3, panX: -999, panY: -999 }),
    { zoom: 3, panX: -150, panY: -60 },
    "pan can reveal the far image edges without leaving the viewport"
);

const fieldSource = readFileSync(resolve(__dirname, "../../fieldeditors/inkyImageField.ts"), "utf8");
assert.match(fieldSource, /if \(this\.errorBlock \|\| !this\.pixels\) return;/,
    "invalid and future expressions must never open a blank editor");
assert.match(fieldSource, /this\.errorBlock \? 'invalid inky:bit image'/,
    "the non-editable field must surface its parse error");
assert.match(fieldSource, /private activeEditor: InkyImageEditor \| null/,
    "the field must own the editor lifetime");
assert.match(fieldSource, /onDispose\(\)[\s\S]*?this\.activeEditor\.dispose\(\)/,
    "field disposal must close an active editor");

const editorSource = readFileSync(resolve(__dirname, "../../fieldeditors/inkyImageEditor.ts"), "utf8");
const cancelBody = editorSource.match(/private cancel\(\) \{([\s\S]*?)\n    \}\n\n    \/\/ ── Callbacks/);
assert(cancelBody, "cancel implementation exists");
assert(!cancelBody[1].includes("_onDone"), "Cancel must not emit a field change");
assert.match(editorSource, /const cw = Math\.max\(1, this\.canvasWrap\.clientWidth\)/,
    "render surface must use viewport width rather than transformed image width");

console.log("Inky editor: runtime text, viewport, invalid-value, cancel and disposal regressions covered");
