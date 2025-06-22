# AI Design Co-Pilot v2.0 - Test Plan

## Testing Summary

The enhanced plugin has been successfully built without errors. Here's what you need to test:

### 1. Installation & Setup
- [ ] Import the plugin using the manifest.json file in Figma
- [ ] Launch the plugin from the Figma plugins menu
- [ ] Enter and save a Claude API key
- [ ] Verify the key is saved (shows "API key saved ✓")

### 2. Analyze Tab Testing

#### Basic Component Analysis
- [ ] Select a simple component (e.g., button, avatar)
- [ ] Click "Analyze Component"
- [ ] Verify all collapsible sections appear:
  - Component Audit (with score)
  - Property Cheat Sheet
  - Token Suggestions
  - Component Metadata

#### Audit View
- [ ] Check that missing states are identified (hover, focus, disabled)
- [ ] Verify accessibility checks appear
- [ ] Confirm the audit score is calculated correctly
- [ ] Test collapsible sections expand/collapse properly

### 3. Playground Tab Testing
- [ ] After analysis, switch to Playground tab
- [ ] Click "Generate Instances"
- [ ] Verify a grid is created in Figma with:
  - States section (default, hover, focus, disabled, pressed)
  - Variants section (if applicable)
  - Proper labeling for each instance

### 4. Documentation Tab Testing
- [ ] Switch to Documentation tab after analysis
- [ ] Test export options:
  - [ ] Markdown export (copies to clipboard)
  - [ ] JSON export (copies to clipboard)
- [ ] Click "Generate in Figma"
- [ ] Verify documentation frame is created below the component
- [ ] Test collaboration notes:
  - [ ] Add notes in the textarea
  - [ ] Click "Save Notes"

### 5. Batch Mode Testing
- [ ] Select multiple components (2-3)
- [ ] Verify "Batch Mode" toggle appears
- [ ] Enable batch mode
- [ ] Run analysis
- [ ] Check that all components are analyzed

### 6. Component Type Testing

Test with these component types:

#### Simple Components
- [ ] Icon
- [ ] Avatar
- [ ] Badge

#### Medium Components
- [ ] Button with variants
- [ ] Input field
- [ ] Toggle switch

#### Complex Components
- [ ] Card with multiple slots
- [ ] Table row
- [ ] Dropdown menu

### 7. Edge Cases
- [ ] Test with an instance (should analyze main component)
- [ ] Test with component set
- [ ] Test with no selection (should show error)
- [ ] Test with invalid API key
- [ ] Test clearing API key

### 8. UI/UX Testing
- [ ] Verify tabs work correctly
- [ ] Check all status messages appear
- [ ] Confirm loading states show properly
- [ ] Test that irrelevant features are hidden (e.g., Playground when no variants)

## Known Issues to Check

1. **CORS**: The plugin uses direct Anthropic API calls with the `anthropic-dangerous-direct-browser-access` header. This should work but may have restrictions.

2. **Font Loading**: The plugin uses Inter font. Ensure it loads properly for generated frames.

3. **Performance**: With complex components or many variants, generation might take time.

## Expected Behavior

- **Audit Score**: Should show percentage based on passed/failed checks
- **Token Suggestions**: Should show visual previews for colors and spacing
- **Playground**: Should create organized grid with proper state variations
- **Documentation**: Should generate clean, readable documentation in Figma

## Success Criteria

✅ Plugin loads without errors
✅ All three tabs function correctly
✅ Analysis provides meaningful insights
✅ Generated content appears properly in Figma
✅ No console errors during normal operation

## Next Steps

If any issues are found during testing:
1. Check browser console for errors
2. Verify API key is correct
3. Ensure component selection is valid
4. Report specific error messages