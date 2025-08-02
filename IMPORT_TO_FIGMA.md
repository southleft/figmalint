# How to Import FigmaLint Plugin

## Important: Always import from the `dist` folder!

### First Time Setup:
1. Build the plugin: `npm run build`
2. Open Figma Desktop App
3. Go to **Plugins** → **Development** → **Import plugin from manifest...**
4. Navigate to the **`dist`** folder: `/Users/tjpitre/Sites/figma-lint/dist/`
5. Select `manifest.json` inside the dist folder

### After Making Changes:
1. Run `npm run build` to rebuild
2. In Figma, the plugin will automatically reload with your changes

### Common Error:
If you see "Error: ENOENT: no such file or directory, lstat '.../figma-lint/code.js'", it means you imported the manifest from the root folder instead of the dist folder.

### File Structure:
```
figma-lint/
├── src/           (source code)
├── manifest.json  (DON'T import this one)
└── dist/          (built files - IMPORT FROM HERE)
    ├── code.js
    ├── manifest.json  (✅ Import THIS one)
    └── ui-enhanced.html
```