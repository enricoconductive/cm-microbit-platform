# Pinned Inky:Bit integration smoke fixture

The inkybit dependency in pxt.json is intentionally an immutable commit, not a branch or tag.

From the target root, run:

    npm run test:inkybit-integration

This fixture only proves that the pinned extension installs and its existing API compiles in the development target. The full-screen block and native loader are later tickets.
