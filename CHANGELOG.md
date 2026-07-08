# Changelog

## 2.6.0

### Models
- **Anthropic**: Claude Opus 4.8 and Claude Sonnet 5 replace Opus 4.7 / Sonnet 4.6 (Haiku 4.5 unchanged)
- **Google**: Gemini 3.5 Flash (new default), Gemini 3.1 Flash-Lite, and Gemini 2.5 Flash-Lite replace the retired preview IDs (`gemini-3.1-pro-preview`, `gemini-3-flash-preview`)
- **OpenAI**: GPT-5.5 / GPT-5.4 Mini / GPT-5.4 Nano confirmed current, unchanged
- Saved model selections are validated on load — a model retired by a plugin update now falls back to the provider default instead of silently persisting

### Fixed
- Analysis now always runs against the resolved node (instance → main component, variant → component set, child layer → analyzable ancestor). Previously the analyzer re-read the raw canvas selection, producing empty or mismatched results when a child layer was selected — and corrupting results if the selection changed during the AI call
- MCP-enhanced analysis actually works now — the default MCP server URL pointed at `localhost`, which Figma's network sandbox silently blocked on every run
- Batch mode is reachable — the plugin now listens for selection changes, so the batch toggle appears when multiple components are selected, and batch results render in the UI
- OpenAI rate-limit retry hints were reported in seconds where milliseconds were expected, breaking the retry countdown
- `npm run lint` (tsc) passes for the first time — 31 pre-existing type errors cleared, including a latent runtime hazard in variant-frame stroke logging

### Performance
- Figma-side extraction runs once per analysis instead of twice (~2× faster local phase)
- Design-systems knowledge is loaded once per session instead of re-fetched on every Analyze click (saves 1–5s per analysis)
- The AI call and design-system best-practice queries run in parallel (up to ~3s saved)
- Layer hierarchies are sent to the AI as compact depth-limited outlines instead of pretty-printed JSON (30–70% smaller prompts on large component sets — directly lowers API cost)
- Local variables are indexed once per session for token matching, with per-value memoization — previously every hard-coded value re-scanned every variable in the file
- Variable lookups are cached and the in-variant check computed once per traversal
- Detached-instance detection uses Figma's optimized `findAllWithCriteria` path
- Unchanged components are served from an analysis cache — instant results, no API cost; use Re-analyze to force a fresh run
- Debug logging (thousands of lines per analysis) is compiled out of production builds

### Added
- Staged progress indicator with Cancel button and a 90-second stuck-analysis watchdog
- "Will analyze: …" selection hint; Analyze disables for invalid selections
- Restore your last analysis when reopening the plugin (stored locally in Figma)
- Results header showing the analyzed component, timestamp, cached/restored badges, click-to-select, and a Re-analyze button
- Fix All modal resolves and displays the actual token each value will bind to, with per-row checkboxes
- Token Analysis refreshes automatically after fixes are applied (no re-analysis needed)
- "Add property" button on AI property recommendations — adds Boolean/Text/Instance Swap properties on the component:
  - Properties are **auto-bound** to the layer they plausibly control (visibility, text content, or swap target) across all variants, so they don't show as "not used within this component"; when no matching layer exists, the plugin says so instead of silently adding an unused property
  - Instance-swap recommendations map to real INSTANCE_SWAP properties (previously fell through to TEXT)
  - **Variant and state recommendations are guidance-only** (no Add button) — every variant value requires a designed variant node in the component set, so there is no canvas-mutation-free way to add them automatically, and generated canvas content can't be managed safely alongside hand-built documentation
- **Instance sheet generator** — an "Instance sheet" button in the results header builds a labeled documentation grid next to the component: variant axes as rows × columns, plus true/false rows for each boolean property. Always a standalone frame placed in guaranteed-empty space (never modifies existing docs frames — it points them out instead); re-running replaces the previously generated sheet in place; variant combinations that don't exist yet render as "—" so the sheet doubles as a coverage map. Adding a property via "Add property" automatically regenerates the sheet so it never goes stale
- Naming strategy picker for Rename All: Semantic, BEM, Prefix, camelCase, kebab-case, snake_case (with dry-run preview)
- Batch-fix progress ("Applying fixes… 12/30"), rate-limit countdown, provider-portal links on auth errors
- Keyboard shortcuts: Cmd/Ctrl+Enter to analyze, Esc to close the fix modal
- Inline API-key format validation while typing
- `npm run dev:debug` build with verbose traversal logging

### Removed
- ~800 lines of dead code: unused legacy Claude fetch path, unreachable playground/documentation tab code, orphaned message handlers, stale `src/manifest.json`

## 2.5.3 and earlier

See git history — version notes are recorded in commit messages.
