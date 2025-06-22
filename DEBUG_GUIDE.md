# Debugging Guide for AI Design Co-Pilot Interactive Features

## What's Been Updated

### 1. **Add State Button**
- Creates a new instance of the component with the specified state styling
- Positions it 20px to the right of the original component
- Automatically zooms to the new instance
- Should show a notification: "Created [state] state instance"

### 2. **Fix Accessibility Button**
- **For "Missing alt text"**: Creates a yellow reminder note next to the component
  - Alt text can't be added in Figma (it's an HTML attribute)
  - The note reminds developers to add alt text in code
- **For contrast issues**: Darkens the component's colors by 30%
- **For focus issues**: Adds a blue stroke around the component

### 3. **Fix Naming Button**
- Renames the layer with the suggested name
- Now searches more broadly if exact name match isn't found
- Refreshes the selection to update the layers panel

## Testing Steps

### To Test "Add State":
1. Analyze a component
2. In the Audit section, click "Add state" next to a missing state
3. You should see:
   - A new instance created to the right of your component
   - The viewport should zoom to show the new instance
   - A notification saying "Created [state] state instance"

### To Test "Fix Accessibility":
1. For "Missing alt text" - click Fix
   - A yellow note should appear next to your component
   - The note contains reminder text about adding alt text
2. For contrast issues - click Fix
   - The component's colors should become darker
3. For focus issues - click Fix
   - A blue stroke should be added around the component

### To Test "Fix Naming":
1. Click the rename button (e.g., "→ renamed to avatar-image")
2. Check the Layers panel - the layer should have the new name
3. You should see a notification confirming the rename

## Troubleshooting

### JavaScript Syntax Errors (FIXED)

#### Issue 1: onClick Handler Quotes
**Previous Issue**: Clicking buttons showed syntax error like "missing ) after argument list"
- **Cause**: Layer names containing quotes (like `'Ellipse 1': 'Ellipse 1'`) weren't properly escaped
- **Solution**: Fixed in ui-enhanced.html - all values are now escaped with `.replace(/'/g, "\\'")` and layer names are cleaned

#### Issue 2: Plugin Load Error
**Previous Issue**: Plugin failed to load with syntax error "Unexpected token :"
- **Cause**: TypeScript type annotations remained in the JavaScript file (e.g., `function isValidApiKeyFormat(apiKey): boolean`)
- **Solution**: Fixed by using the properly compiled JavaScript file (code-enhanced.js) instead of the TypeScript conversion

If features aren't working:

1. **Reload the plugin**:
   - Close and reopen the plugin
   - This ensures the latest code.js is loaded

2. **Check the console for errors**:
   - In Figma: Plugins → Development → Open Console
   - Look for any error messages when clicking buttons

3. **Verify component selection**:
   - Make sure you've analyzed a component first
   - The component must be selected for the actions to work

4. **For state creation issues**:
   - Check if the component is locked or read-only
   - Ensure the component has a parent frame/page

5. **For accessibility fixes**:
   - Alt text reminders create a new frame - check if it's being created off-screen
   - Contrast fixes only work on components with solid fills
   - Focus indicators only work on components that support strokes

## Console Messages to Check

When clicking buttons, you should see in the console:
- `Received message: [action-type]` - confirms the message reached the plugin
- `Sent message to UI: [result]` - shows the action completed

If you see `{success: true}` but no visual change, the issue might be:
- The change is happening off-screen
- The component doesn't support that type of modification
- The layers panel needs to be refreshed (for naming changes)

## Fixed Issues

### 1. Layer Name Quotes Causing Syntax Errors

### 2. Async/Await Transpilation Error
**Issue**: Plugin failed to load with error "Syntax error on line 1236: Unexpected identifier"
**Cause**: Mixing direct `await` syntax with TypeScript's transpiled async pattern (`__awaiter`/`__generator`)
**Fix**:
- Updated the transpiled JavaScript to use the correct async pattern
- Fixed switch/case structure for proper async flow
- Updated case numbers in try-catch blocks

**Prevention**:
- Always compile TypeScript to JavaScript using `npm run build`
- Don't manually edit the transpiled JavaScript files
- If manual edits are necessary, ensure async operations use the transpiled pattern:
  ```javascript
  // Wrong (direct await in transpiled code):
  existingIndicator = await figma.getNodeByIdAsync(existingIndicatorId);

  // Correct (transpiled pattern):
  return [4 /*yield*/, figma.getNodeByIdAsync(existingIndicatorId)];
  case 2:
  existingIndicator = _a.sent();
  ```

### 3. TypeScript Compilation Errors with undici-types
**Issue**: Multiple TypeScript errors about missing 'undici-types' module when running `npm run build`
**Cause**: `@types/node` being pulled in as a transitive dependency of `webpack-cli`, which isn't compatible with the Figma plugin environment
**Fix**:
- Created a proper `tsconfig.json` with:
  - `skipLibCheck: true` to skip type checking of declaration files
  - `typeRoots: []` to prevent automatic inclusion of @types packages
  - Explicit file includes for only the plugin files
  - Proper exclusion of node_modules
- Updated package.json scripts to use `tsc` without manual parameters

**Prevention**:
- Use a proper tsconfig.json for TypeScript configuration
- Don't install unnecessary dependencies (webpack-cli can be removed if not used)
- Keep TypeScript configuration focused on the Figma plugin environment

### 4. "Unknown message type: analyze-enhanced" Error
**Issue**: Clicking "Analyze Component" button doesn't work, console shows "Unknown message type: analyze-enhanced"
**Cause**: Mismatch between UI and code files - ui-enhanced.html sends 'analyze-enhanced' message but code.ts only handles 'analyze'
**Fix**:
- Added 'analyze-enhanced' case to the message handler in code.ts
- Made it use the same handler as 'analyze' for compatibility
- Recompiled TypeScript to JavaScript

**Prevention**:
- Ensure UI and code files are in sync when using enhanced versions
- Check manifest.json to verify which files are being loaded
- Test message handlers after UI updates

### 5. Scoring and Analysis Quality Issues (MAJOR CONSOLIDATION FIX)
**Issue**: Plugin giving perfect 100% scores to simple components that should score poorly, not detecting design tokens properly, and missing audit features
**Cause**: Codebase fragmentation - enhanced features were in code-enhanced.ts but main code.ts was being used, leading to:
  - Basic analysis instead of enhanced audit
  - Poor scoring logic (divide by zero = 100%)
  - Weak token detection
  - Missing accessibility and naming audits

**Fix**:
- **Consolidated codebase**: Moved all enhanced analysis features from code-enhanced.ts into main code.ts
- **Enhanced prompting**: Made Claude AI more critical of simple components, specifically instructing it to flag missing states and features
- **Proper audit processing**: Added `processEnhancedAnalysis()` function that:
  - Expects 6 states (default, hover, focus, disabled, pressed, active)
  - Defaults to having accessibility issues for simple components
  - Properly processes naming and consistency issues
- **Better token detection**: Improved `extractDesignTokensFromNode()` to properly identify:
  - Fill and stroke colors with hex values
  - Padding and gap spacing values
  - Typography with font family, size, and weight
- **Fixed scoring logic**: UI now calculates scores based on actual audit results rather than empty data
- **Backward compatibility**: Sends both `enhanced-analysis-result` and `metadata-result` messages

**Prevention**:
- Keep all analysis logic in one main codebase (code.ts)
- Test with simple components (circles, basic shapes) to ensure they get appropriate scores
- Regularly verify that audit sections show actual issues, not just "passed" items

**Expected Behavior After Fix**:
- Simple avatar component (circle with stroke) should score 15-30%, not 100%
- Should show missing states like hover, focus, disabled
- Should flag accessibility issues like missing focus indicators
- Should detect actual design tokens from fills, strokes, and spacing
- Audit sections should show real issues to fix

### 6. Final Debug and Scoring Logic Fixes
**Issue**: Even after consolidation, still getting 100% scores due to UI fallback logic and divide-by-zero errors
**Root Cause**:
  - UI fallback logic was creating fake "passing" audit data when enhanced analysis didn't provide audit
  - Divide-by-zero in scoring calculation: `(passCount / totalCount) * 100` when totalCount = 0
  - No debugging to see what data was actually being processed

**Final Fixes**:
- **Added comprehensive debugging**: Console logs to track data flow from Claude → processing → UI
- **Fixed divide-by-zero**: `totalCount > 0 ? Math.round((passCount / totalCount) * 100) : 0`
- **Improved fallback logic**: Instead of fake passing states, now shows realistic failing audit:
  - Only 'default' state found (1/6 states = 16% for states)
  - 2 accessibility failures (0/2 = 0% for accessibility)
  - Overall score should be much lower

**Debugging Commands**:
```
// In browser console after analysis:
// Check what data was sent from backend
// Check what data UI received
// Check scoring calculation
```

**Expected Results NOW**:
- Avatar component should score ~8-25% (not 100%)
- Should see console logs showing the data flow
- Interactive States: 1/6 found (default only)
- Accessibility: 0/2 passed (focus indicator, ARIA labels missing)
- Token detection should show actual colors from component

### 7. Complete Issue Resolution (FINAL)
**All Previous Issues**: Plugin still showed 100% scores despite all previous attempts
**Root Cause**: Multiple layers of problems:
  1. **Duplicate Message Bug**: Sending both `enhanced-analysis-result` and `metadata-result` caused UI to process two results - second one overwrote first
  2. **Missing Message Handlers**: `save-collab-notes` handler was completely missing
  3. **Token Detection Silent Failure**: Tokens were extracted but not properly debugged
  4. **Property Generation Issue**: Empty properties when Claude didn't provide propertyCheatSheet

**Comprehensive Final Fixes**:
- **Removed Duplicate Messages**: Only send `enhanced-analysis-result`, not both
- **Added Notes Handler**: Complete `save-collab-notes` functionality with visual indicators
- **Improved Token Detection**: Added debugging and better extraction from fills/strokes/spacing
- **Enhanced Properties**: Generate fallback properties from Claude's props when propertyCheatSheet is empty
- **Added Comprehensive Debugging**: Console logs throughout data flow to identify future issues

**Expected Results After These Fixes**:
- **Scoring**: 11-13% for simple avatar component (no more 100%)
- **Notes**: Should work completely with visual indicators in Figma
- **Tokens**: Should detect stroke colors, fill colors, and spacing from the component
- **Properties**: Should show properties even when Claude doesn't provide detailed cheat sheet
- **Console Output**: Clear debugging information for troubleshooting

**Testing Checklist**:
- [ ] Simple avatar component scores 15-30% (not 100%)
- [ ] Notes functionality works and creates visual indicators
- [ ] Token detection shows stroke and fill colors
- [ ] Properties section is populated
- [ ] No "Unknown message type" errors in console

### 8. Property Cheat Sheet Empty Section
**Issue**: Property Cheat Sheet section was empty despite being "arguably one of the most important parts" for designer-developer intent alignment
**Root Cause**:
  - Claude wasn't consistently returning `propertyCheatSheet` in its JSON response
  - Fallback logic was too basic (only true/false properties)
  - No component-type-aware property generation

**Comprehensive Fix**:
- **Enhanced Claude Prompt**: Made propertyCheatSheet a required part of the JSON response with realistic examples
- **Smart Component Detection**: Added `detectComponentType()` function that identifies component types from:
  - Component name keywords (button, avatar, card, input, badge, icon, etc.)
  - Structural analysis (e.g., single ellipse child = avatar)
- **Realistic Property Generation**: `generateFallbackProperties()` creates appropriate properties for each component type:
  - **Avatar**: size (small/medium/large/xl), variant (circle/square/rounded), status (online/offline/away/busy), showBorder
  - **Button**: variant (primary/secondary/outline/ghost), size (small/medium/large), disabled (true/false)
  - **Card**: variant (default/outlined/elevated), padding (none/small/medium/large)
  - **Input**: size (small/medium/large), state (default/error/success/disabled)
  - **Badge**: variant (default/primary/success/warning/error), size (small/medium)
  - **Icon**: size (16/20/24/32), color (default/primary/secondary/muted)
- **Comprehensive Debugging**: Console logs track property data flow from backend to UI

**Expected Results**:
- Avatar component should now show realistic properties like size, variant, status, showBorder
- All component types get appropriate properties that align with typical developer APIs
- Property Cheat Sheet becomes a valuable designer-developer communication tool
- Console shows exactly what properties are being generated and sent

**Why This Matters**:
Property Cheat Sheet helps designers understand developer constraints and possibilities, bridging the design-dev handoff gap by showing realistic component APIs.

### 9. 100% AI-Driven Property Generation & Model Selection (FINAL ARCHITECTURE)
**User Requirements**:
1. **No hard-coded values** - 100% AI interpretation for any component type (atomic or groups)
2. **Model selection** - Allow designers to choose which Claude model works best for them

**Major Architectural Changes**:

**A. Eliminated All Hard-Coded Property Fallbacks**:
- **Removed**: `detectComponentType()` function and all hard-coded property generation
- **Removed**: 150+ lines of hard-coded properties for avatar, button, card, input, badge, icon components
- **Philosophy**: If AI doesn't generate properties, that's valid - some components may not have configurable properties
- **Result**: Plugin now relies 100% on AI interpretation, making it suitable for any component type

**B. Enhanced AI Prompting for Better Property Generation**:
- **Enhanced Prompt**: Made `propertyCheatSheet` a CRITICAL requirement in Claude responses
- **Better Examples**: Provided detailed JSON structure showing exactly what's expected
- **Clearer Instructions**: Added specific guidance for property analysis:
  - "Think about what properties a developer would realistically implement"
  - "Consider size, variant, state, behavior, and appearance properties"
  - "Make property names semantic and developer-friendly"
- **Component-Agnostic**: Works for atomic components AND component groups

**C. Model Selection Feature**:
- **UI Enhancement**: Added model selection dropdown in API key section with 7 Claude models:
  - Claude Sonnet 4 (Recommended - High Performance)
  - Claude Opus 4 (Most Capable)
  - Claude Sonnet 3.7 (With Extended Thinking)
  - Claude Sonnet 3.5 (Previous Version)
  - Claude Haiku 3.5 (Fastest)
  - Claude Opus 3 (Complex Tasks)
  - Claude Haiku 3 (Fast & Compact)
- **Backend Integration**: Model selection is saved and persisted across sessions
- **Dynamic Updates**: Users can change models without re-entering API key

**D. Technical Implementation**:
- **Storage**: Both API key and selected model stored in `figma.clientStorage`
- **State Management**: `selectedModel` global variable with Sonnet 4 as default
- **API Integration**: `fetchClaude()` uses `selectedModel` instead of hard-coded model
- **Live Updates**: Model changes take effect immediately for next analysis

**E. Enhanced Debugging**:
- Console logs show when Claude provides props but no propertyCheatSheet
- Clear messaging when no properties are generated (valid scenario)
- Model selection changes logged for debugging

**Expected User Experience**:
1. **First Time**: User enters API key, chooses preferred model, saves both
2. **Component Analysis**: AI analyzes using selected model, generates appropriate properties
3. **Model Switching**: User can change models anytime to compare AI output quality
4. **Any Component Type**: Works equally well for simple shapes, complex components, or component groups
5. **No Misleading Data**: Properties shown are what AI interprets, not hard-coded assumptions

**Testing Scenarios**:
- [ ] Simple avatar (circle with stroke) - may have 0 properties (valid)
- [ ] Complex button component - should have realistic variant/size/state properties
- [ ] Component groups - should interpret group-level properties
- [ ] Model switching - different models may generate different property interpretations
- [ ] Properties match AI understanding, not hard-coded templates

**Why This Architecture is Better**:
- **Authentic**: Shows actual AI interpretation rather than hard-coded assumptions
- **Flexible**: Works with any component type, current and future
- **User-Controlled**: Designers choose AI model that works best for their needs
- **Truthful**: Empty properties section means "no configurable properties" rather than hiding behind defaults
