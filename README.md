# AI Design Co-Pilot - Figma Plugin

A Figma plugin that analyzes selected design components and generates metadata and suggested variants using Claude AI.

## Project Structure

```
ai-design-copilot/
├── manifest.json    # Figma plugin configuration
├── code.ts         # Main plugin thread (backend)
├── ui.html         # Plugin user interface
├── ui.ts           # UI logic and messaging
├── styles.css      # Plugin styling
├── claude.ts       # Claude API helper functions
├── figma.d.ts      # TypeScript definitions for Figma API
└── README.md       # This file
```

## Features

- **API Key Management**: Securely store and manage your Claude API key
- **Component Analysis**: Analyze selected Figma components with AI
- **Design Insights**: Get suggestions for variants, accessibility, and best practices
- **Clean UI**: Simple, focused interface for easy interaction

## Setup

1. **Get Claude API Key**:
   - Sign up at [Anthropic Console](https://console.anthropic.com/)
   - Create an API key

2. **Install the Plugin**:
   - Open Figma Desktop
   - Go to Plugins → Development → Import plugin from manifest
   - Select the `manifest.json` file from this directory

3. **Configure API Key**:
   - Run the plugin in Figma
   - Enter your Claude API key
   - Click "Save Key"

## Usage

1. **Select a Component**: Choose any Figma component, frame, or element to analyze
2. **Run Analysis**: Click "Analyze Selected Component"
3. **View Results**: Check Figma notifications for the AI-generated insights

## Development Notes

### File Descriptions

- **`manifest.json`**: Defines plugin metadata, permissions, and entry points
- **`code.ts`**: Main plugin logic running in Figma's sandbox environment
- **`ui.html`** & **`ui.ts`**: User interface and client-side interaction logic
- **`claude.ts`**: API helper for communicating with Claude 3
- **`figma.d.ts`**: TypeScript definitions for Figma Plugin API

### API Integration

The plugin makes direct API calls to Anthropic's Claude API. The `manifest.json` file includes the necessary network permissions:

```json
"networkAccess": {
  "allowedDomains": ["https://api.anthropic.com"]
}
```

This allows the plugin to communicate directly with the Claude API without needing a proxy server.

### Building the Plugin

To compile TypeScript files:

```bash
npm run build
```

For development with auto-recompilation:

```bash
npm run dev
```

## Troubleshooting

### API Connection Issues

- **Invalid API Key**: Ensure your API key starts with `sk-ant-` and is valid
- **Rate Limits**: If you see rate limit errors, wait a moment before trying again
- **Network Issues**: Check your internet connection

### Plugin Issues

- **Component Not Selected**: Make sure to select a Figma component before analyzing
- **Plugin Not Loading**: Try reloading the plugin or restarting Figma

## Security Notes

- API keys are stored in memory during the plugin session
- For production use, consider implementing secure key storage using Figma's clientStorage API
- Never commit API keys to version control

## Future Enhancements

- Persistent API key storage
- Batch component analysis
- Export analysis results
- Custom analysis prompts
- Integration with design systems

## Extending the Plugin

The plugin is designed to be easily extensible:

1. **Add New Analysis Types**: Modify `createDesignAnalysisPrompt()` in `claude.ts`
2. **Enhance Component Extraction**: Update `extractComponentInfo()` in `code.ts`
3. **Improve UI**: Add new controls in `ui.html` and handle them in `ui.ts`
4. **Add Persistence**: Implement `figma.clientStorage` for API key persistence

## Development Commands

Since this is a vanilla TypeScript project, you'll need to:

1. **Compile TypeScript**: Use `tsc` to compile `.ts` files to `.js`
2. **Load in Figma**: Import the compiled plugin via Figma Desktop
3. **Debug**: Use `console.log()` statements (viewable in Figma's developer console)

## Next Steps

- [ ] Add component variant generation
- [ ] Implement design system analysis
- [ ] Add export functionality for analysis results
- [ ] Create plugin store listing
- [ ] Add unit tests for core functions

## License

This project is a development scaffold - add your preferred license.
