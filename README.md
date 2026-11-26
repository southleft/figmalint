# FigmaLint

A Figma plugin that audits components for design system hygiene, accessibility and AI handoff, then helps you fix what it finds.

FigmaLint checks your components against real standards: hard-coded values, generic layer names, missing states, WCAG contrast and target sizes. It also checks the things Figma's MCP server actually passes to AI coding tools, such as variable code syntax, auto layout, property names and usage guidance. Most problems can be fixed from the panel, and the results export as documentation for developers or a prompt for AI code generation.

**[Install from Figma Community](https://www.figma.com/community/plugin/1521241390290871981/figmalint)**

## Features

### Works Without an API Key

The audit runs with no key and no account. The hygiene score, every accessibility and AI handoff check, variable and naming detection, the auto-fixes, setting code syntax, batch mode, the instance sheet and all three exports are computed locally from your Figma file. No model is involved, so **the results are identical with or without a key**.

Adding a key adds the AI-authored layer: generated component descriptions, recommended properties, and the Design Systems Chat tab.

This matters for teams whose organization can't issue an API key — keys are billed separately from any Claude, ChatGPT, or Gemini subscription. Run the audit unkeyed, export the **AI Prompt** or **Markdown** spec, and paste it into whatever AI tooling your organization already approves.

### Multi-Provider AI Analysis

Choose your preferred AI provider and model:

- **Anthropic** — Claude Opus 5, Sonnet 5, Haiku 4.5
- **OpenAI** — GPT-5.6 Sol, GPT-5.6 Terra, GPT-5.6 Luna
- **Google** — Gemini 3.7 Flash, Gemini 3.6 Flash, Gemini 3.5 Flash-Lite
- **OpenRouter** — one key for models from all of the above and more

Switch providers and models at any time. API keys are stored per provider and auto-detected from key format.

**Azure OpenAI / Azure AI Foundry** — The OpenAI provider can be routed through your own Azure deployment instead of `api.openai.com`. Expand **Custom endpoint** under the OpenAI settings and enter your Azure **Endpoint URL** (e.g. `https://YOUR-RESOURCE.openai.azure.com/openai/v1`) and **Deployment name**. Azure keys are sent via the `api-key` header automatically; model traffic stays inside your Azure tenant. This is the recommended setup for teams whose security process only approves Azure-hosted models — see [SECURITY.md](SECURITY.md).

**OpenRouter** — [OpenRouter](https://openrouter.ai) is available as its own entry in the **AI Provider** dropdown. It fronts models from many vendors behind a single key and bill, so it's the practical route for teams whose organization can't issue a direct Anthropic, OpenAI, or Google key. Select it, paste your `sk-or-v1-…` key, and pick a model — the dropdown carries a shortlist (Claude, GPT, Gemini), and an **Other model slug** field takes any slug from [openrouter.ai/models](https://openrouter.ai/models) when you want something outside it. Note that OpenRouter slugs are its own namespace and don't always match the vendor's native ID (`openai/gpt-5.6-sol`, not `gpt-5.6`).

### The Audit

Every check is listed, passes included, with its measured value and the target it's measured against. A scorecard sums up each category in plain words ("No focus state", "All 62 use variables"), and an **All checks / Problems only** switch narrows the list to what needs work.

- **Accessibility (WCAG 2.2):** color contrast, including colors bound to variables, with disabled variants excluded as WCAG allows. Target size against 24×24 (AA), noting the 44×44 touch size. Focus state, including focus that comes from nested items in tabs, radio groups and selects. Minimum font size.
- **Interactive states:** hover, focus, pressed, active and disabled, from State or Interaction properties.
- **Variables:** hard-coded colors, spacing, radii and strokes, and which variables are in use.
- **Layer names:** generic names like Frame 12 and Rectangle 4.
- **Component setup:** configurable properties.
- **Batch mode:** select several components and analyze them in one pass.
- **Always fresh:** every Analyze reads the component again, so edits are never hidden by a cached result. Your last analysis is saved locally and can be restored when you reopen the plugin.

### AI Handoff Checks

Figma's MCP server turns a component into the context an AI coding tool works from. These checks look at what it passes along:

- **Variables mapped to code:** variables without code syntax reach AI tools as CSS variables built from the Figma path (`var(--bg\/neutral\/weak)`), which don't exist in your code.
- **Auto layout:** containers without it become absolute positioning.
- **Property names:** properties become the generated props word for word, so names and values with symbols are flagged.
- **Usage guidance:** the description is passed to AI tools as instructions, so it should say when and how to use the component.
- **Annotations** on interactive components, for behavior the visuals can't show.
- **Detached copies** of the component on the page, which AI tools rebuild instead of reusing.
- **Code Connect,** Figma's top recommendation, is listed as not checked, because plugins can't see it. Check it in Dev Mode.

AI handoff results are reported separately and don't change the hygiene score. FigmaLint doesn't call a component "AI ready". It reports what it measured.

### Design Token Detection

- Detects Figma Variables, Named Styles, and hard-coded values
- Categorizes tokens by type: colors, spacing, typography, effects, borders
- Distinguishes actual design tokens from hard-coded values with per-node deduplication
- Provides AI-driven suggestions for mapping hard-coded values to tokens
- Filters wrapper/boundary elements from scoring to reduce false positives
- Ignores vector artwork automatically — fills and strokes inside SVG geometry (icons, logos, illustrations) are never flagged as hard-coded values, though token bindings on them still count
- **Exclude any layer from analysis** by prefixing its name with `.` or `_` (e.g. `_logo`) — the whole subtree is skipped, same convention Figma uses for unpublished components

### Auto-Fix

Apply fixes directly from the analysis results:

- **Token binding** — Bind hard-coded colors, spacing, radii and strokes to design system variables. Searches both local and published library variables, so your tokens can live in a separate file. Matching **respects Figma variable scopes** the way Figma's own variable picker does: an opacity-scoped variable is never suggested for padding, and variables hidden from every picker (no scopes, as design systems often set on primitives) aren't suggested at all. Among equal matches it prefers variables scoped to the field and named for it, so 16px padding gets your spacing variable rather than a font size, and a pill-shaped radius gets your pill variable.
- **Set code syntax** — Fill in each variable's Web code syntax from its path (`bg/neutral/weak` → `var(--bg-neutral-weak)`), for the whole file or just this component's variables, with an optional prefix. Existing code syntax is never changed and names never collide. Use it when your code's variables are generated from these Figma variables (Tokens Studio, Style Dictionary or a Figma export); the dialog asks you to confirm the preview names match your code before writing.
- **Layer renaming** — Detects generic Figma names (Frame 1, Rectangle 4) and suggests semantic alternatives. Six naming strategies: Semantic, BEM, prefix-based, kebab-case, camelCase, snake_case. Recognizes 30+ semantic layer types.
- **Add component properties** — Add recommended Boolean, Text, or Instance Swap properties from AI suggestions with one click; they're automatically bound to the layer they control (visibility, text content, or swap target). Variant and state recommendations are shown as guidance only — each variant value needs a designed variant in the set, so FigmaLint never generates those.
- **Batch operations** — Fix All buttons to resolve all token or naming issues at once. The confirmation modal shows exactly which design token each value will bind to (e.g. `#FF6633 → color/brand/primary`), with per-row checkboxes to skip any you don't want.
- **Instant refresh after fixes** — the Token Analysis section re-reads from Figma after fixes are applied, no re-analysis (or API call) needed.

### AI-Powered Descriptions

Generates structured component descriptions with:

- Brief summary of the component and its variants
- PURPOSE, BEHAVIOR, COMPOSITION, USAGE, and CODE GENERATION NOTES sections
- Nested component inventory so AI tools know what sub-components already exist
- Comparison UI showing whether the Figma description matches the AI-generated one
- Review modal for comparing and approving description updates before they're written to Figma

### Hygiene Score

Each component gets a hygiene score out of 100 for the design-system audit:

- Interactive state coverage (weighted 3x)
- Variable adoption (weighted 2x)
- Accessibility checks
- Layer names, with a capped weight so many generic names can't outweigh the rest
- Component setup

### Design Systems Chat

A conversational interface for asking questions about your selected component. Supports multi-turn conversation with context about the component's properties, tokens, states, and structure.

### Instance Sheet

Generate a documentation grid of live instances next to your component: the first two variant properties as rows × columns, a row of values for every other variant property (such as size and state), true/false rows for every boolean property, and a list of text and instance swap properties with their defaults. The sheet is a standalone frame placed in empty canvas space (existing documentation frames are never touched), regenerating replaces the previous sheet in place, and it refreshes automatically when you add properties via FigmaLint. Variant values that are planned but not yet designed are shown as "—" coverage gaps, so the sheet doubles as a design-coverage map.

### Developer Handoff

Three export formats:

- **Markdown** — Comprehensive documentation with variants table, properties API, property quick reference, states with pass/fail status, slots, design token breakdown (tokens in use vs hard-coded), accessibility and AI handoff results, naming issues, and the AI review. Ready for ZeroHeight, Knapsack, or Supernova.
- **AI Prompt** — A structured specification you can paste into any AI tool to generate production-ready component code. Includes the full component spec, design tokens, accessibility requirements, and implementation notes.
- **JSON** — Complete analysis data including metadata, token analysis, audit results, naming issues, and properties for programmatic use.

## Getting Started

### From Figma Community

1. Visit [FigmaLint on Figma Community](https://www.figma.com/community/plugin/1521241390290871981/figmalint)
2. Click "Install"

### Manual Installation (Development)

1. Clone this repository
2. `npm install`
3. `npm run build`
4. In Figma: Plugins > Development > Import plugin from manifest
5. Select `dist/manifest.json` (the build output — the root `manifest.json` points at `code.js`, which only exists in `dist/`)

### Setup

Select a component and click Analyze (or press **Cmd/Ctrl+Enter**). No key or account is required for the audit.

To also generate descriptions, property recommendations, and use Chat:

1. Select a provider (Anthropic, OpenAI, Google, or OpenRouter)
2. Choose a model
3. Enter your API key

Tips: **Esc** closes the fix confirmation modal. If an analysis is slow, the Analyze button becomes **Stop analysis**; a stuck analysis auto-recovers after 90 seconds.

## Architecture

```
src/
├── code.ts                      # Plugin entry point
├── types.ts                     # TypeScript definitions
├── api/
│   ├── claude.ts                # Prompt construction and AI integration
│   └── providers/
│       ├── types.ts             # Provider type system
│       ├── index.ts             # Provider registry and routing
│       ├── anthropic.ts         # Anthropic (Claude) provider
│       ├── openai.ts            # OpenAI (GPT) provider
│       ├── google.ts            # Google (Gemini) provider
│       └── openrouter.ts        # OpenRouter provider
├── core/
│   ├── component-analyzer.ts    # Component analysis and prompt building
│   ├── token-analyzer.ts        # Design token detection and categorization
│   └── consistency-engine.ts    # Design-systems knowledge and prompt consistency
├── fixes/
│   ├── token-fixer.ts           # Token binding (color + spacing variables)
│   ├── naming-fixer.ts          # Layer renaming with semantic detection
│   └── code-syntax-fixer.ts     # Variable code syntax from variable paths
├── ui/
│   └── message-handler.ts       # Plugin ↔ UI message routing
└── utils/
    └── figma-helpers.ts         # Figma API utilities

ui-enhanced.html                 # Plugin interface (single-file HTML/CSS/JS)
```

## Development

### Prerequisites

- Node.js 16+
- An API key from [Anthropic](https://platform.claude.com/settings/keys), [OpenAI](https://platform.openai.com/api-keys), or [Google AI Studio](https://aistudio.google.com/apikey)

### Commands

```bash
npm install          # Install dependencies
npm run dev          # Development build with watch mode
npm run dev:debug    # Watch build with verbose debug logging enabled
npm run build        # Production build (debug logging stripped)
npm run lint         # Type checking
npm run clean        # Clean build artifacts
```

Debug logging (per-node traversal traces) is compiled out of production builds via esbuild's `__DEBUG__` define — use `npm run dev:debug` when you need it.

## Privacy & Security

- API keys stored in Figma's local storage per provider
- Component data is never stored externally (your last analysis result is cached locally in Figma's plugin storage so it can be restored when you reopen the plugin)
- Analysis calls go directly to the selected provider's API
- Design-system chat queries and analysis best-practice lookups are sent to the FigmaLint design-systems knowledge service (`design-systems-mcp.southleft-llc.workers.dev`) — these include your question text and high-level component context (component family, names), never your API keys
- Auto-fix operations modify only the properties you approve, and Set code syntax writes only variables that have none
- Open source

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes
4. Push and open a Pull Request

## License

ISC — see [LICENSE](LICENSE) for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/southleft/figmalint/issues)
- **Discussions**: Share ideas and get help from the community

---

Built by [Southleft](https://southleft.com)
