/**
 * Debug logging gate.
 *
 * `__DEBUG__` is substituted by esbuild at build time (`--define:__DEBUG__=false`
 * in the production bundle, `true` in `npm run dev:debug`), so debug branches are
 * dead-code-eliminated from shipped builds. The plugin's per-node analysis loops
 * log thousands of lines per run; with the Figma devtools console open that
 * serialization measurably slows analysis.
 */
declare const __DEBUG__: boolean | undefined;

export const DEBUG: boolean = typeof __DEBUG__ !== 'undefined' ? __DEBUG__ : false;

/** console.log that only emits in debug builds. Args are still evaluated —
 * wrap expensive serialization (e.g. JSON.stringify) in `if (DEBUG)` instead. */
export function debugLog(...args: unknown[]): void {
  if (DEBUG) {
    console.log(...args);
  }
}
