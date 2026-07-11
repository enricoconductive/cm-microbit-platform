# Inky:Bit image editor development foundation

This branch is a self-hosted development target. It does not replace public MakeCode and does not add the custom field or native full-screen loader yet.

## Pinned revisions

The machine-readable pins live in inkybit-toolchain.json. The target starts from Microsoft pxt-microbit commit 4b304c58999bd330bc37b7fb01577e6122760ae3. The integration project loads pxt-inkybit commit 71d9efe75b0fe40ec203e08b430f3fc9f9f7abf5.

The target package pins pxt-core 13.0.1 and pxt-common-packages 14.0.2. Use Node 22.23.1 and npm 11.18.0. Although the upstream build workflow currently selects Node 20.x, the current Blockly 13.1.1 package declares Node 22 or newer; a clean Node 20 install fails with EBADENGINE.

## Remotes and branches

Target checkout:

    origin    https://github.com/enricoconductive/pxt-microbit.git
    upstream  https://github.com/microsoft/pxt-microbit.git
    branch    feature/inkybit-image-editor-v1

Extension checkout:

    origin    https://github.com/enricoconductive/pxt-inkybit.git
    upstream  https://github.com/pimoroni/pxt-inkybit.git
    branch    feature/inkybit-image-editor-v1

Public master remains unchanged in both repositories.

## Clean setup and verification

Run these commands in the target checkout:

    nvm install
    nvm use
    npm install --global npm@11.18.0
    npm ci
    npm run test:inkybit-codec
    npm run build:target
    npm run test:inkybit-integration

Run these commands in the extension checkout:

    nvm install
    nvm use
    npm install --global npm@11.18.0
    npm ci
    npm run verify:default-image
    npm run test:extension

The target build and extension test may contact MakeCode compile services for native artifacts. The codec test is entirely local and deterministic.

On this pinned upstream state, pxt buildtarget emits non-fatal simulator parser diagnostics for optional-chaining and nullish-coalescing expressions, plus missing static SVG warnings. The command still exits successfully and produces the target; treat a nonzero exit or missing built/target.json as failure.
