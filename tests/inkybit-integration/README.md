# Pinned Inky:Bit integration smoke fixture

The inkybit dependency in pxt.json is intentionally an immutable commit, not a branch or tag.

From the target root, run:

    npm run test:inkybit-integration

The command generates the canonical all-White IBIT literal into the ignored
`generated-main.ts` before installing and compiling the project.

This fixture compiles the Ticket 05 full-screen image block and then uses the
existing rectangle, text, and show APIs. It deliberately calls `show()` once,
after every buffer mutation. The extension pin is the revision whose native
loader host test and physical hardware fixture are documented in
`fixtures/ibit-v1/HARDWARE.md`.
