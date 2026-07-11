# Inky:Bit capacity matrix

Run `npm run test:inkybit-capacity` after `npm run build:target`. The runner
generates byte-distinct 1/2/4/8-image programs and a deliberately oversized
64-image program, compiles each against the exact extension commit in
`inkybit-toolchain.json`, and records source size, compile latency, generated
code, total/free flash, incremental flash, and the oversized diagnostic in
`results/latest.json`.

Use `npm run test:inkybit-capacity -- --quick` to omit only the deliberate
oversize check. The four-image row is an enforced product gate.

The generated `.work` project is disposable and excluded from Git. Timings are
observations from the named machine/run, not performance guarantees.

Run `npm run test:inkybit-persistence` for byte-exact 1/2/4/8-image codec-model
load, one-pixel edit, save, and reload timings. These are deliberately labelled
headless model timings; they do not substitute for the browser UI gate.
