# Changelog

## 2.8.0

### Added
- **OpenRouter support.** [OpenRouter](https://openrouter.ai) keys now work through the existing custom endpoint field, giving teams that consolidate model access and billing through one gateway a way to use FigmaLint without a direct Anthropic/OpenAI/Google key. Under the OpenAI provider, expand the custom endpoint section and set:
  - **Endpoint URL** — `https://openrouter.ai/api/v1` (the bare `https://openrouter.ai` also works; the API path is filled in).
  - **Deployment / model name** — the OpenRouter model slug, e.g. `anthropic/claude-sonnet-4.5` or `openai/gpt-5.5`. This overrides the model dropdown.
  - **API key** — your `sk-or-v1-…` key.

  `openrouter.ai` has been added to the manifest network allowlist. Requests use the standard `Authorization: Bearer` header, plus two optional attribution headers (`HTTP-Referer`, `X-Title`) that label the plugin in your OpenRouter activity log and carry no user or document data.

### Fixed
- **An OpenRouter key pasted without an endpoint now explains itself.** `sk-or-v1-…` keys satisfy the OpenAI `sk-` prefix check, so they previously saved cleanly and then failed at analyze time with a confusing 401 from `api.openai.com`. The key is now recognized on sight — inline while typing and at save time — with the endpoint URL and model slug it needs.
- The blocked-domain error for custom endpoints listed two Azure hosts (`*.services.ai.azure.com`, `*.inference.ai.azure.com`) that were folded into `*.ai.azure.com` back in 2.7.5, so it named domains the manifest no longer contained. It now reports the actual allowlist. Same stale list corrected in `SECURITY.md`.
- **Grouped components are classified as containers again.** The component-family check tested interactive names before the container check, so anything matching both — "Button Group", "Avatar Group", "Radio Group" — was typed as a button or avatar and analyzed for interaction states it doesn't have. The container branch is now evaluated first, which also makes the `*-group` patterns reachable for the first time.
- **Checkboxes in the batch-fix preview render at their native size.** A global `input` rule stretched every input to full width with a 32px min-height, which applied to the batch-fix selection checkboxes too. Text-like inputs keep that treatment; checkboxes and radios no longer do. Long token names in the preview also wrap instead of forcing the modal to scroll sideways.

## 2.7.5

### Fixed
- **Azure AI Foundry endpoints (`*.ai.azure.com`) are now allowlisted.** The network allowlist only covered `*.services.ai.azure.com` and `*.inference.ai.azure.com`, so Foundry hosts on other `*.ai.azure.com` subdomains were silently blocked by Figma's sandbox (surfacing as the opaque error fixed in 2.7.4). Replaced the two narrow patterns with `*.ai.azure.com`, which covers the whole Foundry family.
- **A base endpoint URL now works, not just the full one.** Azure's docs present the endpoint as a base ending in `/openai/v1`; pasting that returned a 404 because the plugin POSTed to it verbatim. The plugin now appends `/chat/completions` when it's missing, so both `.../openai/v1` and `.../openai/v1/chat/completions` work.

### Changed
- Clearer custom-endpoint help: the deployment / model field is flagged as **required for Azure** (a blank or wrong deployment name is the usual cause of a 404 "model not found"), and the endpoint field documents that a base URL is accepted.

## 2.7.4

### Fixed
- **Custom endpoint (Azure) failures now explain what actually went wrong** instead of "Unexpected error calling OpenAI: Unknown error". When a request fails before an HTTP response — most often because Figma's network sandbox blocked the endpoint's domain, or the Endpoint URL was malformed — the thrown value can cross the plugin sandbox boundary as a non-`Error`, and its real message was being discarded. The provider call now:
  - Extracts the underlying message however it's shaped (Error, string, or object).
  - Detects a Figma domain-block and names the blocked host plus the supported Azure domains (`*.openai.azure.com`, `*.services.ai.azure.com`, `*.cognitiveservices.azure.com`, `*.inference.ai.azure.com`).
  - Includes the target host in network and unknown-error messages, and logs the raw failure to the dev console for inspection.

## 2.7.3

### Fixed
- **The custom endpoint (Azure) fields were too easy to miss.** The section shipped as a collapsed disclosure labeled "Custom endpoint (Azure / OpenAI-compatible)" that read like a static heading, and pasting an Azure key showed only a red `OpenAI keys start with "sk-"` error — implying the key type was unsupported rather than pointing at the fix. Now:
  - Pasting a non-`sk-` key with the OpenAI provider auto-expands the custom endpoint section and the error explains that entering an endpoint URL skips the `sk-` check.
  - The disclosure is restyled as an interactive link ("Using Azure or a custom endpoint? Set it up here").
  - Typing an endpoint URL clears the key-format error immediately (previously it lingered until the key field was edited again).

## 2.7.2

### Fixed
- **Anthropic Admin API keys are now caught with a clear explanation.** Org-issued `sk-ant-admin...` keys manage an organization but cannot call Claude models — previously they passed format validation and failed later with a generic "Invalid API key" 401. FigmaLint now rejects them at save time (and inline while typing) with guidance to create a standard `sk-ant-api...` key instead. This is the most common reason an org-issued key fails while a personal key works.
- **Anthropic 401/403 errors now surface the API's actual message** (revoked key, workspace restriction, model access) plus targeted guidance, instead of a generic "invalid key" line. 400 billing errors ("credit balance is too low") now say to add credits rather than "check your request format".

## 2.7.1

### Fixed
- **Token suggestions now respect Figma variable scopes.** FigmaLint previously matched hard-coded values to variables purely by resolved value, so a 10px padding could be "fixed" with `opacity/10` — a variable scoped to layer opacity only. Suggestions are now filtered by the variable's `scopes`, mirroring Figma's own variable picker:
  - Spacing/size fixes only offer variables scoped to the matching field — padding/gap → `GAP`/`WIDTH_HEIGHT`, corner radius → `CORNER_RADIUS`, stroke weight → `STROKE_FLOAT`. An `OPACITY`-scoped variable is never suggested for these.
  - Color fixes filter fills vs strokes (`ALL_FILLS`/`FRAME_FILL`/`SHAPE_FILL`/`TEXT_FILL` vs `STROKE_COLOR`).
  - Variables with no scope restriction (`ALL_SCOPES` or unscoped) are unaffected, so existing token systems keep matching as before. If the only value-match is a mis-scoped token, FigmaLint now offers no suggestion rather than a wrong one.

## 2.7.0

### Added
- **Custom OpenAI endpoint (Azure OpenAI / Azure AI Foundry)** — the OpenAI provider can now be pointed at your own Azure deployment instead of `api.openai.com`. A collapsible **Custom endpoint** section under the OpenAI provider settings takes an **Endpoint URL** and a **Deployment / model name**:
  - Works with **Azure OpenAI** (`https://YOUR-RESOURCE.openai.azure.com/openai/v1/chat/completions`) and **Azure AI Foundry** endpoints. The recommended path is Azure's OpenAI-compatible **v1 API**.
  - Auth is detected automatically: Azure domains (`*.azure.com`) use the `api-key` header; other OpenAI-compatible gateways keep the standard `Authorization: Bearer` header.
  - Azure/gateway keys don't follow the `sk-` convention, so key-format validation is relaxed when a custom endpoint is set (a non-empty key is required).
  - Leave the endpoint blank to use the default OpenAI API. The setting is stored locally per user and restored on reopen.
  - Model traffic goes directly to your Azure tenant — nothing routes through OpenAI's public API. This is the recommended configuration for teams whose security process only approves Azure-hosted models.
- Manifest network allowlist now includes Azure's model domains (`*.openai.azure.com`, `*.services.ai.azure.com`, `*.cognitiveservices.azure.com`, `*.inference.ai.azure.com`) with a documented `reasoning` string for security review.
- **`SECURITY.md`** — a security & privacy brief covering data flows, key storage, what leaves the machine, and the Azure option, for teams doing due diligence before approving the plugin.

## 2.6.1

- **Vector artwork no longer pollutes token analysis** — fills, strokes, stroke weights, and corner radii on SVG geometry (`VECTOR`, `BOOLEAN_OPERATION`, `STAR`, `POLYGON`, `LINE`) are never reported as hard-coded values. Icons and logos previously flooded the audit with unfixable findings and dragged down the token score. Variables/styles bound to vector fills (e.g. tokenized mono icons) still count as token usage
- **New: exclude layers from analysis** — prefix any layer name with `.` or `_` (e.g. `_logo`, `.brand-illustration`) and FigmaLint skips it and everything inside it, in both token analysis and layer-naming checks. Same convention Figma uses to exclude components from publishing

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
