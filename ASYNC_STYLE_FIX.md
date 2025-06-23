# Async Style Detection Fix for AI Design Co-Pilot

## The Issue

When using `documentAccess: dynamic-page` in the Figma plugin manifest, synchronous API methods like `figma.getStyleById()` are not allowed. This caused the following error:

```
Could not access style: S:c75d6ea8d6f127d40e01d99736d3bdd2c6f7e989,
Error {message: 'in getStyleById: Cannot call with documentAccess: dynamic-page. Use figma.getStyleByIdAsync instead.'}
```

## The Solution

Replace all synchronous style detection with async methods and use Promise.all() to wait for all style lookups:

### Before (Broken):
```javascript
const styleName = getStyleName(styleId);
if (styleName && !colorSet.has(styleName)) {
  // Process style...
}
```

### After (Fixed):
```javascript
const stylePromises = [];

if ('fillStyleId' in currentNode && currentNode.fillStyleId) {
  stylePromises.push(
    figma.getStyleByIdAsync(styleId)
      .then(style => {
        if (style && style.name) {
          // Process style...
        }
      })
      .catch(error => {
        console.log('Could not resolve style:', error);
      })
  );
}

// Wait for all style lookups
if (stylePromises.length > 0) {
  await Promise.all(stylePromises);
}
```

## Key Points

1. **Always use async methods** when `documentAccess: dynamic-page` is set
2. **Collect all promises** in an array before processing
3. **Wait for all promises** to complete with `await Promise.all()`
4. **Handle errors gracefully** with `.catch()` blocks

## Affected Style Types

- Fill styles: `fillStyleId` → `figma.getStyleByIdAsync()`
- Stroke styles: `strokeStyleId` → `figma.getStyleByIdAsync()`
- Text styles: `textStyleId` → `figma.getStyleByIdAsync()`
- Effect styles: `effectStyleId` → `figma.getStyleByIdAsync()`

## Testing

After implementing this fix, the plugin should correctly:
- Detect Figma Styles as design tokens (not hard-coded values)
- Count semantic tokens properly in the token analysis summary
- Display "2 using design tokens" instead of "2 hard-coded values"
