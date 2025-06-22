# AI Design Co-Pilot v2.0

An enhanced Figma plugin that provides AI-powered component analysis, documentation, and validation for design systems designers.

## Features

### 🎯 Three Main Tabs

#### 1. Analyze Tab
- **Component Audit View**: Automatically checks for missing states, accessibility issues, and naming conventions
- **Property Cheat Sheet**: Lists recommended Figma properties with accepted values and defaults
- **Token Suggestions**: Suggests design tokens for colors, spacing, and typography
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

1. Open Figma
2. Go to Plugins → Development → Import plugin from manifest
3. Select the `manifest.json` file from this directory
4. The plugin will appear in your Figma plugins menu

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
   - Suggested properties
   - Token recommendations
   - Component metadata

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

### v2.0.0
- Added tabbed interface (Analyze, Playground, Documentation)
- Implemented comprehensive audit view with scoring
- Added property cheat sheet generation
- Integrated token suggestions with visual previews
- Added playground generation for variants and states
- Implemented documentation export (Markdown/JSON)
- Added batch mode for multiple components
- Enhanced UI with collapsible sections
- Added collaboration notes feature

### v1.0.0
- Initial release with basic component analysis
- Claude AI integration
- Simple variant generation

## Privacy & Security

- API keys are stored locally in your Figma session
- No data is sent to external servers except the Claude API
- All processing happens within your Figma environment

## Support

For issues or feature requests, please contact the development team or submit feedback through the plugin interface.