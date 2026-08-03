#!/usr/bin/env node
import { enableCompileCache } from 'node:module'

/**
 * V8 bytecode cache for our own module graph. Measured on this repository: `sgate check` 154.5 → 122.5 ms
 * and `sgate --version` 53.5 → 47.9 ms, which is the largest single win available at startup — `--timing`
 * attributes about half of a warm run to Node parsing and instantiating ~870 kB of bundled core before any
 * engine runs, and this removes the compile half of that on every run after the first.
 *
 * `main.js` is imported dynamically on purpose: a static import is hoisted above this call, so the graph
 * would be compiled before the cache existed and the call would do nothing. No argument, so a user can
 * still redirect or disable it with `NODE_COMPILE_CACHE`. The call reports failure in its return value
 * rather than throwing, and a miss costs only the compile it was meant to save, so there is nothing to
 * handle: a read-only or full cache directory degrades to today's behaviour.
 */
enableCompileCache()

await import('../dist/main.js')
