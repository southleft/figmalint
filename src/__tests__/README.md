# FigmaLint Unit Tests

This directory contains unit tests for the FigmaLint plugin fixes and enhancements.

## Test Coverage

### 1. **async-component-access.test.ts**
Tests the migration from synchronous `mainComponent` access to asynchronous `getMainComponentAsync()` to fix the "Cannot call with documentAccess: dynamic-page" error.

**Key test cases:**
- Successful async main component retrieval
- Handling null/detached components
- Error handling for access denied scenarios
- Direct component node handling
- Non-component node handling

### 2. **claude-api.test.ts**
Tests the improved Claude API error handling and diagnostics.

**Key test cases:**
- 400 Bad Request with detailed error messages
- Invalid API key format validation
- Empty API key validation
- 429 Rate limit errors with retry-after header
- Network connection errors
- Generic error handling

### 3. **markdown-rendering.test.ts**
Tests the markdown list rendering functionality in the chat UI.

**Key test cases:**
- Ordered lists (1. 2. 3.)
- Unordered lists with dashes (-)
- Unordered lists with asterisks (*)
- Mixed content with lists
- Headers (# ## ###)
- Bold and italic text
- Inline code formatting
- Proper HTML structure wrapping

### 4. **token-analyzer.test.ts**
Tests the heuristic filter for default variant frame styles.

**Key test cases:**
- Detection of all three default values (stroke #8A38F5, radius 5px, weight 1px)
- Non-default values should not be filtered
- Partial matches should not be filtered
- Only variant frames should be checked

## Running Tests

To run these tests with Jest:

```bash
# Install Jest if not already installed
npm install --save-dev jest @types/jest ts-jest

# Create jest.config.js
npx ts-jest config:init

# Run tests
npm test
```

## Implementation Notes

1. **Async Operations**: All Figma API calls that were synchronous have been converted to use async/await patterns.

2. **Error Messages**: Claude API errors now provide specific, actionable messages based on the error type.

3. **Markdown Parsing**: The chat UI now properly renders both ordered and unordered lists using a two-pass approach.

4. **Default Styles Filter**: The token analyzer now detects and filters out Figma's default variant frame styles to reduce false positives.

## Future Improvements

- Add integration tests that test the full plugin flow
- Add performance tests for token analysis on large components
- Add visual regression tests for UI components
- Mock more Figma API methods for comprehensive testing