# FigmaLint

A powerful Figma plugin that serves as an **intelligent design system auditor and educational companion**. FigmaLint bridges the gap between design and development by analyzing components against best practices and providing actionable feedback.

## 🎯 Mission

FigmaLint empowers designers to create development-ready components by providing real-time analysis and educational feedback. Unlike traditional plugins that modify your designs, FigmaLint acts as a knowledgeable reviewer that helps you understand and implement best practices.

### Core Philosophy
- **Educational First**: Learn while you design with contextual feedback
- **Non-Destructive**: Analyzes without modifying your components
- **Developer-Friendly**: Ensures components meet engineering requirements
- **AI-Powered**: Leverages Claude AI for intelligent, context-aware analysis

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

## 🎨 Key Capabilities

### Smart Token Detection
- **Comprehensive Analysis**: Automatically detects Figma Variables, Named Styles, and hard-coded values
- **Contextual Recommendations**: Suggests semantic token names based on component context
- **Visual Feedback**: Color swatches and visual previews for detected tokens
- **Detailed Reporting**: Shows exactly where hard-coded values exist in your component hierarchy

### Intelligent Auditing
- **State Completeness**: Identifies missing interactive states (hover, focus, disabled, etc.)
- **Accessibility Validation**: Checks against WCAG guidelines and best practices
- **Naming Conventions**: Suggests improvements for layer and component naming
- **Component Structure**: Validates proper hierarchy and organization

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

## 🚀 Getting Started

### Installation

#### From Figma Community (Coming Soon)
1. Visit the FigmaLint plugin page in Figma Community
2. Click "Install" to add to your Figma workspace

#### Manual Installation (Development)
1. Clone this repository
2. Run `npm install` to install dependencies
3. Run `npm run build` to compile the plugin
4. In Figma: Plugins → Development → Import plugin from manifest
5. Select the `manifest.json` file from the project root

### Usage

1. **Select a component** - Choose any Frame, Component, Component Set, or Instance
2. **Launch FigmaLint** - Run from Plugins menu
3. **Configure API** - Add your Claude API key (one-time setup)
4. **Analyze** - Click "Analyze Component" for instant feedback
5. **Review & Export** - Study recommendations and export metadata as needed

## 🛠️ Development Setup

### Prerequisites
- Node.js 16+ and npm
- TypeScript knowledge helpful but not required
- Claude API key from [Anthropic Console](https://console.anthropic.com)

### Local Development
```bash
# Install dependencies
npm install

# Development build with watch mode
npm run dev

# Production build
npm run build

# Type checking
npm run lint

# Clean build artifacts
npm run clean
```

### Project Structure
- `src/core/` - Core analysis logic
- `src/api/` - Claude AI integration
- `src/ui/` - User interface components
- `src/utils/` - Helper utilities
- `dist/` - Compiled plugin files

## 💡 Use Cases

### For Designers
- **Learning Tool**: Understand design system best practices
- **Quality Assurance**: Validate components before handoff
- **Documentation**: Generate component specifications automatically
- **Consistency**: Ensure adherence to design system standards

### For Design Teams
- **Design System Audits**: Assess component library health
- **Onboarding**: Help new team members learn standards
- **Migration Planning**: Identify token adoption opportunities
- **Quality Gates**: Establish component review standards

### For Developer Handoff
- **Metadata Export**: Structured JSON for development
- **State Documentation**: Complete interaction specifications
- **Token Mapping**: Clear design token references
- **Accessibility Notes**: WCAG compliance information

## 🔐 Privacy & Security

FigmaLint is designed with privacy in mind:
- **Local Storage**: API keys stored securely in Figma's local storage
- **No Data Retention**: Component data is never stored externally
- **Direct API Calls**: Analysis happens directly through Claude API
- **Read-Only**: Plugin only reads components, never modifies them
- **Open Source**: Full transparency through open source code

## 🤝 Contributing

Contributions are welcome! Whether you're fixing bugs, adding features, or improving documentation:

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [Claude AI](https://www.anthropic.com) by Anthropic
- Inspired by the design systems community
- Thanks to all contributors and users

## 📧 Support

- **Issues**: Report bugs and request features through GitHub Issues
- **Discussions**: Share ideas and get help from the community
- **Contributing**: See our Contributing section above

---

Made with ❤️ for the design community
