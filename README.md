# FigmaLint

An AI-powered Figma plugin that audits components for design system compliance, accessibility, and developer readiness — then helps you fix what it finds.

FigmaLint analyzes your components against real standards, surfaces hard-coded values and naming issues, and produces structured documentation ready for developer handoff or AI code generation.

**[Install from Figma Community](https://www.figma.com/community/plugin/1521241390290871981/figmalint)**

## Features

### Multi-Provider AI Analysis

Choose your preferred AI provider and model:

- **Anthropic** — Claude Opus 4.8, Sonnet 5, Haiku 4.5
- **OpenAI** — GPT-5.5, GPT-5.4 Mini, GPT-5.4 Nano
- **Google** — Gemini 3.5 Flash, Gemini 3.1 Flash-Lite, Gemini 2.5 Flash-Lite

Switch providers and models at any time. API keys are stored per provider and auto-detected from key format.

### Component Analysis

- Detects missing interactive states (hover, focus, disabled, pressed, active)
- Evaluates accessibility against WCAG standards — contrast ratio, touch target size, focus indicators, font size
- Checks component readiness — property configuration, descriptions, structure
- Identifies component variants and maps their relationships
- Lists nested component instances used within the design
- **Batch mode** — select multiple components and analyze them in one pass (the toggle appears automatically when more than one analyzable component is selected)
- **Live progress with cancel** — analysis shows staged progress (extract → AI → design-system guidance → audit) and can be cancelled mid-run; a selection hint under the Analyze button shows exactly what will be analyzed
- **Smart caching** — re-analyzing an unchanged component returns instantly from cache (no API cost); click Analyze again or use the Re-analyze button in the results header for a fresh run
- **Session restore** — your last analysis is saved locally and can be restored when you reopen the plugin, so closing Figma doesn't discard a paid analysis

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

- **Token binding** — Bind hard-coded colors and spacing values to design system variables. Searches both local and published library variables, so your tokens can live in a separate file. Fuzzy matching finds the closest token with property-aware scoring (stroke weight matches stroke tokens, padding matches spacing tokens, etc.)
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

### Component Audit Scoring

Each component receives a readiness score based on:

- Design token adoption (weighted 2x)
- Interactive state coverage (weighted 3x)
- Accessibility checks (contrast, touch targets, focus, font size)
- Component readiness checks (descriptions, property configuration)
- Score-aware AI Interpretation that adapts messaging to actual results

### Design Systems Chat

A conversational interface for asking questions about your selected component. Supports multi-turn conversation with context about the component's properties, tokens, states, and structure.

### Instance Sheet

Generate a documentation grid of live instances next to your component — variant axes laid out as rows × columns, plus true/false rows for every boolean property. The sheet is a standalone frame placed in empty canvas space (existing documentation frames are never touched), regenerating replaces the previous sheet in place, and it refreshes automatically when you add properties via FigmaLint. Variant values that are planned but not yet designed are shown as "—" coverage gaps, so the sheet doubles as a design-coverage map.

### Developer Handoff

Three export formats:

- **Markdown** — Comprehensive documentation with variants table, properties API, property quick reference, states with pass/fail status, slots, design token breakdown (tokens in use vs hard-coded), accessibility info and audit results, component readiness, naming issues, and AI interpretation. Ready for ZeroHeight, Knapsack, or Supernova.
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

1. Select a provider (Anthropic, OpenAI, or Google)
2. Choose a model
3. Enter your API key
4. Select a component and click Analyze (or press **Cmd/Ctrl+Enter**)

Tips: **Esc** closes the fix confirmation modal. If an analysis is slow, the Cancel button aborts it; a stuck analysis auto-recovers after 90 seconds.

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
│       └── google.ts            # Google (Gemini) provider
├── core/
│   ├── component-analyzer.ts    # Component analysis and prompt building
│   ├── token-analyzer.ts        # Design token detection and categorization
│   └── consistency-engine.ts    # Design system consistency checks
├── fixes/
│   ├── token-fixer.ts           # Token binding (color + spacing variables)
│   └── naming-fixer.ts          # Layer renaming with semantic detection
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
- Auto-fix operations modify only the properties you approve
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
