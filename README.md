# AI Design Co-Pilot v2.0

An enhanced Figma plugin that provides AI-powered component analysis, documentation, and validation for design systems designers.

## 🏗️ **PRODUCTION-READY REFACTORED ARCHITECTURE**

This plugin has been completely refactored with a modular TypeScript architecture for production use:

### **📁 Modular Structure**
```
src/
├── types.ts                 # Comprehensive type definitions
├── api/claude.ts            # Claude API integration
├── core/
│   ├── token-analyzer.ts    # Enhanced token detection & analysis
│   └── component-analyzer.ts # Component context extraction
├── utils/figma-helpers.ts   # Figma API utilities
├── ui/message-handler.ts    # UI communication layer
├── code.ts                  # Main plugin entry point
├── ui.html                  # Plugin interface
└── manifest.json           # Plugin configuration
```

### **🔧 Build Process**
```bash
npm run build    # Build production version
npm run dev      # Watch mode for development
npm run clean    # Clean build artifacts
```

### **🚀 Key Improvements**
- **Modular Architecture**: Clean separation of concerns
- **TypeScript**: Full type safety and better development experience
- **Token Detection**: Enhanced Figma Variables API and Named Styles support
- **Proper Error Handling**: Robust error management throughout
- **Production Ready**: Optimized build process and asset management

## Features

### 🎯 Three Main Tabs

#### 1. Analyze Tab
- **Component Audit View**: Automatically checks for missing states, accessibility issues, and naming conventions
- **Enhanced Token Analysis**: Detects both Figma Variables and Named Styles as design tokens
- **Property Cheat Sheet**: Lists recommended Figma properties with accepted values and defaults
- **Token Categorization**: Splits tokens into Valid tokens, Hard-coded styles, and Recommended tokens
- **Validation Logic**: Checks for missing interactive states, inconsistent naming, and poor color contrast

#### 2. Playground Tab
- **Automatic Instance Generation**: Creates a visual grid of all component variants and states
- **State Variations**: Generates hover, focus, disabled, and pressed states
- **Variant Combinations**: Creates all possible combinations of component variants
- **Visual Organization**: Clean grid layout with proper labeling

#### 3. Documentation Tab
- **Auto-Generated Documentation**: Creates comprehensive component documentation
- **Export Options**: Export as Markdown or JSON format
- **In-Figma Documentation**: Generate documentation frames directly in your Figma file
- **Collaboration Notes**: Add and save notes for team members

### 🚀 Additional Features

- **Batch Mode**: Analyze multiple components at once
- **Accessibility Validation**: Automatic checks for color contrast and focus states
- **Token Integration**: Suggests appropriate design tokens based on component analysis
- **Smart State Detection**: Identifies missing interactive states
- **Collapsible UI Sections**: Clean, organized interface that adapts to component complexity

## Installation

### **Development Setup**
1. Clone this repository
2. Install dependencies: `npm install`
3. Build the plugin: `npm run build`
4. In Figma: Plugins → Development → Import plugin from manifest
5. Select `dist/manifest.json`

### **Production Use**
1. Download the latest release
2. In Figma: Plugins → Development → Import plugin from manifest
3. Select the `manifest.json` file

## Usage

### Initial Setup
1. Launch the plugin from Figma's plugins menu
2. Enter your Claude API key (starts with `sk-ant-`)
3. Save the key (it's stored securely in your session)

### Analyzing Components
1. Select a component in Figma
2. Click "Analyze Component"
3. Review the comprehensive analysis results:
   - Audit score and issues
   - Token categorization and recommendations
   - Suggested properties
   - Component metadata

### Token Analysis
The plugin provides detailed token analysis with three categories:

- **✅ Valid Tokens**: Figma Variables and Named Styles (properly system-aligned)
- **⚠️ Hard-coded Styles**: Direct values without tokens
- **💡 Recommended Tokens**: AI suggestions for token implementation

### Generating Playground
1. After analysis, switch to the Playground tab
2. Click "Generate Instances"
3. A grid of all component variations will be created in your Figma file

### Creating Documentation
1. Switch to the Documentation tab after analysis
2. Choose export format (Markdown or JSON)
3. Click "Export" to copy to clipboard, or
4. Click "Generate in Figma" to create a documentation frame

### Batch Analysis
1. Select multiple components
2. Enable "Batch Mode" when it appears
3. Click "Analyze Component" to analyze all selected components

## Component Types Tested

The plugin works best with:
- **Simple**: Icons, Avatars, Badges
- **Medium**: Buttons, Input Fields, Toggles
- **Complex**: Cards, Table Rows, Dropdown Menus

## Requirements

- Figma desktop app or web version
- Claude API key from Anthropic
- Internet connection for AI analysis

## Version History

### v2.0.0 - Production-Ready Refactor
- 🏗️ **Complete architectural overhaul with modular TypeScript structure**
- 🔧 **Enhanced build process with proper asset management**
- 🎯 **Improved token detection with better Figma API integration**
- 🚀 **Production-ready with comprehensive error handling**
- 📝 **Better code organization and maintainability**
- ✅ **Full TypeScript support with proper type definitions**

### v1.0.0
- Initial release with basic component analysis
- Claude AI integration
- Simple variant generation

## Development

### **Architecture Overview**
The plugin uses a modular architecture:

1. **Types** (`types.ts`): Comprehensive type definitions
2. **API Layer** (`api/claude.ts`): Claude integration
3. **Core Logic** (`core/`): Token analysis and component processing
4. **Utils** (`utils/`): Figma API helpers
5. **UI Communication** (`ui/message-handler.ts`): Message routing
6. **Main Entry** (`code.ts`): Plugin initialization

### **Key Features**
- **Enhanced Token Detection**: Supports both Figma Variables API and Named Styles
- **Proper Async Handling**: Uses `figma.getStyleByIdAsync()` for style detection
- **Smart Categorization**: Avoids double-counting by checking style IDs first
- **Type Safety**: Full TypeScript support with proper error handling

## Privacy & Security

- API keys are stored locally in your Figma session
- No data is sent to external servers except the Claude API
- All processing happens within your Figma environment

## Support

For issues or feature requests, please contact the development team or submit feedback through the plugin interface.

---

**🎉 Ready for Production Use!**
