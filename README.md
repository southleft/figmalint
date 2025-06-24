# AI Design Co-Pilot

A Figma plugin that acts as an **audit and education tool** for design systems. It helps designers understand developer expectations and structure components properly for engineering handoff.

## 🎯 Mission

This plugin **does not modify or generate components**. Instead, it analyzes existing Figma components and provides:
- **Component audits** with recommendations
- **Design token analysis** and suggestions  
- **Educational feedback** on component structure
- **Metadata export** for development teams

## ✨ Core Features

### 🔍 Component Analysis
- Analyzes selected Figma components for completeness
- Identifies missing interactive states (hover, focus, disabled)
- Checks for proper naming conventions
- Validates accessibility considerations

### 🎨 Design Token Detection
- Detects both Figma Variables and Named Styles
- Identifies hard-coded values that should use tokens
- Categorizes tokens by type (colors, spacing, typography, effects, borders)
- Provides recommendations for token usage

### 📊 Audit & Recommendations
- **States Audit**: Shows missing interactive states for buttons, inputs, etc.
- **Accessibility Audit**: Flags potential accessibility issues
- **Naming Audit**: Suggests improvements to layer naming
- **Token Opportunities**: Recommends where to use design tokens

### 📋 Property Cheat Sheet
- Lists actual Figma component properties and variants
- Shows available values for each property
- Provides context for how properties should be used

## 🏗️ Architecture

```
src/
├── types.ts                 # TypeScript definitions
├── api/claude.ts            # AI analysis integration
├── core/
│   ├── component-analyzer.ts # Component analysis logic
│   └── token-analyzer.ts     # Token detection & analysis
├── utils/figma-helpers.ts    # Figma API utilities
├── ui/message-handler.ts     # UI communication
├── code.ts                   # Plugin entry point
└── ui.html                   # Plugin interface
```

## 🚀 Usage

1. **Select a component** in Figma (Frame, Component, Component Set, or Instance)
2. **Open the plugin** from the Figma menu
3. **Add your Claude API key** for AI-powered analysis
4. **Click "Analyze Component"** to get detailed feedback
5. **Review the audit results** and recommendations
6. **Export metadata** for development handoff

## 🔧 Development

### Prerequisites
- Node.js 16+
- Claude API key from Anthropic

### Build Commands
```bash
npm install          # Install dependencies
npm run build        # Build for production
npm run dev          # Watch mode for development
npm run clean        # Clean build artifacts
npm run lint         # TypeScript type checking
```

### Installation
1. Run `npm run build` to generate the plugin files
2. In Figma, go to Plugins → Development → Import plugin from manifest
3. Select the `manifest.json` file from the project root
4. The plugin will be available in your Figma plugins menu

## 🎯 Use Cases

- **New designers** learning design system patterns
- **Design system audits** for existing components
- **Developer handoff** with structured metadata
- **Component documentation** and guidelines
- **Design token migration** planning

## 🔒 Privacy & Security

- API key is stored locally in Figma
- No component data is stored externally
- Analysis happens through Claude API with your key
- Plugin only reads component data, never modifies it

## 📄 License

ISC License - See package.json for details