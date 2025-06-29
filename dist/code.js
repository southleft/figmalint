"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));

  // src/utils/figma-helpers.ts
  function isValidApiKeyFormat(apiKey) {
    const trimmedKey = apiKey.trim();
    return trimmedKey.length > 40 && trimmedKey.startsWith("sk-ant-");
  }
  function isValidNodeForAnalysis(node) {
    const validTypes = ["FRAME", "COMPONENT", "COMPONENT_SET", "INSTANCE", "GROUP"];
    if (!validTypes.includes(node.type)) {
      return false;
    }
    if (node.type === "COMPONENT_SET") {
      return true;
    }
    return true;
  }
  function rgbToHex(r, g, b) {
    const toHex = (n) => {
      const hex = Math.round(n * 255).toString(16);
      return hex.length === 1 ? "0" + hex : hex;
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
  async function getVariableName(variableId) {
    try {
      const variable = await figma.variables.getVariableByIdAsync(variableId);
      return variable ? variable.name : null;
    } catch (error) {
      console.warn("Could not access variable:", variableId, error);
      return null;
    }
  }
  async function getVariableValue(variableId, node) {
    try {
      const variable = await figma.variables.getVariableByIdAsync(variableId);
      if (!variable) return null;
      if (node && variable.resolveForConsumer) {
        try {
          const resolved = variable.resolveForConsumer(node);
          if (resolved && typeof resolved.value === "object" && "r" in resolved.value) {
            const color = resolved.value;
            return rgbToHex(color.r, color.g, color.b);
          } else if (resolved && resolved.value !== void 0) {
            return String(resolved.value);
          }
        } catch (resolveError) {
          console.warn("Could not resolve variable value:", resolveError);
        }
      }
      return variable.name;
    } catch (error) {
      console.warn("Could not access variable:", variableId, error);
      return null;
    }
  }
  function sendMessageToUI(type, data) {
    try {
      figma.ui.postMessage({ type, data });
    } catch (error) {
      console.error("Failed to send message to UI:", error);
    }
  }
  function getAllChildNodes(node) {
    const nodes = [node];
    if ("children" in node) {
      for (const child of node.children) {
        nodes.push(...getAllChildNodes(child));
      }
    }
    return nodes;
  }
  function extractTextContent(node) {
    const textContent = [];
    if (node.type === "TEXT") {
      const textNode = node;
      if (textNode.characters) {
        textContent.push(textNode.characters);
      }
    }
    if ("children" in node) {
      for (const child of node.children) {
        textContent.push(...extractTextContent(child));
      }
    }
    return textContent;
  }
  function getNodePath(node) {
    var _a;
    const path = [];
    let currentNode = node;
    while (currentNode && currentNode.type !== "DOCUMENT") {
      if (currentNode.type === "PAGE") {
        break;
      }
      if (currentNode.type === "COMPONENT" && ((_a = currentNode.parent) == null ? void 0 : _a.type) === "COMPONENT_SET") {
        path.unshift(`${currentNode.name}`);
      } else {
        path.unshift(currentNode.name);
      }
      currentNode = currentNode.parent;
    }
    return path.join(" \u2192 ");
  }
  function getDebugContext(node) {
    var _a, _b;
    const path = getNodePath(node);
    let description = `Found in "${node.name}"`;
    if (((_a = node.parent) == null ? void 0 : _a.type) === "COMPONENT_SET" || node.parent && ((_b = node.parent.parent) == null ? void 0 : _b.type) === "COMPONENT_SET") {
      description = `Found in variant: "${node.name}"`;
    } else if (path.includes("\u2192")) {
      const pathParts = path.split(" \u2192 ");
      if (pathParts.length > 1) {
        description = `Found in "${pathParts[pathParts.length - 1]}" (${pathParts[pathParts.length - 2]})`;
      }
    }
    return { path, description };
  }

  // src/core/token-analyzer.ts
  async function extractDesignTokensFromNode(node) {
    const colors = [];
    const spacing = [];
    const typography = [];
    const effects = [];
    const borders = [];
    const colorSet = /* @__PURE__ */ new Set();
    const spacingSet = /* @__PURE__ */ new Set();
    const typographySet = /* @__PURE__ */ new Set();
    const effectSet = /* @__PURE__ */ new Set();
    const borderSet = /* @__PURE__ */ new Set();
    async function traverseNode(currentNode) {
      console.log("\u{1F50D} Analyzing node:", currentNode.name, "Type:", currentNode.type);
      const stylePromises = [];
      if ("fillStyleId" in currentNode && typeof currentNode.fillStyleId === "string") {
        stylePromises.push(
          figma.getStyleByIdAsync(currentNode.fillStyleId).then((style) => {
            if ((style == null ? void 0 : style.name) && !colorSet.has(style.name)) {
              colorSet.add(style.name);
              let colorValue = style.name;
              if ("fills" in currentNode && Array.isArray(currentNode.fills) && currentNode.fills.length > 0) {
                const fill = currentNode.fills[0];
                if (fill.type === "SOLID" && fill.color) {
                  colorValue = rgbToHex(fill.color.r, fill.color.g, fill.color.b);
                }
              }
              colors.push({
                name: style.name,
                value: colorValue,
                type: "fill-style",
                isToken: true,
                isActualToken: true,
                source: "figma-style"
              });
            }
          }).catch(console.warn)
        );
      }
      if ("strokeStyleId" in currentNode && typeof currentNode.strokeStyleId === "string") {
        stylePromises.push(
          figma.getStyleByIdAsync(currentNode.strokeStyleId).then((style) => {
            if ((style == null ? void 0 : style.name) && !colorSet.has(style.name)) {
              colorSet.add(style.name);
              colors.push({
                name: style.name,
                value: style.name,
                type: "stroke-style",
                isToken: true,
                isActualToken: true,
                source: "figma-style"
              });
            }
          }).catch(console.warn)
        );
      }
      if (currentNode.type === "TEXT" && "textStyleId" in currentNode && typeof currentNode.textStyleId === "string") {
        stylePromises.push(
          figma.getStyleByIdAsync(currentNode.textStyleId).then((style) => {
            if ((style == null ? void 0 : style.name) && !typographySet.has(style.name)) {
              typographySet.add(style.name);
              typography.push({
                name: style.name,
                value: style.name,
                type: "text-style",
                isToken: true,
                isActualToken: true,
                source: "figma-style"
              });
            }
          }).catch(console.warn)
        );
      }
      if ("effectStyleId" in currentNode && typeof currentNode.effectStyleId === "string") {
        stylePromises.push(
          figma.getStyleByIdAsync(currentNode.effectStyleId).then((style) => {
            if ((style == null ? void 0 : style.name) && !effectSet.has(style.name)) {
              effectSet.add(style.name);
              effects.push({
                name: style.name,
                value: style.name,
                type: "effect-style",
                isToken: true,
                isActualToken: true,
                source: "figma-style"
              });
            }
          }).catch(console.warn)
        );
      }
      await Promise.all(stylePromises);
      if ("boundVariables" in currentNode && currentNode.boundVariables) {
        const boundVars = currentNode.boundVariables;
        console.log(`\u{1F50D} [VARIABLES] Checking bound variables for ${currentNode.name}:`, Object.keys(boundVars));
        const processVariableArray = async (variables, propertyName, targetSet, targetArray, tokenType) => {
          try {
            const varArray = Array.isArray(variables) ? variables : [variables];
            for (const v of varArray) {
              if ((v == null ? void 0 : v.id) && typeof v.id === "string") {
                const varName = await getVariableName(v.id);
                console.log(`   \u{1F3AF} Found ${propertyName} variable:`, varName);
                if (varName && !targetSet.has(varName)) {
                  targetSet.add(varName);
                  let displayValue = varName;
                  if (tokenType === "color" && (propertyName === "fills" || propertyName === "strokes")) {
                    const actualValue = await getVariableValue(v.id, currentNode);
                    if (actualValue && actualValue.startsWith("#")) {
                      displayValue = actualValue;
                    }
                  }
                  targetArray.push({
                    name: varName,
                    value: displayValue,
                    type: `${propertyName}-variable`,
                    isToken: true,
                    isActualToken: true,
                    source: "figma-variable"
                  });
                  console.log(`   \u2705 Added ${tokenType} token: ${varName} (value: ${displayValue})`);
                }
              }
            }
          } catch (error) {
            console.warn(`Error processing ${propertyName} variables:`, error);
          }
        };
        const processSingleVariable = async (variable, propertyName, targetSet, targetArray, tokenType) => {
          if (variable && typeof variable === "object" && "id" in variable && typeof variable.id === "string") {
            const varName = await getVariableName(variable.id);
            console.log(`   \u{1F3AF} Found ${propertyName} variable:`, varName);
            if (varName && !targetSet.has(varName)) {
              targetSet.add(varName);
              targetArray.push({
                name: varName,
                value: varName,
                type: `${propertyName}-variable`,
                isToken: true,
                isActualToken: true,
                source: "figma-variable"
              });
              console.log(`   \u2705 Added ${tokenType} token: ${varName}`);
            }
          }
        };
        const variableProcessingPromises = [];
        if (boundVars.fills) {
          console.log("   \u{1F3A8} Processing fills variables...");
          variableProcessingPromises.push(processVariableArray(boundVars.fills, "fills", colorSet, colors, "color"));
        }
        if (boundVars.strokes) {
          console.log("   \u{1F58A}\uFE0F Processing strokes variables...");
          variableProcessingPromises.push(processVariableArray(boundVars.strokes, "strokes", colorSet, colors, "color"));
        }
        if (boundVars.effects) {
          console.log("   \u2728 Processing effects variables...");
          variableProcessingPromises.push(processVariableArray(boundVars.effects, "effects", effectSet, effects, "effect"));
        }
        if (boundVars.strokeWeight) {
          console.log("   \u{1F4CF} Processing strokeWeight variable...");
          variableProcessingPromises.push(processSingleVariable(boundVars.strokeWeight, "strokeWeight", borderSet, borders, "border"));
        }
        const radiusProps = ["topLeftRadius", "topRightRadius", "bottomLeftRadius", "bottomRightRadius"];
        radiusProps.forEach((prop) => {
          if (boundVars[prop]) {
            console.log(`   \u{1F504} Processing ${prop} variable...`);
            variableProcessingPromises.push(processSingleVariable(boundVars[prop], prop, borderSet, borders, "border"));
          }
        });
        const spacingProps = ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "itemSpacing", "counterAxisSpacing"];
        spacingProps.forEach((prop) => {
          if (boundVars[prop]) {
            console.log(`   \u{1F4D0} Processing ${prop} variable...`);
            variableProcessingPromises.push(processSingleVariable(boundVars[prop], prop, spacingSet, spacing, "spacing"));
          }
        });
        const sizeProps = ["width", "height", "minWidth", "maxWidth", "minHeight", "maxHeight"];
        sizeProps.forEach((prop) => {
          if (boundVars[prop]) {
            console.log(`   \u{1F4E6} Processing ${prop} variable...`);
            variableProcessingPromises.push(processSingleVariable(boundVars[prop], prop, spacingSet, spacing, "size"));
          }
        });
        if (boundVars.opacity) {
          console.log("   \u{1F47B} Processing opacity variable...");
          variableProcessingPromises.push(processSingleVariable(boundVars.opacity, "opacity", effectSet, effects, "effect"));
        }
        if (currentNode.type === "TEXT") {
          const typographyProps = ["fontSize", "lineHeight", "letterSpacing", "paragraphSpacing"];
          typographyProps.forEach((prop) => {
            if (boundVars[prop]) {
              console.log(`   \u{1F4DD} Processing ${prop} variable...`);
              variableProcessingPromises.push(processSingleVariable(boundVars[prop], prop, typographySet, typography, "typography"));
            }
          });
        }
        await Promise.all(variableProcessingPromises);
        console.log(`\u{1F50D} [VARIABLES] Total variables found for ${currentNode.name}: ${Object.keys(boundVars).length}`);
      }
      const hasFillVariables = "boundVariables" in currentNode && currentNode.boundVariables && currentNode.boundVariables.fills;
      const hasFillStyle = "fillStyleId" in currentNode && currentNode.fillStyleId;
      if ("fills" in currentNode && Array.isArray(currentNode.fills) && !hasFillStyle && !hasFillVariables) {
        console.log(`\u{1F50D} [HARD-CODED] Checking fills for ${currentNode.name} (no variables, no style)`);
        currentNode.fills.forEach((fill) => {
          if (fill.type === "SOLID" && fill.visible !== false && fill.color) {
            const hex = rgbToHex(fill.color.r, fill.color.g, fill.color.b);
            if (!colorSet.has(hex)) {
              console.log(`   \u26A0\uFE0F Found hard-coded fill: ${hex}`);
              colorSet.add(hex);
              const debugContext = getDebugContext(currentNode);
              colors.push({
                name: `hard-coded-fill-${colors.length + 1}`,
                value: hex,
                type: "fill",
                isToken: false,
                source: "hard-coded",
                context: {
                  nodeType: currentNode.type,
                  nodeName: currentNode.name,
                  path: debugContext.path,
                  description: debugContext.description,
                  property: "fills"
                }
              });
            }
          }
        });
      } else if (hasFillVariables) {
        console.log(`\u{1F50D} [VARIABLES] ${currentNode.name} has fill variables - skipping hard-coded detection`);
      } else if (hasFillStyle) {
        console.log(`\u{1F50D} [STYLES] ${currentNode.name} has fill style - skipping hard-coded detection`);
      }
      const hasStrokeVariables = "boundVariables" in currentNode && currentNode.boundVariables && currentNode.boundVariables.strokes;
      const hasStrokeStyle = "strokeStyleId" in currentNode && currentNode.strokeStyleId;
      if ("strokes" in currentNode && Array.isArray(currentNode.strokes) && !hasStrokeStyle && !hasStrokeVariables) {
        console.log(`\u{1F50D} [HARD-CODED] Checking strokes for ${currentNode.name} (no variables, no style)`);
        currentNode.strokes.forEach((stroke) => {
          if (stroke.type === "SOLID" && stroke.visible !== false && stroke.color) {
            const hex = rgbToHex(stroke.color.r, stroke.color.g, stroke.color.b);
            if (!colorSet.has(hex)) {
              console.log(`   \u26A0\uFE0F Found hard-coded stroke: ${hex}`);
              colorSet.add(hex);
              const debugContext = getDebugContext(currentNode);
              colors.push({
                name: `hard-coded-stroke-${colors.length + 1}`,
                value: hex,
                type: "stroke",
                isToken: false,
                source: "hard-coded",
                context: {
                  nodeType: currentNode.type,
                  nodeName: currentNode.name,
                  path: debugContext.path,
                  description: debugContext.description,
                  property: "strokes"
                }
              });
            }
          }
        });
      } else if (hasStrokeVariables) {
        console.log(`\u{1F50D} [VARIABLES] ${currentNode.name} has stroke variables - skipping hard-coded detection`);
      } else if (hasStrokeStyle) {
        console.log(`\u{1F50D} [STYLES] ${currentNode.name} has stroke style - skipping hard-coded detection`);
      }
      if ("strokeWeight" in currentNode && typeof currentNode.strokeWeight === "number") {
        console.log(`\u{1F50D} Node ${currentNode.name} has strokeWeight: ${currentNode.strokeWeight}`);
        const hasStrokes = "strokes" in currentNode && Array.isArray(currentNode.strokes) && currentNode.strokes.length > 0;
        const hasVisibleStrokes = hasStrokes && currentNode.strokes.some((stroke) => stroke.visible !== false);
        console.log(`   Has strokes: ${hasStrokes}, Has visible strokes: ${hasVisibleStrokes}`);
        if (currentNode.strokeWeight > 0 && hasVisibleStrokes) {
          const strokeWeightValue = `${currentNode.strokeWeight}px`;
          let strokeColor = void 0;
          const firstVisibleStroke = currentNode.strokes.find((stroke) => stroke.visible !== false && stroke.type === "SOLID");
          if (firstVisibleStroke && firstVisibleStroke.type === "SOLID" && firstVisibleStroke.color) {
            strokeColor = rgbToHex(firstVisibleStroke.color.r, firstVisibleStroke.color.g, firstVisibleStroke.color.b);
          }
          if (!borderSet.has(strokeWeightValue)) {
            console.log(`   \u2705 Adding stroke weight: ${strokeWeightValue}`);
            borderSet.add(strokeWeightValue);
            const debugContext = getDebugContext(currentNode);
            borders.push({
              name: `hard-coded-stroke-weight-${currentNode.strokeWeight}`,
              value: strokeWeightValue,
              type: "stroke-weight",
              isToken: false,
              source: "hard-coded",
              strokeColor,
              context: {
                nodeType: currentNode.type,
                nodeName: currentNode.name,
                hasVisibleStroke: true,
                path: debugContext.path,
                description: debugContext.description,
                property: "strokeWeight"
              }
            });
          }
        }
      }
      const hasRadiusVariables = "boundVariables" in currentNode && currentNode.boundVariables && ["topLeftRadius", "topRightRadius", "bottomLeftRadius", "bottomRightRadius", "cornerRadius"].some((prop) => currentNode.boundVariables[prop]);
      if ("cornerRadius" in currentNode && typeof currentNode.cornerRadius === "number" && !hasRadiusVariables) {
        console.log(`\u{1F50D} [HARD-CODED] Checking corner radius for ${currentNode.name} (no variables)`);
        const radius = currentNode.cornerRadius;
        if (radius > 0) {
          const radiusValue = `${radius}px`;
          if (!borderSet.has(radiusValue)) {
            console.log(`   \u26A0\uFE0F Found hard-coded corner radius: ${radiusValue}`);
            borderSet.add(radiusValue);
            const debugContext = getDebugContext(currentNode);
            borders.push({
              name: `hard-coded-corner-radius-${radius}`,
              value: radiusValue,
              type: "corner-radius",
              isToken: false,
              source: "hard-coded",
              context: {
                nodeType: currentNode.type,
                nodeName: currentNode.name,
                path: debugContext.path,
                description: debugContext.description,
                property: "cornerRadius"
              }
            });
          }
        }
      } else if (hasRadiusVariables) {
        console.log(`\u{1F50D} [VARIABLES] ${currentNode.name} has radius variables - skipping hard-coded detection`);
      }
      if (!hasRadiusVariables && "topLeftRadius" in currentNode) {
        console.log(`\u{1F50D} [HARD-CODED] Checking individual corner radius for ${currentNode.name} (no variables)`);
        const radiusProps = [
          { prop: "topLeftRadius", name: "top-left" },
          { prop: "topRightRadius", name: "top-right" },
          { prop: "bottomLeftRadius", name: "bottom-left" },
          { prop: "bottomRightRadius", name: "bottom-right" }
        ];
        radiusProps.forEach(({ prop, name }) => {
          if (prop in currentNode && typeof currentNode[prop] === "number") {
            const radius = currentNode[prop];
            if (radius > 0) {
              const radiusValue = `${radius}px`;
              if (!borderSet.has(radiusValue)) {
                console.log(`   \u26A0\uFE0F Found hard-coded ${name} radius: ${radiusValue}`);
                borderSet.add(radiusValue);
                const debugContext = getDebugContext(currentNode);
                borders.push({
                  name: `hard-coded-${name}-radius-${radius}`,
                  value: radiusValue,
                  type: `${name}-radius`,
                  isToken: false,
                  source: "hard-coded",
                  context: {
                    nodeType: currentNode.type,
                    nodeName: currentNode.name,
                    path: debugContext.path,
                    description: debugContext.description,
                    property: prop
                  }
                });
              }
            }
          }
        });
      }
      const hasPaddingVariables = "boundVariables" in currentNode && currentNode.boundVariables && ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"].some((prop) => currentNode.boundVariables[prop]);
      if ("paddingLeft" in currentNode && typeof currentNode.paddingLeft === "number" && !hasPaddingVariables) {
        console.log(`\u{1F50D} [HARD-CODED] Checking padding for ${currentNode.name} (no variables)`);
        const frame = currentNode;
        const paddings = [
          { value: frame.paddingLeft, name: "left" },
          { value: frame.paddingRight, name: "right" },
          { value: frame.paddingTop, name: "top" },
          { value: frame.paddingBottom, name: "bottom" }
        ];
        paddings.forEach((padding) => {
          if (typeof padding.value === "number" && padding.value > 1 && !spacingSet.has(padding.value.toString())) {
            console.log(`   \u26A0\uFE0F Found hard-coded padding-${padding.name}: ${padding.value}px`);
            spacingSet.add(padding.value.toString());
            const debugContext = getDebugContext(currentNode);
            spacing.push({
              name: `hard-coded-padding-${padding.name}-${padding.value}`,
              value: `${padding.value}px`,
              type: "padding",
              isToken: false,
              source: "hard-coded",
              context: {
                nodeType: currentNode.type,
                nodeName: currentNode.name,
                path: debugContext.path,
                description: debugContext.description,
                property: `padding${padding.name.charAt(0).toUpperCase() + padding.name.slice(1)}`
              }
            });
          }
        });
      } else if (hasPaddingVariables) {
        console.log(`\u{1F50D} [VARIABLES] ${currentNode.name} has padding variables - skipping hard-coded detection`);
      }
      if ("children" in currentNode) {
        for (const child of currentNode.children) {
          await traverseNode(child);
        }
      }
    }
    await traverseNode(node);
    return analyzeTokensConsistently({ colors, spacing, typography, effects, borders });
  }
  function analyzeTokensConsistently(extractedTokens) {
    const categories = ["colors", "spacing", "typography", "effects", "borders"];
    const summary = {
      totalTokens: 0,
      actualTokens: 0,
      hardCodedValues: 0,
      aiSuggestions: 0,
      byCategory: {}
    };
    categories.forEach((category) => {
      const tokens = extractedTokens[category].map((token) => __spreadProps(__spreadValues({}, token), {
        isActualToken: token.source === "figma-style" || token.source === "figma-variable",
        recommendation: getDefaultRecommendation(token, category),
        suggestion: getDefaultSuggestion(token, category)
      }));
      const actualTokens = tokens.filter((t) => t.isActualToken).length;
      const hardCoded = tokens.filter((t) => t.source === "hard-coded").length;
      summary.byCategory[category] = {
        total: tokens.length,
        tokens: actualTokens,
        hardCoded,
        suggestions: 0
      };
      summary.totalTokens += tokens.length;
      summary.actualTokens += actualTokens;
      summary.hardCodedValues += hardCoded;
      extractedTokens[category] = tokens;
    });
    return __spreadProps(__spreadValues({}, extractedTokens), {
      summary
    });
  }
  function getDefaultRecommendation(token, category) {
    if (token.isToken) return `Using ${token.name} token`;
    switch (category) {
      case "colors":
        return `Consider using a color token instead of ${token.value}`;
      case "spacing":
        return `Consider using spacing token instead of ${token.value}`;
      case "typography":
        return "Consider using typography token";
      case "effects":
        return "Consider using effect token";
      case "borders":
        return "Consider using border radius token";
      default:
        return "Consider using a design token";
    }
  }
  function getDefaultSuggestion(token, category) {
    var _a, _b;
    switch (category) {
      case "colors":
        if ((_a = token.value) == null ? void 0 : _a.startsWith("#000")) return "Use semantic color token (e.g., text.primary)";
        if ((_b = token.value) == null ? void 0 : _b.startsWith("#FFF")) return "Use semantic color token (e.g., background.primary)";
        return "Create or use existing color token";
      case "spacing":
        const value = parseInt(token.value || "0");
        if (value % 8 === 0) return "Create or use existing spacing token (follows 8px grid)";
        if (value % 4 === 0) return "Create or use existing spacing token (follows 4px grid)";
        return "Create or use existing spacing token";
      case "typography":
        return "Use semantic typography token (e.g., heading.large, body.regular)";
      case "effects":
        return "Use semantic shadow token (e.g., shadow.small, shadow.medium)";
      case "borders":
        return "Use appropriate radius token (e.g., radius.small, radius.medium)";
      default:
        return "Create or use existing design token";
    }
  }

  // src/core/component-analyzer.ts
  function extractComponentContext(node) {
    const hierarchy = extractLayerHierarchy(node);
    const nestedLayers = getLayerNames(hierarchy);
    const textContent = extractTextContent(node).join(" ");
    const frameStructure = {
      width: "width" in node ? node.width : 0,
      height: "height" in node ? node.height : 0,
      layoutMode: "layoutMode" in node ? node.layoutMode || "NONE" : "NONE"
    };
    const detectedStyles = {
      hasFills: hasFillsInNode(node),
      hasStrokes: hasStrokesInNode(node),
      hasEffects: hasEffectsInNode(node),
      cornerRadius: "cornerRadius" in node ? node.cornerRadius || 0 : 0
    };
    const detectedSlots = detectSlots(node);
    const { isComponentSet, potentialVariants } = detectVariantPatterns(node);
    const additionalContext = extractAdditionalContext(node);
    return {
      name: node.name,
      type: node.type,
      hierarchy,
      textContent: textContent || void 0,
      frameStructure,
      detectedStyles,
      detectedSlots,
      isComponentSet,
      potentialVariants,
      nestedLayers,
      additionalContext
    };
  }
  function extractAdditionalContext(node) {
    const context = {
      hasInteractiveElements: false,
      possibleUseCase: "",
      designPatterns: [],
      componentFamily: "",
      suggestedConsiderations: []
    };
    const nodeName = node.name.toLowerCase();
    if (nodeName.includes("avatar") || nodeName.includes("profile")) {
      context.componentFamily = "avatar";
      context.possibleUseCase = "User representation, often clickable for profile access or dropdown menus";
      context.hasInteractiveElements = true;
      context.suggestedConsiderations.push("Consider if this avatar will be clickable/interactive");
      context.suggestedConsiderations.push("May need hover/focus states for navigation");
      context.designPatterns.push("profile-navigation", "user-menu-trigger");
    } else if (nodeName.includes("button") || nodeName.includes("btn")) {
      context.componentFamily = "button";
      context.possibleUseCase = "Interactive element for user actions";
      context.hasInteractiveElements = true;
      context.suggestedConsiderations.push("Requires all interactive states");
      context.designPatterns.push("action-trigger", "form-submission");
    } else if (nodeName.includes("badge") || nodeName.includes("tag")) {
      context.componentFamily = "badge";
      context.possibleUseCase = "Status indicator or label";
      context.hasInteractiveElements = false;
      context.suggestedConsiderations.push("Typically non-interactive unless used as a filter");
      context.designPatterns.push("status-indicator", "category-label");
    } else if (nodeName.includes("input") || nodeName.includes("field")) {
      context.componentFamily = "input";
      context.possibleUseCase = "Form input element";
      context.hasInteractiveElements = true;
      context.suggestedConsiderations.push("Needs focus, error, and disabled states");
      context.designPatterns.push("form-control", "data-entry");
    } else if (nodeName.includes("card")) {
      context.componentFamily = "card";
      context.possibleUseCase = "Content container";
      context.hasInteractiveElements = nodeName.includes("clickable") || nodeName.includes("interactive");
      context.suggestedConsiderations.push("May be interactive if used for navigation");
      context.designPatterns.push("content-container", "information-display");
    } else if (nodeName.includes("icon")) {
      context.componentFamily = "icon";
      context.possibleUseCase = "Visual indicator or decoration";
      context.hasInteractiveElements = false;
      context.suggestedConsiderations.push("Usually decorative, but may be interactive if part of a button");
      context.designPatterns.push("visual-indicator", "decoration");
    }
    if ("children" in node) {
      const hasTextWithAction = node.findAll(
        (n) => n.type === "TEXT" && (n.name.toLowerCase().includes("click") || n.name.toLowerCase().includes("action") || n.name.toLowerCase().includes("link"))
      ).length > 0;
      if (hasTextWithAction) {
        context.hasInteractiveElements = true;
      }
    }
    if (node.parent && node.parent.name.toLowerCase().includes("button")) {
      context.hasInteractiveElements = true;
      context.suggestedConsiderations.push("Part of a button component - needs interactive states");
    }
    return context;
  }
  function extractLayerHierarchy(node, depth = 0) {
    const hierarchy = [];
    const nodeInfo = {
      name: node.name,
      type: node.type,
      depth
    };
    if ("children" in node && node.children.length > 0) {
      nodeInfo.children = [];
      for (const child of node.children) {
        nodeInfo.children.push(...extractLayerHierarchy(child, depth + 1));
      }
    }
    hierarchy.push(nodeInfo);
    return hierarchy;
  }
  function getLayerNames(hierarchy) {
    const names = [];
    function traverse(layers) {
      for (const layer of layers) {
        names.push(layer.name);
        if (layer.children) {
          traverse(layer.children);
        }
      }
    }
    traverse(hierarchy);
    return names;
  }
  function detectVariantPatterns(node) {
    const potentialVariants = [];
    let isComponentSet = false;
    if (node.type === "COMPONENT_SET") {
      isComponentSet = true;
      try {
        const componentSet = node;
        let variantProps;
        try {
          variantProps = componentSet.variantGroupProperties;
        } catch (variantError) {
          console.warn("Component set has errors, cannot access variantGroupProperties:", variantError);
          variantProps = void 0;
        }
        if (variantProps) {
          potentialVariants.push(...Object.keys(variantProps));
        }
      } catch (error) {
        console.warn("Error analyzing component set:", error);
      }
    } else {
      const layerNames = getAllChildNodes(node).map((child) => child.name.toLowerCase());
      const variantKeywords = [
        "primary",
        "secondary",
        "tertiary",
        "small",
        "medium",
        "large",
        "xl",
        "xs",
        "default",
        "hover",
        "focus",
        "active",
        "disabled",
        "filled",
        "outline",
        "ghost",
        "link",
        "light",
        "dark"
      ];
      variantKeywords.forEach((keyword) => {
        if (layerNames.some((name) => name.includes(keyword))) {
          if (!potentialVariants.includes(keyword)) {
            potentialVariants.push(keyword);
          }
        }
      });
    }
    return { isComponentSet, potentialVariants };
  }
  function detectSlots(node) {
    const slots = [];
    const allNodes = getAllChildNodes(node);
    const textNodes = allNodes.filter((child) => child.type === "TEXT");
    textNodes.forEach((textNode) => {
      const name = textNode.name.toLowerCase();
      if (name.includes("title") || name.includes("label") || name.includes("text") || name.includes("content")) {
        slots.push(textNode.name);
      }
    });
    const frameNodes = allNodes.filter((child) => child.type === "FRAME");
    frameNodes.forEach((frameNode) => {
      const name = frameNode.name.toLowerCase();
      if (name.includes("content") || name.includes("slot") || name.includes("container")) {
        slots.push(frameNode.name);
      }
    });
    return slots;
  }
  function hasFillsInNode(node) {
    if ("fills" in node && Array.isArray(node.fills) && node.fills.length > 0) {
      return node.fills.some((fill) => fill.visible !== false);
    }
    if ("children" in node) {
      return node.children.some((child) => hasFillsInNode(child));
    }
    return false;
  }
  function hasStrokesInNode(node) {
    if ("strokes" in node && Array.isArray(node.strokes) && node.strokes.length > 0) {
      return node.strokes.some((stroke) => stroke.visible !== false);
    }
    if ("children" in node) {
      return node.children.some((child) => hasStrokesInNode(child));
    }
    return false;
  }
  function hasEffectsInNode(node) {
    if ("effects" in node && Array.isArray(node.effects) && node.effects.length > 0) {
      return node.effects.some((effect) => effect.visible !== false);
    }
    if ("children" in node) {
      return node.children.some((child) => hasEffectsInNode(child));
    }
    return false;
  }
  function extractPropertiesFromVariantNames(componentSet) {
    const properties = /* @__PURE__ */ new Map();
    componentSet.children.forEach((variant) => {
      if (variant.type === "COMPONENT") {
        const variantName = variant.name;
        const pairs = variantName.split(",").map((s) => s.trim());
        pairs.forEach((pair) => {
          const [key, value] = pair.split("=").map((s) => s.trim());
          if (key && value) {
            if (!properties.has(key)) {
              properties.set(key, /* @__PURE__ */ new Set());
            }
            properties.get(key).add(value);
          }
        });
      }
    });
    const result = [];
    properties.forEach((values, name) => {
      const valueArray = Array.from(values);
      result.push({
        name,
        values: valueArray,
        default: valueArray[0] || "default"
      });
    });
    return result;
  }
  function extractActualComponentProperties(node, selectedNode) {
    const actualProperties = [];
    console.log("\u{1F50D} [DEBUG] Starting property extraction for node:", node.name, "type:", node.type);
    console.log("\u{1F50D} [DEBUG] Originally selected node:", selectedNode == null ? void 0 : selectedNode.name, "type:", selectedNode == null ? void 0 : selectedNode.type);
    if (selectedNode && selectedNode.type === "INSTANCE") {
      const instance = selectedNode;
      console.log("\u{1F50D} [DEBUG] Extracting from selected instance componentProperties...");
      try {
        if ("componentProperties" in instance && instance.componentProperties) {
          const instanceProps = instance.componentProperties;
          console.log("\u{1F50D} [DEBUG] Found componentProperties on selected instance:", Object.keys(instanceProps));
          const mainComponent = instance.mainComponent;
          if (mainComponent && mainComponent.parent && mainComponent.parent.type === "COMPONENT_SET") {
            const componentSet = mainComponent.parent;
            let propertyDefinitions = null;
            try {
              if ("componentPropertyDefinitions" in componentSet) {
                propertyDefinitions = componentSet.componentPropertyDefinitions;
                console.log("\u{1F50D} [DEBUG] Got componentPropertyDefinitions from component set");
              }
            } catch (error) {
              console.log("\u{1F50D} [DEBUG] Could not access componentPropertyDefinitions, using instance properties only");
            }
            for (const propName in instanceProps) {
              const instanceProp = instanceProps[propName];
              console.log(`\u{1F50D} [DEBUG] Processing instance property "${propName}":`, instanceProp);
              let displayName = propName;
              let values = [];
              let currentValue = "";
              if (propName.includes("#")) {
                displayName = propName.split("#")[0];
              }
              if (instanceProp && typeof instanceProp === "object" && "value" in instanceProp) {
                currentValue = String(instanceProp.value);
              } else {
                currentValue = String(instanceProp);
              }
              if (propertyDefinitions && propertyDefinitions[propName]) {
                const propDef = propertyDefinitions[propName];
                console.log(`\u{1F50D} [DEBUG] Found property definition for "${propName}":`, propDef);
                switch (propDef.type) {
                  case "VARIANT":
                    values = propDef.variantOptions || [];
                    break;
                  case "BOOLEAN":
                    values = ["true", "false"];
                    break;
                  case "TEXT":
                    values = [currentValue || "Text content"];
                    break;
                  case "INSTANCE_SWAP":
                    if (propDef.preferredValues && Array.isArray(propDef.preferredValues)) {
                      values = propDef.preferredValues.map((v) => v.key || v.name || "Component instance");
                    } else {
                      values = ["Component instance"];
                    }
                    break;
                  default:
                    values = [currentValue || "Property value"];
                }
              } else {
                console.log(`\u{1F50D} [DEBUG] No property definition for "${propName}", inferring from value`);
                if (currentValue === "true" || currentValue === "false") {
                  values = ["true", "false"];
                } else {
                  values = [currentValue || "Property value"];
                }
              }
              actualProperties.push({
                name: displayName,
                values,
                default: currentValue || values[0] || "default"
              });
              console.log(`\u{1F50D} [DEBUG] Added instance property:`, { name: displayName, values, default: currentValue });
            }
            if (actualProperties.length > 0) {
              console.log(`\u{1F50D} [DEBUG] Successfully extracted ${actualProperties.length} properties from selected instance`);
              return actualProperties;
            }
          }
        }
      } catch (error) {
        console.log("\u{1F50D} [DEBUG] Could not extract from instance componentProperties:", error);
      }
    }
    if (node.type === "COMPONENT_SET") {
      const componentSet = node;
      console.log("\u{1F50D} [DEBUG] Attempting to access componentPropertyDefinitions...");
      try {
        if ("componentPropertyDefinitions" in componentSet) {
          console.log("\u{1F50D} [DEBUG] componentPropertyDefinitions property exists on componentSet");
          const propertyDefinitions = componentSet.componentPropertyDefinitions;
          console.log("\u{1F50D} [DEBUG] Raw componentPropertyDefinitions:", propertyDefinitions);
          console.log("\u{1F50D} [DEBUG] Type of componentPropertyDefinitions:", typeof propertyDefinitions);
          if (propertyDefinitions && typeof propertyDefinitions === "object") {
            const propKeys = Object.keys(propertyDefinitions);
            console.log("\u{1F50D} [DEBUG] Found componentPropertyDefinitions with keys:", propKeys);
            for (const propName in propertyDefinitions) {
              const prop = propertyDefinitions[propName];
              console.log(`\u{1F50D} [DEBUG] Processing property "${propName}":`, prop);
              let displayName = propName;
              let values = [];
              let defaultValue = "";
              if (propName.includes("#")) {
                displayName = propName.split("#")[0];
                console.log(`\u{1F50D} [DEBUG] Cleaned display name: "${displayName}" from "${propName}"`);
              }
              switch (prop.type) {
                case "VARIANT":
                  values = prop.variantOptions || [];
                  defaultValue = String(prop.defaultValue) || values[0] || "default";
                  console.log(`\u{1F50D} [DEBUG] VARIANT property "${displayName}": values=${values}, default=${defaultValue}`);
                  break;
                case "BOOLEAN":
                  values = ["true", "false"];
                  defaultValue = prop.defaultValue ? "true" : "false";
                  console.log(`\u{1F50D} [DEBUG] BOOLEAN property "${displayName}": default=${defaultValue}`);
                  break;
                case "TEXT":
                  values = [String(prop.defaultValue || "Text content")];
                  defaultValue = String(prop.defaultValue || "Text content");
                  console.log(`\u{1F50D} [DEBUG] TEXT property "${displayName}": value=${defaultValue}`);
                  break;
                case "INSTANCE_SWAP":
                  if (prop.preferredValues && Array.isArray(prop.preferredValues)) {
                    values = prop.preferredValues.map((v) => {
                      console.log(`\u{1F50D} [DEBUG] INSTANCE_SWAP preferred value:`, v);
                      return v.key || v.name || "Component instance";
                    });
                  } else {
                    values = ["Component instance"];
                  }
                  defaultValue = values[0] || "Component instance";
                  console.log(`\u{1F50D} [DEBUG] INSTANCE_SWAP property "${displayName}": values=${values}, default=${defaultValue}`);
                  break;
                default:
                  console.log(`\u{1F50D} [DEBUG] Unknown property type "${prop.type}" for "${displayName}"`);
                  values = ["Property value"];
                  defaultValue = "Default";
              }
              actualProperties.push({
                name: displayName,
                values,
                default: defaultValue
              });
              console.log(`\u{1F50D} [DEBUG] Added property:`, { name: displayName, values, default: defaultValue });
            }
          } else {
            console.log("\u{1F50D} [DEBUG] componentPropertyDefinitions is not a valid object:", propertyDefinitions);
          }
        } else {
          console.log("\u{1F50D} [DEBUG] componentPropertyDefinitions property does not exist on componentSet");
        }
      } catch (error) {
        console.error("\u{1F50D} [ERROR] Could not access componentPropertyDefinitions:", error);
        console.error("\u{1F50D} [ERROR] Error stack:", error instanceof Error ? error.stack : "No stack trace");
      }
      if (actualProperties.length === 0) {
        console.log("\u{1F50D} [DEBUG] No properties found, trying variantGroupProperties fallback...");
        try {
          const variantProps = componentSet.variantGroupProperties;
          console.log("\u{1F50D} [DEBUG] variantGroupProperties:", variantProps);
          if (variantProps) {
            const variantKeys = Object.keys(variantProps);
            console.log("\u{1F50D} [DEBUG] Found variantGroupProperties with keys:", variantKeys);
            for (const propName in variantProps) {
              const prop = variantProps[propName];
              console.log(`\u{1F50D} [DEBUG] Processing variant property "${propName}":`, prop);
              actualProperties.push({
                name: propName,
                values: prop.values,
                default: prop.values[0] || "default"
              });
            }
          } else {
            console.log("\u{1F50D} [DEBUG] variantGroupProperties is null/undefined");
          }
        } catch (error) {
          console.warn("\u{1F50D} [WARN] Component set has errors, cannot access variantGroupProperties:", error);
        }
      }
      if (actualProperties.length === 0) {
        console.log("\u{1F50D} [DEBUG] All Figma APIs failed, using comprehensive structural analysis...");
        const structuralProperties = extractPropertiesFromStructuralAnalysis(componentSet);
        console.log("\u{1F50D} [DEBUG] Properties from structural analysis:", structuralProperties);
        actualProperties.push(...structuralProperties);
      }
      if (actualProperties.length === 0) {
        console.log("\u{1F50D} [DEBUG] Final fallback: extracting from variant names");
        const variantPropsFromNames = extractPropertiesFromVariantNames(componentSet);
        console.log("\u{1F50D} [DEBUG] Properties from variant names:", variantPropsFromNames);
        actualProperties.push(...variantPropsFromNames);
      }
    } else if (node.type === "COMPONENT") {
      const component = node;
      console.log("\u{1F50D} [DEBUG] Processing COMPONENT node:", component.name);
      try {
        if ("componentPropertyDefinitions" in component) {
          const propertyDefinitions = component.componentPropertyDefinitions;
          console.log("\u{1F50D} [DEBUG] Component componentPropertyDefinitions:", propertyDefinitions);
          if (propertyDefinitions && typeof propertyDefinitions === "object") {
            const propKeys = Object.keys(propertyDefinitions);
            console.log("\u{1F50D} [DEBUG] Found componentPropertyDefinitions on component with keys:", propKeys);
            for (const propName in propertyDefinitions) {
              const prop = propertyDefinitions[propName];
              let displayName = propName;
              let values = [];
              let defaultValue = "";
              if (propName.includes("#")) {
                displayName = propName.split("#")[0];
              }
              switch (prop.type) {
                case "BOOLEAN":
                  values = ["true", "false"];
                  defaultValue = prop.defaultValue ? "true" : "false";
                  break;
                case "TEXT":
                  values = [String(prop.defaultValue || "Text content")];
                  defaultValue = String(prop.defaultValue || "Text content");
                  break;
                case "INSTANCE_SWAP":
                  if (prop.preferredValues && Array.isArray(prop.preferredValues)) {
                    values = prop.preferredValues.map((v) => v.key || v.name || "Component instance");
                  } else {
                    values = ["Component instance"];
                  }
                  defaultValue = values[0] || "Component instance";
                  break;
                default:
                  values = ["Property value"];
                  defaultValue = "Default";
              }
              actualProperties.push({
                name: displayName,
                values,
                default: defaultValue
              });
            }
          }
        } else {
          console.log("\u{1F50D} [DEBUG] componentPropertyDefinitions does not exist on component");
        }
      } catch (error) {
        console.warn("\u{1F50D} [WARN] Could not access componentPropertyDefinitions on component:", error);
      }
      if (component.parent && component.parent.type === "COMPONENT_SET") {
        const componentSet = component.parent;
        console.log("\u{1F50D} [DEBUG] Component is part of a component set, getting variant properties...");
        try {
          const variantProps = componentSet.variantGroupProperties;
          if (variantProps) {
            for (const propName in variantProps) {
              const prop = variantProps[propName];
              if (!actualProperties.find((p) => p.name === propName)) {
                actualProperties.push({
                  name: propName,
                  values: prop.values,
                  default: prop.values[0] || "default"
                });
              }
            }
          }
        } catch (error) {
          console.warn("\u{1F50D} [WARN] Component set has errors, cannot access variantGroupProperties:", error);
        }
      }
    } else if (node.type === "INSTANCE") {
      console.log("\u{1F50D} [DEBUG] Instance case already handled in priority 1");
    }
    const uniqueProperties = [];
    actualProperties.forEach((prop) => {
      if (!uniqueProperties.find((p) => p.name === prop.name)) {
        uniqueProperties.push(prop);
      }
    });
    console.log(`\u{1F50D} [DEBUG] Final result: Extracted ${uniqueProperties.length} unique properties:`, uniqueProperties.map((p) => ({ name: p.name, valueCount: p.values.length, default: p.default })));
    return uniqueProperties;
  }
  function extractPropertiesFromStructuralAnalysis(componentSet) {
    const properties = [];
    console.log("\u{1F50D} [STRUCTURAL] Starting comprehensive structural analysis of component set:", componentSet.name);
    const variantProperties = extractPropertiesFromVariantNames(componentSet);
    properties.push(...variantProperties);
    const allChildNames = /* @__PURE__ */ new Set();
    const textLayers = /* @__PURE__ */ new Set();
    const instanceLayers = /* @__PURE__ */ new Set();
    const booleanIndicators = /* @__PURE__ */ new Set();
    componentSet.children.forEach((variant) => {
      if (variant.type === "COMPONENT") {
        console.log(`\u{1F50D} [STRUCTURAL] Analyzing variant: ${variant.name}`);
        const traverseNode = (node, depth = 0) => {
          const indent = "  ".repeat(depth);
          console.log(`\u{1F50D} [STRUCTURAL] ${indent}Found child: ${node.name} (type: ${node.type})`);
          allChildNames.add(node.name);
          if (node.type === "TEXT") {
            textLayers.add(node.name);
          } else if (node.type === "INSTANCE") {
            instanceLayers.add(node.name);
          }
          if (node.visible === false || node.name.toLowerCase().includes("hidden")) {
            booleanIndicators.add(node.name);
          }
          if ("children" in node && node.children) {
            node.children.forEach((child) => traverseNode(child, depth + 1));
          }
        };
        traverseNode(variant);
      }
    });
    console.log("\u{1F50D} [STRUCTURAL] Analysis results:");
    console.log("\u{1F50D} [STRUCTURAL] - All child names:", Array.from(allChildNames));
    console.log("\u{1F50D} [STRUCTURAL] - Text layers:", Array.from(textLayers));
    console.log("\u{1F50D} [STRUCTURAL] - Instance layers:", Array.from(instanceLayers));
    console.log("\u{1F50D} [STRUCTURAL] - Boolean indicators:", Array.from(booleanIndicators));
    textLayers.forEach((textLayerName) => {
      const cleanName = textLayerName.replace(/\s*(layer|text|label)?\s*/gi, "").trim();
      if (cleanName && !properties.find((p) => p.name.toLowerCase() === cleanName.toLowerCase())) {
        properties.push({
          name: cleanName,
          values: ["Text content"],
          default: "Label"
        });
        console.log(`\u{1F50D} [STRUCTURAL] Added TEXT property: ${cleanName}`);
      }
    });
    instanceLayers.forEach((instanceLayerName) => {
      const cleanName = instanceLayerName.replace(/\s*(layer|instance)?\s*/gi, "").trim();
      if (cleanName && !properties.find((p) => p.name.toLowerCase() === cleanName.toLowerCase())) {
        properties.push({
          name: cleanName,
          values: ["Component instance"],
          default: "Default component"
        });
        console.log(`\u{1F50D} [STRUCTURAL] Added INSTANCE_SWAP property: ${cleanName}`);
      }
    });
    const commonBooleanPatterns = [
      "icon before",
      "icon after",
      "slot before",
      "slot after",
      "before",
      "after",
      "prefix",
      "suffix",
      "leading",
      "trailing"
    ];
    commonBooleanPatterns.forEach((pattern) => {
      const foundLayer = Array.from(allChildNames).find(
        (name) => name.toLowerCase().includes(pattern.toLowerCase())
      );
      if (foundLayer && !properties.find((p) => p.name.toLowerCase().includes(pattern.toLowerCase()))) {
        const propertyName = pattern.split(" ").map(
          (word) => word.charAt(0).toUpperCase() + word.slice(1)
        ).join(" ");
        properties.push({
          name: propertyName,
          values: ["true", "false"],
          default: "false"
        });
        console.log(`\u{1F50D} [STRUCTURAL] Added BOOLEAN property: ${propertyName}`);
      }
    });
    const componentName = componentSet.name.toLowerCase();
    if (componentName.includes("button") || componentName.includes("btn")) {
      const commonButtonProperties = [
        { name: "Slot Before", type: "BOOLEAN" },
        { name: "Text", type: "TEXT" },
        { name: "Icon Before", type: "INSTANCE_SWAP" },
        { name: "Icon After", type: "INSTANCE_SWAP" }
      ];
      commonButtonProperties.forEach(({ name, type }) => {
        if (!properties.find((p) => p.name.toLowerCase() === name.toLowerCase())) {
          let values, defaultValue;
          switch (type) {
            case "BOOLEAN":
              values = ["true", "false"];
              defaultValue = "false";
              break;
            case "TEXT":
              values = ["Text content"];
              defaultValue = "Label";
              break;
            case "INSTANCE_SWAP":
              values = ["Component instance"];
              defaultValue = "Default icon";
              break;
            default:
              values = ["Property value"];
              defaultValue = "Default";
          }
          properties.push({
            name,
            values,
            default: defaultValue
          });
          console.log(`\u{1F50D} [STRUCTURAL] Added common ${type} property: ${name}`);
        }
      });
    }
    console.log(`\u{1F50D} [STRUCTURAL] Final structural analysis result: ${properties.length} properties found`);
    return properties;
  }
  function extractActualComponentStates(node) {
    const actualStates = [];
    if (node.type === "COMPONENT_SET") {
      const componentSet = node;
      let variantProps;
      try {
        variantProps = componentSet.variantGroupProperties;
      } catch (error) {
        console.warn("Component set has errors, cannot access variantGroupProperties:", error);
        variantProps = void 0;
      }
      if (variantProps) {
        for (const propName in variantProps) {
          const lowerPropName = propName.toLowerCase();
          if (lowerPropName === "state" || lowerPropName === "states" || lowerPropName === "status") {
            actualStates.push(...variantProps[propName].values);
          }
        }
      }
      componentSet.children.forEach((variant) => {
        const variantName = variant.name.toLowerCase();
        ["default", "hover", "focus", "disabled", "pressed", "active", "selected"].forEach((state) => {
          const existingState = actualStates.find((existing) => existing.toLowerCase() === state.toLowerCase());
          if (variantName.includes(state) && !existingState) {
            actualStates.push(state);
          }
        });
      });
    } else if (node.type === "COMPONENT") {
      const component = node;
      if (component.parent && component.parent.type === "COMPONENT_SET") {
        return extractActualComponentStates(component.parent);
      }
    } else if (node.type === "INSTANCE") {
      const instance = node;
      const mainComponent = instance.mainComponent;
      if (mainComponent) {
        return extractActualComponentStates(mainComponent);
      }
    }
    const uniqueStates = [];
    actualStates.forEach((state) => {
      if (state && typeof state === "string" && state.trim() !== "") {
        const existingState = uniqueStates.find((existing) => existing.toLowerCase() === state.toLowerCase());
        if (!existingState) {
          uniqueStates.push(state.trim());
        }
      }
    });
    return uniqueStates;
  }
  async function processEnhancedAnalysis(claudeData, node, selectedNode) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m;
    const tokens = await extractDesignTokensFromNode(node);
    const context = extractAdditionalContext(node);
    const actualProperties = extractActualComponentProperties(node, selectedNode);
    const actualStates = extractActualComponentStates(node);
    let recommendations;
    const shouldGenerateRecommendations = actualProperties.length <= 2;
    if (shouldGenerateRecommendations) {
      console.log("\u{1F50D} [DEBUG] Component has few properties, generating recommendations...");
      recommendations = generatePropertyRecommendations(node.name, actualProperties);
    }
    const audit = {
      states: [],
      accessibility: [],
      naming: [],
      consistency: []
    };
    if (actualStates.length > 0) {
      actualStates.forEach((state) => {
        audit.states.push({
          name: state,
          found: true
        });
      });
    } else {
      const shouldHaveStates = context.hasInteractiveElements && context.componentFamily !== "badge" && context.componentFamily !== "icon";
      if (shouldHaveStates) {
        const recommendedStates = ["default", "hover", "focus", "disabled"];
        recommendedStates.forEach((state) => {
          audit.states.push({
            name: state,
            found: false
          });
        });
      } else {
        audit.states.push({
          name: "default",
          found: true
        });
      }
    }
    if (claudeData.audit && Array.isArray(claudeData.audit.accessibilityIssues)) {
      claudeData.audit.accessibilityIssues.forEach((issue) => {
        if (typeof issue === "string" && issue.trim()) {
          audit.accessibility.push({
            check: issue,
            status: "warning",
            suggestion: "Review accessibility requirements"
          });
        }
      });
    }
    if (claudeData.audit && Array.isArray(claudeData.audit.namingIssues) && claudeData.audit.namingIssues.length > 0) {
      claudeData.audit.namingIssues.forEach((issue) => {
        if (typeof issue === "string" && issue.trim() && issue.toLowerCase() !== "undefined") {
          audit.naming.push({
            layer: node.name,
            issue,
            suggestion: "Follow naming conventions"
          });
        }
      });
    }
    if (audit.naming.length === 0) {
      audit.naming.push({
        layer: node.name,
        issue: "Component naming follows conventions",
        suggestion: "Good naming structure"
      });
    }
    if (claudeData.audit && Array.isArray(claudeData.audit.consistencyIssues) && claudeData.audit.consistencyIssues.length > 0) {
      claudeData.audit.consistencyIssues.forEach((issue) => {
        if (typeof issue === "string" && issue.trim() && issue.toLowerCase() !== "undefined") {
          audit.consistency.push({
            property: "Design consistency",
            issue,
            suggestion: "Review design system standards"
          });
        }
      });
    }
    if (audit.consistency.length === 0) {
      audit.consistency.push({
        property: "Design consistency",
        issue: "Component follows design system patterns",
        suggestion: "Consistent with design standards"
      });
    }
    const cleanMetadata = {
      component: claudeData.component || node.name,
      description: claudeData.description || "Component analysis",
      props: actualProperties.map((prop) => ({
        name: prop.name,
        type: prop.values.length > 1 ? "variant" : "string",
        description: `Property with values: ${prop.values.join(", ")}`,
        defaultValue: prop.default,
        required: false
      })),
      propertyCheatSheet: actualProperties.map((prop) => ({
        name: prop.name,
        values: prop.values,
        default: prop.default,
        description: `Available values: ${prop.values.join(", ")}`
      })),
      states: actualStates.length > 0 ? actualStates : context.componentFamily === "badge" ? ["default"] : [],
      slots: claudeData.slots || [],
      variants: actualProperties.reduce((acc, prop) => {
        acc[prop.name] = prop.values;
        return acc;
      }, {}),
      usage: claudeData.usage || `This ${context.componentFamily || "component"} is used for ${context.possibleUseCase || "displaying content"}.`,
      accessibility: {
        ariaLabels: ((_a = claudeData.accessibility) == null ? void 0 : _a.ariaLabels) || [],
        keyboardSupport: ((_b = claudeData.accessibility) == null ? void 0 : _b.keyboardSupport) || "Standard keyboard navigation",
        colorContrast: ((_c = claudeData.accessibility) == null ? void 0 : _c.colorContrast) || "WCAG AA compliant",
        focusManagement: ((_d = claudeData.accessibility) == null ? void 0 : _d.focusManagement) || "Proper focus indicators"
      },
      tokens: {
        colors: ((_e = claudeData.tokens) == null ? void 0 : _e.colors) || [],
        spacing: ((_f = claudeData.tokens) == null ? void 0 : _f.spacing) || [],
        typography: ((_g = claudeData.tokens) == null ? void 0 : _g.typography) || [],
        effects: ((_h = claudeData.tokens) == null ? void 0 : _h.effects) || [],
        borders: ((_i = claudeData.tokens) == null ? void 0 : _i.borders) || []
      },
      audit: {
        accessibilityIssues: ((_j = claudeData.audit) == null ? void 0 : _j.accessibilityIssues) || [],
        namingIssues: ((_k = claudeData.audit) == null ? void 0 : _k.namingIssues) || [],
        consistencyIssues: ((_l = claudeData.audit) == null ? void 0 : _l.consistencyIssues) || [],
        tokenOpportunities: ((_m = claudeData.audit) == null ? void 0 : _m.tokenOpportunities) || []
      },
      mcpReadiness: claudeData.mcpReadiness ? enhanceMCPReadinessWithFallback(claudeData.mcpReadiness, {
        node,
        context,
        actualProperties,
        actualStates,
        tokens
      }) : generateFallbackMCPReadiness({
        node,
        context,
        actualProperties,
        actualStates,
        tokens
      })
    };
    return {
      metadata: cleanMetadata,
      tokens,
      audit,
      properties: actualProperties,
      // This will be used by the UI for the property cheat sheet
      recommendations
    };
  }
  function generateFallbackMCPReadiness(data) {
    const { node, context, actualProperties, actualStates, tokens } = data;
    const family = context.componentFamily || "generic";
    const strengths = [];
    const gaps = [];
    const recommendations = [];
    if (node.name && node.name.trim() !== "" && !node.name.toLowerCase().includes("untitled")) {
      strengths.push("Component has descriptive naming");
    } else {
      gaps.push("Component name needs improvement");
      recommendations.push("Use descriptive component names that indicate purpose");
    }
    if (context.hierarchy && context.hierarchy.length > 1) {
      strengths.push("Well-structured component hierarchy");
    } else {
      gaps.push("Simple component structure");
    }
    if (actualProperties.length > 0) {
      strengths.push(`Has ${actualProperties.length} configurable properties`);
    } else {
      gaps.push("No configurable properties defined");
      recommendations.push("Add component properties for customization");
    }
    const shouldHaveStates = context.hasInteractiveElements && family !== "badge" && family !== "icon";
    if (shouldHaveStates) {
      if (actualStates.length > 1) {
        strengths.push("Includes multiple component states");
      } else {
        gaps.push("Missing interactive states");
        recommendations.push("Add hover, focus, and disabled states for interactive components");
      }
    }
    const hasTokens = tokens && (tokens.colors && tokens.colors.some((t) => t.isActualToken) || tokens.spacing && tokens.spacing.some((t) => t.isActualToken) || tokens.typography && tokens.typography.some((t) => t.isActualToken));
    if (hasTokens) {
      strengths.push("Uses design tokens for consistency");
    } else {
      gaps.push("Limited design token usage");
      recommendations.push("Replace hard-coded values with design tokens");
    }
    if (family === "avatar" && actualProperties.length === 0) {
      gaps.push("Missing size variants");
      recommendations.push("Add size property for different use cases");
    } else if (family === "button" && actualStates.length <= 1) {
      gaps.push("Incomplete accessibility features");
      recommendations.push("Add accessibility states and ARIA labels");
    }
    if (strengths.length === 0) {
      strengths.push("Component follows basic structure patterns");
    }
    if (gaps.length === 0) {
      gaps.push("Component could benefit from additional states");
    }
    if (recommendations.length === 0) {
      recommendations.push("Consider adding size variants for scalability");
    }
    const baseScore = Math.max(40, 100 - gaps.length * 15 + strengths.length * 10);
    const score = Math.min(100, baseScore);
    return {
      score,
      strengths,
      gaps,
      recommendations,
      implementationNotes: `This ${family} component can be enhanced for better MCP code generation compatibility by addressing the identified gaps.`
    };
  }
  function enhanceMCPReadinessWithFallback(mcpData, data) {
    const score = parseInt(mcpData.score) || 0;
    let strengths = Array.isArray(mcpData.strengths) ? mcpData.strengths.filter(
      (s) => typeof s === "string" && s.trim() && !s.includes("REQUIRED") && !s.includes("Examples")
    ) : [];
    let gaps = Array.isArray(mcpData.gaps) ? mcpData.gaps.filter(
      (g) => typeof g === "string" && g.trim() && !g.includes("REQUIRED") && !g.includes("Examples")
    ) : [];
    let recommendations = Array.isArray(mcpData.recommendations) ? mcpData.recommendations.filter(
      (r) => typeof r === "string" && r.trim() && !r.includes("REQUIRED") && !r.includes("Examples")
    ) : [];
    if (strengths.length === 0 || gaps.length === 0 || recommendations.length === 0) {
      console.log("\u{1F504} Enhancing MCP readiness with fallback content...");
      const fallback = generateFallbackMCPReadiness(data);
      if (strengths.length === 0) {
        strengths = fallback.strengths;
      }
      if (gaps.length === 0) {
        gaps = fallback.gaps;
      }
      if (recommendations.length === 0) {
        recommendations = fallback.recommendations;
      }
    }
    return {
      score,
      strengths,
      gaps,
      recommendations,
      implementationNotes: mcpData.implementationNotes || `This component can be optimized for MCP code generation by addressing the identified improvements.`
    };
  }
  function generatePropertyRecommendations(componentName, existingProperties) {
    const recommendations = [];
    const lowerName = componentName.toLowerCase();
    console.log("\u{1F50D} [RECOMMENDATIONS] Generating recommendations for:", componentName, "with", existingProperties.length, "existing properties");
    const hasProperty = (name) => existingProperties.some(
      (prop) => prop.name.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(prop.name.toLowerCase())
    );
    if (lowerName.includes("avatar") || lowerName.includes("profile") || lowerName.includes("user")) {
      if (!hasProperty("size")) {
        recommendations.push({
          name: "Size",
          type: "VARIANT",
          description: "Different sizes for various use cases (list items, headers, etc.)",
          examples: ["xs (24px)", "sm (32px)", "md (40px)", "lg (56px)", "xl (80px)"]
        });
      }
      if (!hasProperty("initials") && !hasProperty("text")) {
        recommendations.push({
          name: "Initials",
          type: "TEXT",
          description: "User initials displayed when no image is available",
          examples: ["JD", "AS", "MT"]
        });
      }
      if (!hasProperty("image") && !hasProperty("src")) {
        recommendations.push({
          name: "Image",
          type: "INSTANCE_SWAP",
          description: "User profile image or placeholder",
          examples: ["User photo", "Default avatar", "Company logo"]
        });
      }
      if (!hasProperty("status") && !hasProperty("indicator")) {
        recommendations.push({
          name: "Status Indicator",
          type: "BOOLEAN",
          description: "Online/offline status or notification badge",
          examples: ["true (show indicator)", "false (no indicator)"]
        });
      }
      if (!hasProperty("border") && !hasProperty("ring")) {
        recommendations.push({
          name: "Border",
          type: "BOOLEAN",
          description: "Optional border around the avatar",
          examples: ["true (with border)", "false (no border)"]
        });
      }
    } else if (lowerName.includes("button") || lowerName.includes("btn")) {
      if (!hasProperty("variant") && !hasProperty("style")) {
        recommendations.push({
          name: "Variant",
          type: "VARIANT",
          description: "Visual style variants for different hierarchy levels",
          examples: ["primary", "secondary", "tertiary", "danger", "ghost"]
        });
      }
      if (!hasProperty("size")) {
        recommendations.push({
          name: "Size",
          type: "VARIANT",
          description: "Button sizes for different contexts",
          examples: ["sm", "md", "lg", "xl"]
        });
      }
      if (!hasProperty("state")) {
        recommendations.push({
          name: "State",
          type: "VARIANT",
          description: "Interactive states for user feedback",
          examples: ["default", "hover", "focus", "pressed", "disabled"]
        });
      }
      if (!hasProperty("icon") && !hasProperty("before") && !hasProperty("after")) {
        recommendations.push({
          name: "Icon Before",
          type: "INSTANCE_SWAP",
          description: "Optional icon before the button text",
          examples: ["Plus icon", "Arrow icon", "No icon"]
        });
      }
      if (!hasProperty("text") && !hasProperty("label")) {
        recommendations.push({
          name: "Text",
          type: "TEXT",
          description: "Button label text",
          examples: ["Click me", "Submit", "Cancel", "Save changes"]
        });
      }
    } else if (lowerName.includes("input") || lowerName.includes("field") || lowerName.includes("form")) {
      if (!hasProperty("label")) {
        recommendations.push({
          name: "Label",
          type: "TEXT",
          description: "Input label for accessibility and clarity",
          examples: ["Email address", "Full name", "Password"]
        });
      }
      if (!hasProperty("placeholder")) {
        recommendations.push({
          name: "Placeholder",
          type: "TEXT",
          description: "Placeholder text shown when input is empty",
          examples: ["Enter your email...", "Type here..."]
        });
      }
      if (!hasProperty("state")) {
        recommendations.push({
          name: "State",
          type: "VARIANT",
          description: "Input states for different interactions",
          examples: ["default", "focus", "error", "disabled", "success"]
        });
      }
      if (!hasProperty("required")) {
        recommendations.push({
          name: "Required",
          type: "BOOLEAN",
          description: "Whether the field is required",
          examples: ["true (required)", "false (optional)"]
        });
      }
      if (!hasProperty("error") && !hasProperty("helper")) {
        recommendations.push({
          name: "Helper Text",
          type: "TEXT",
          description: "Helper or error message below the input",
          examples: ["This field is required", "Must be a valid email"]
        });
      }
    } else if (lowerName.includes("card")) {
      if (!hasProperty("variant") && !hasProperty("elevation")) {
        recommendations.push({
          name: "Elevation",
          type: "VARIANT",
          description: "Card elevation/shadow level",
          examples: ["none", "low", "medium", "high"]
        });
      }
      if (!hasProperty("interactive") && !hasProperty("clickable")) {
        recommendations.push({
          name: "Interactive",
          type: "BOOLEAN",
          description: "Whether the card is clickable/interactive",
          examples: ["true (clickable)", "false (static)"]
        });
      }
      if (!hasProperty("image") && !hasProperty("media")) {
        recommendations.push({
          name: "Media",
          type: "INSTANCE_SWAP",
          description: "Optional image or media at the top of the card",
          examples: ["Product image", "Hero image", "No media"]
        });
      }
    } else if (lowerName.includes("badge") || lowerName.includes("tag") || lowerName.includes("chip")) {
      if (!hasProperty("variant") && !hasProperty("color")) {
        recommendations.push({
          name: "Variant",
          type: "VARIANT",
          description: "Badge color/style variants",
          examples: ["primary", "secondary", "success", "warning", "error"]
        });
      }
      if (!hasProperty("size")) {
        recommendations.push({
          name: "Size",
          type: "VARIANT",
          description: "Badge sizes for different contexts",
          examples: ["sm", "md", "lg"]
        });
      }
      if (!hasProperty("text") && !hasProperty("label")) {
        recommendations.push({
          name: "Text",
          type: "TEXT",
          description: "Badge text content",
          examples: ["New", "Beta", "Sale", "5", "Premium"]
        });
      }
      if (!hasProperty("removable") && !hasProperty("close")) {
        recommendations.push({
          name: "Removable",
          type: "BOOLEAN",
          description: "Whether the badge can be removed/dismissed",
          examples: ["true (show close button)", "false (static)"]
        });
      }
    } else if (lowerName.includes("icon")) {
      if (!hasProperty("size")) {
        recommendations.push({
          name: "Size",
          type: "VARIANT",
          description: "Icon sizes for different use cases",
          examples: ["12px", "16px", "20px", "24px", "32px"]
        });
      }
      if (!hasProperty("color") && !hasProperty("variant")) {
        recommendations.push({
          name: "Color",
          type: "VARIANT",
          description: "Icon color variants",
          examples: ["default", "muted", "primary", "success", "warning", "error"]
        });
      }
    }
    if (recommendations.length === 0) {
      if (!hasProperty("size")) {
        recommendations.push({
          name: "Size",
          type: "VARIANT",
          description: "Component sizes for different contexts",
          examples: ["sm", "md", "lg"]
        });
      }
      if (!hasProperty("variant") && !hasProperty("style")) {
        recommendations.push({
          name: "Variant",
          type: "VARIANT",
          description: "Visual style variants",
          examples: ["primary", "secondary", "tertiary"]
        });
      }
    }
    const filteredRecommendations = recommendations.filter((rec) => {
      const similarExists = existingProperties.some((existing) => {
        const nameSimilarity = existing.name.toLowerCase().includes(rec.name.toLowerCase()) || rec.name.toLowerCase().includes(existing.name.toLowerCase());
        return nameSimilarity;
      });
      return !similarExists;
    });
    console.log(`\u{1F50D} [RECOMMENDATIONS] Generated ${filteredRecommendations.length} recommendations for ${componentName}`);
    return filteredRecommendations;
  }

  // src/api/claude.ts
  var ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
  var DEFAULT_MODEL = "claude-3-sonnet-20240229";
  var MAX_TOKENS = 2048;
  var DETERMINISTIC_CONFIG = {
    temperature: 0.1,
    // Low temperature for consistency
    top_p: 0.1
    // Low top_p for deterministic responses
  };
  async function fetchClaude(prompt, apiKey, model = DEFAULT_MODEL, isDeterministic = true) {
    console.log("Making Claude API call with deterministic settings...");
    const requestBody = __spreadValues({
      model,
      messages: [
        {
          role: "user",
          content: prompt.trim()
        }
      ],
      max_tokens: MAX_TOKENS
    }, isDeterministic ? DETERMINISTIC_CONFIG : {});
    const headers = {
      "content-type": "application/json",
      "x-api-key": apiKey.trim(),
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    };
    try {
      console.log("Sending request to Claude API...");
      const response = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody)
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Claude API error response:", errorText);
        throw new Error(`Claude API request failed: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      console.log("Claude API response:", data);
      if (data.content && data.content[0] && data.content[0].text) {
        return data.content[0].text.trim();
      } else {
        throw new Error("Invalid response format from Claude API");
      }
    } catch (error) {
      console.error("Error calling Claude API:", error);
      if (error instanceof Error) {
        if (error.message.includes("Failed to fetch")) {
          throw new Error("Failed to connect to Claude API. Please check your internet connection.");
        } else if (error.message.includes("401")) {
          throw new Error("Invalid API key. Please check your Claude API key.");
        } else if (error.message.includes("429")) {
          throw new Error("Rate limit exceeded. Please try again later.");
        }
      }
      throw error;
    }
  }
  function extractJSONFromResponse(response) {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (error) {
      console.error("Failed to parse JSON from Claude response:", error);
      throw new Error("Invalid JSON response from Claude API");
    }
  }

  // src/core/consistency-engine.ts
  var ComponentConsistencyEngine = class {
    constructor(config = {}) {
      this.cache = /* @__PURE__ */ new Map();
      this.designSystemsKnowledge = null;
      this.config = __spreadValues({
        enableCaching: true,
        enableMCPIntegration: true,
        mcpServerUrl: "https://design-systems-mcp.southleft-llc.workers.dev/mcp",
        consistencyThreshold: 0.95
      }, config);
    }
    /**
     * Generate a deterministic hash for a component based on its structure
     */
    generateComponentHash(context, tokens) {
      var _a, _b;
      const hashInput = {
        name: context.name,
        type: context.type,
        hierarchy: this.normalizeHierarchy(context.hierarchy),
        frameStructure: context.frameStructure,
        detectedStyles: context.detectedStyles,
        tokenFingerprint: this.generateTokenFingerprint(tokens),
        // Don't include dynamic context that could vary
        staticProperties: {
          hasInteractiveElements: ((_a = context.additionalContext) == null ? void 0 : _a.hasInteractiveElements) || false,
          componentFamily: ((_b = context.additionalContext) == null ? void 0 : _b.componentFamily) || "generic"
        }
      };
      return this.createHash(JSON.stringify(hashInput));
    }
    /**
     * Get cached analysis if available and valid
     */
    getCachedAnalysis(hash) {
      if (!this.config.enableCaching) return null;
      const cached = this.cache.get(hash);
      if (!cached) return null;
      const isExpired = Date.now() - cached.timestamp > 24 * 60 * 60 * 1e3;
      if (isExpired) {
        this.cache.delete(hash);
        return null;
      }
      console.log("\u2705 Using cached analysis for component hash:", hash);
      return cached;
    }
    /**
     * Cache analysis result
     */
    cacheAnalysis(hash, result) {
      var _a;
      if (!this.config.enableCaching) return;
      this.cache.set(hash, {
        hash,
        result,
        timestamp: Date.now(),
        mcpKnowledgeVersion: ((_a = this.designSystemsKnowledge) == null ? void 0 : _a.version) || "1.0.0"
      });
      console.log("\u{1F4BE} Cached analysis for component hash:", hash);
    }
    /**
    * Load design systems knowledge from MCP server
    */
    async loadDesignSystemsKnowledge() {
      if (!this.config.enableMCPIntegration) {
        console.log("\u{1F4DA} MCP integration disabled, using fallback knowledge");
        this.loadFallbackKnowledge();
        return;
      }
      try {
        console.log("\u{1F504} Loading design systems knowledge from MCP...");
        const connectivityTest = await this.testMCPConnectivity();
        if (!connectivityTest) {
          console.warn("\u26A0\uFE0F MCP server not accessible, using fallback knowledge");
          this.loadFallbackKnowledge();
          return;
        }
        const [componentKnowledge, tokenKnowledge, accessibilityKnowledge, scoringKnowledge] = await Promise.allSettled([
          this.queryMCP("component analysis best practices"),
          this.queryMCP("design token naming conventions and patterns"),
          this.queryMCP("design system accessibility requirements"),
          this.queryMCP("design system component scoring methodology")
        ]);
        this.designSystemsKnowledge = {
          version: "1.0.0",
          components: this.processComponentKnowledge(
            componentKnowledge.status === "fulfilled" ? componentKnowledge.value : null
          ),
          tokens: this.processKnowledgeContent(
            tokenKnowledge.status === "fulfilled" ? tokenKnowledge.value : null
          ),
          accessibility: this.processKnowledgeContent(
            accessibilityKnowledge.status === "fulfilled" ? accessibilityKnowledge.value : null
          ),
          scoring: this.processKnowledgeContent(
            scoringKnowledge.status === "fulfilled" ? scoringKnowledge.value : null
          ),
          lastUpdated: Date.now()
        };
        const successfulQueries = [componentKnowledge, tokenKnowledge, accessibilityKnowledge, scoringKnowledge].filter((result) => result.status === "fulfilled").length;
        if (successfulQueries > 0) {
          console.log(`\u2705 Design systems knowledge loaded successfully (${successfulQueries}/4 queries successful)`);
        } else {
          console.warn("\u26A0\uFE0F All MCP queries failed, using fallback knowledge");
          this.loadFallbackKnowledge();
        }
      } catch (error) {
        console.warn("\u26A0\uFE0F Failed to load design systems knowledge:", error);
        this.loadFallbackKnowledge();
      }
    }
    /**
    * Test MCP server connectivity using MCP initialization instead of health endpoint
    */
    async testMCPConnectivity() {
      var _a, _b;
      try {
        console.log("\u{1F517} Testing MCP server connectivity...");
        const timeoutPromise = new Promise(
          (_, reject) => setTimeout(() => reject(new Error("Connectivity test timeout")), 5e3)
        );
        const initPayload = {
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: { roots: { listChanged: true } },
            clientInfo: { name: "figmalint", version: "2.0.0" }
          }
        };
        if (!this.config.mcpServerUrl) {
          throw new Error("MCP server URL not configured");
        }
        const fetchPromise = fetch(this.config.mcpServerUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(initPayload)
        });
        const response = await Promise.race([fetchPromise, timeoutPromise]);
        if (response.ok) {
          const data = await response.json();
          if ((_b = (_a = data.result) == null ? void 0 : _a.serverInfo) == null ? void 0 : _b.name) {
            console.log(`\u2705 MCP server accessible: ${data.result.serverInfo.name}`);
            return true;
          }
        }
        console.warn(`\u26A0\uFE0F MCP server returned ${response.status}`);
        return false;
      } catch (error) {
        console.warn("\u26A0\uFE0F MCP server connectivity test failed:", error);
        return false;
      }
    }
    /**
     * Query the design systems MCP server using proper JSON-RPC protocol
     */
    async queryMCP(query) {
      try {
        console.log(`\u{1F50D} Querying MCP for: "${query}"`);
        const timeoutPromise = new Promise(
          (_, reject) => setTimeout(() => reject(new Error("MCP query timeout")), 5e3)
        );
        if (!this.config.mcpServerUrl) {
          throw new Error("MCP server URL not configured");
        }
        const searchPayload = {
          jsonrpc: "2.0",
          id: Math.floor(Math.random() * 1e3) + 2,
          // Random ID > 1 (1 is used for init)
          method: "tools/call",
          params: {
            name: "search_design_knowledge",
            arguments: {
              query,
              limit: 5,
              category: "components"
            }
          }
        };
        const fetchPromise = fetch(this.config.mcpServerUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(searchPayload)
        });
        const response = await Promise.race([fetchPromise, timeoutPromise]);
        if (!response.ok) {
          throw new Error(`MCP query failed: ${response.status} ${response.statusText}`);
        }
        const result = await response.json();
        console.log(`\u2705 MCP query successful for: "${query}"`);
        if (result.result && result.result.content) {
          return {
            results: result.result.content.map((item) => ({
              title: item.title || "Design System Knowledge",
              content: item.content || item.description || "Knowledge content",
              category: "design-systems"
            }))
          };
        }
        return { results: [] };
      } catch (error) {
        console.warn(`\u26A0\uFE0F MCP query failed for "${query}":`, error);
        return this.getFallbackKnowledgeForQuery(query);
      }
    }
    /**
     * Create deterministic analysis prompt with MCP knowledge
     */
    createDeterministicPrompt(context) {
      const basePrompt = this.createBasePrompt(context);
      const mcpGuidance = this.getMCPGuidance(context);
      const scoringCriteria = this.getScoringCriteria(context);
      return `${basePrompt}

**CONSISTENCY REQUIREMENTS:**
- Use DETERMINISTIC analysis based on the exact component structure provided
- Apply CONSISTENT scoring criteria for identical components
- Follow established design system patterns and conventions
- Provide REPRODUCIBLE results for the same input

**DESIGN SYSTEMS GUIDANCE:**
${mcpGuidance}

**SCORING METHODOLOGY:**
${scoringCriteria}

**DETERMINISTIC SETTINGS:**
- Analysis must be based solely on the provided component structure
- Scores must be calculated using objective criteria
- Recommendations must follow established design system patterns
- Response format must be exactly as specified (JSON only)

**RESPONSE FORMAT (JSON only - no explanatory text):**
{
  "component": "Component name and purpose",
  "description": "Detailed component description based on structure analysis",
  "score": {
    "overall": 85,
    "breakdown": {
      "structure": 90,
      "tokens": 80,
      "accessibility": 85,
      "consistency": 90
    }
  },
  "props": [...],
  "states": [...],
  "slots": [...],
  "variants": {...},
  "usage": "Usage guidelines",
  "accessibility": {...},
  "tokens": {...},
  "audit": {...},
  "mcpReadiness": {...}
}`;
    }
    /**
     * Validate analysis result for consistency
     */
    validateAnalysisConsistency(result, context) {
      var _a, _b, _c, _d, _e;
      const issues = [];
      if (!((_a = result.metadata) == null ? void 0 : _a.component)) issues.push("Missing component name");
      if (!((_b = result.metadata) == null ? void 0 : _b.description)) issues.push("Missing component description");
      if (!this.isValidScore((_d = (_c = result.metadata) == null ? void 0 : _c.mcpReadiness) == null ? void 0 : _d.score)) {
        issues.push("Invalid or missing MCP readiness score");
      }
      const family = (_e = context.additionalContext) == null ? void 0 : _e.componentFamily;
      if (family && !this.validateComponentFamilyConsistency(result, family)) {
        issues.push(`Inconsistent analysis for ${family} component family`);
      }
      if (!this.validateTokenRecommendations(result.tokens)) {
        issues.push("Inconsistent token recommendations");
      }
      if (issues.length > 0) {
        console.warn("\u26A0\uFE0F Analysis consistency issues found:", issues);
        return false;
      }
      return true;
    }
    /**
     * Apply consistency corrections to analysis result
     */
    applyConsistencyCorrections(result, context) {
      var _a;
      const corrected = __spreadValues({}, result);
      if ((_a = context.additionalContext) == null ? void 0 : _a.componentFamily) {
        corrected.metadata = this.applyComponentFamilyCorrections(
          corrected.metadata,
          context.additionalContext.componentFamily
        );
      }
      corrected.tokens = this.applyTokenConsistencyCorrections(corrected.tokens);
      corrected.metadata.mcpReadiness = this.ensureConsistentScoring(
        corrected.metadata.mcpReadiness || {},
        context
      );
      return corrected;
    }
    // Private helper methods
    normalizeHierarchy(hierarchy) {
      return hierarchy.map((item) => ({
        name: item.name.toLowerCase().trim(),
        type: item.type,
        depth: item.depth
      }));
    }
    generateTokenFingerprint(tokens) {
      const fingerprint = tokens.map((token) => `${token.type}:${token.isToken}:${token.source}`).sort().join("|");
      return this.createHash(fingerprint);
    }
    createHash(input) {
      let hash = 0;
      if (input.length === 0) return hash.toString();
      for (let i = 0; i < input.length; i++) {
        const char = input.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
      }
      return Math.abs(hash).toString(36);
    }
    createBasePrompt(context) {
      var _a, _b, _c, _d;
      return `You are an expert design system architect analyzing a Figma component for comprehensive metadata and design token recommendations.

**Component Analysis Context:**
- Component Name: ${context.name}
- Component Type: ${context.type}
- Layer Structure: ${JSON.stringify(context.hierarchy, null, 2)}
- Frame Structure: ${JSON.stringify(context.frameStructure)}
- Detected Styles: ${JSON.stringify(context.detectedStyles)}
- Component Family: ${((_a = context.additionalContext) == null ? void 0 : _a.componentFamily) || "generic"}
- Interactive Elements: ${((_b = context.additionalContext) == null ? void 0 : _b.hasInteractiveElements) || false}
- Design Patterns: ${((_d = (_c = context.additionalContext) == null ? void 0 : _c.designPatterns) == null ? void 0 : _d.join(", ")) || "none"}`;
    }
    getMCPGuidance(context) {
      var _a;
      if (!this.designSystemsKnowledge) {
        return this.getFallbackGuidance(context);
      }
      const family = ((_a = context.additionalContext) == null ? void 0 : _a.componentFamily) || "generic";
      const guidance = this.designSystemsKnowledge.components[family] || this.designSystemsKnowledge.components.generic;
      return guidance || this.getFallbackGuidance(context);
    }
    getScoringCriteria(context) {
      var _a;
      if (!((_a = this.designSystemsKnowledge) == null ? void 0 : _a.scoring)) {
        return this.getFallbackScoringCriteria();
      }
      return this.designSystemsKnowledge.scoring;
    }
    processComponentKnowledge(knowledge) {
      if (!knowledge || !knowledge.results || !Array.isArray(knowledge.results)) {
        console.log("\u{1F4DD} No component knowledge available, using defaults");
        return this.getDefaultComponentKnowledge();
      }
      const processed = {};
      knowledge.results.forEach((result) => {
        if (result.title && result.content) {
          const componentType = this.extractComponentType(result.title);
          processed[componentType] = result.content;
        }
      });
      const defaults = this.getDefaultComponentKnowledge();
      return __spreadValues(__spreadValues({}, defaults), processed);
    }
    extractComponentType(title) {
      const titleLower = title.toLowerCase();
      if (titleLower.includes("button")) return "button";
      if (titleLower.includes("avatar")) return "avatar";
      if (titleLower.includes("input") || titleLower.includes("field")) return "input";
      if (titleLower.includes("card")) return "card";
      if (titleLower.includes("badge") || titleLower.includes("tag")) return "badge";
      return "generic";
    }
    processKnowledgeContent(knowledge) {
      if (!knowledge || !knowledge.results || !Array.isArray(knowledge.results)) {
        return "";
      }
      return knowledge.results.map((result) => result.content).filter((content) => content).join("\n\n");
    }
    getDefaultComponentKnowledge() {
      return {
        button: "Button components require comprehensive state management (default, hover, focus, active, disabled). Score based on state completeness (40%), semantic token usage (30%), accessibility (20%), and naming consistency (10%).",
        avatar: "Avatar components should support multiple sizes and states. Interactive avatars need hover/focus states. Score based on size variants (25%), state coverage (25%), image handling (25%), and fallback mechanisms (25%).",
        card: "Card components need consistent spacing, proper content hierarchy, and optional interactive states. Score based on content structure (30%), spacing consistency (25%), optional interactivity (25%), and token usage (20%).",
        badge: "Badge components are typically status indicators with semantic color usage. Score based on semantic color mapping (40%), size variants (30%), content clarity (20%), and accessibility (10%).",
        input: "Form input components require comprehensive state management and accessibility. Score based on state completeness (35%), accessibility compliance (30%), validation feedback (20%), and token usage (15%).",
        icon: "Icon components should be scalable and consistent. Score based on sizing flexibility (30%), accessibility (30%), semantic naming (25%), and style consistency (15%).",
        generic: "Generic components should follow basic design system principles. Score based on structure clarity (25%), token usage (25%), naming consistency (25%), and accessibility basics (25%)."
      };
    }
    getFallbackKnowledgeForQuery(query) {
      return {
        results: [
          {
            title: `Fallback guidance for ${query}`,
            content: this.getFallbackContentForQuery(query),
            category: "fallback"
          }
        ]
      };
    }
    getFallbackContentForQuery(query) {
      if (query.includes("component analysis")) {
        return "Components should follow consistent naming, use design tokens, implement proper states, and maintain accessibility standards.";
      }
      if (query.includes("token")) {
        return "Design tokens should use semantic naming patterns like semantic-color-primary, spacing-md-16px, and text-size-lg-18px.";
      }
      if (query.includes("accessibility")) {
        return "Ensure WCAG 2.1 AA compliance with proper ARIA labels, keyboard support, and color contrast.";
      }
      if (query.includes("scoring")) {
        return "Score components based on structure (25%), token usage (25%), accessibility (25%), and consistency (25%).";
      }
      return "Follow established design system best practices for consistency and scalability.";
    }
    getFallbackGuidance(context) {
      var _a;
      const family = ((_a = context.additionalContext) == null ? void 0 : _a.componentFamily) || "generic";
      const guidanceMap = {
        button: "Buttons require all interactive states (default, hover, focus, active, disabled). Score based on state completeness (40%), semantic token usage (30%), accessibility (20%), and naming consistency (10%).",
        avatar: "Avatars should support multiple sizes and states. Interactive avatars need hover/focus states. Score based on size variants (25%), state coverage (25%), image handling (25%), and fallback mechanisms (25%).",
        card: "Cards need consistent spacing, proper content hierarchy, and optional interactive states. Score based on content structure (30%), spacing consistency (25%), optional interactivity (25%), and token usage (20%).",
        badge: "Badges are typically status indicators with semantic color usage. Score based on semantic color mapping (40%), size variants (30%), content clarity (20%), and accessibility (10%).",
        input: "Form inputs require comprehensive state management and accessibility. Score based on state completeness (35%), accessibility compliance (30%), validation feedback (20%), and token usage (15%).",
        generic: "Generic components should follow basic design system principles. Score based on structure clarity (25%), token usage (25%), naming consistency (25%), and accessibility basics (25%)."
      };
      return guidanceMap[family] || guidanceMap.generic;
    }
    getFallbackScoringCriteria() {
      return `
    **MCP Readiness Scoring (0-100):**
    - **Structure (25%)**: Clear hierarchy, logical organization, proper nesting
    - **Tokens (25%)**: Design token usage vs hard-coded values
    - **Accessibility (25%)**: WCAG compliance, keyboard support, ARIA labels
    - **Consistency (25%)**: Naming conventions, pattern adherence, scalability

    **Score Calculation:**
    - 90-100: Production ready, comprehensive implementation
    - 80-89: Good implementation, minor improvements needed
    - 70-79: Solid foundation, some important gaps
    - 60-69: Basic implementation, significant improvements needed
    - Below 60: Major issues, substantial rework required
    `;
    }
    loadFallbackKnowledge() {
      this.designSystemsKnowledge = {
        version: "1.0.0-fallback",
        components: {
          button: "Button components require comprehensive state management",
          avatar: "Avatar components should support size variants and interactive states",
          card: "Card components need consistent spacing and content hierarchy",
          badge: "Badge components should use semantic colors for status indication",
          input: "Input components require comprehensive accessibility and validation",
          generic: "Generic components should follow basic design system principles"
        },
        tokens: "Use semantic token naming: semantic-color-primary, spacing-md-16px, text-size-lg-18px",
        accessibility: "Ensure WCAG 2.1 AA compliance with proper ARIA labels and keyboard support",
        scoring: this.getFallbackScoringCriteria(),
        lastUpdated: Date.now()
      };
    }
    isValidScore(score) {
      return typeof score === "number" && score >= 0 && score <= 100;
    }
    validateComponentFamilyConsistency(result, family) {
      const metadata = result.metadata;
      switch (family) {
        case "button":
          return this.validateButtonComponent(metadata);
        case "avatar":
          return this.validateAvatarComponent(metadata);
        case "input":
          return this.validateInputComponent(metadata);
        default:
          return true;
      }
    }
    validateButtonComponent(metadata) {
      var _a;
      const hasInteractiveStates = (_a = metadata.states) == null ? void 0 : _a.some(
        (state) => ["hover", "focus", "active", "disabled"].includes(state.toLowerCase())
      );
      return hasInteractiveStates || false;
    }
    validateAvatarComponent(metadata) {
      var _a, _b, _c;
      const hasSizeVariants = ((_b = (_a = metadata.variants) == null ? void 0 : _a.size) == null ? void 0 : _b.length) > 0;
      const hasSizeProps = (_c = metadata.props) == null ? void 0 : _c.some(
        (prop) => prop.name.toLowerCase().includes("size")
      );
      return hasSizeVariants || hasSizeProps || false;
    }
    validateInputComponent(metadata) {
      var _a;
      const hasFormStates = (_a = metadata.states) == null ? void 0 : _a.some(
        (state) => ["focus", "error", "disabled", "filled"].includes(state.toLowerCase())
      );
      return hasFormStates || false;
    }
    validateTokenRecommendations(tokens) {
      var _a;
      const hasSemanticColors = (_a = tokens.colors) == null ? void 0 : _a.some(
        (token) => token.name.includes("semantic-") || token.name.includes("primary") || token.name.includes("secondary")
      );
      return hasSemanticColors !== false;
    }
    applyComponentFamilyCorrections(metadata, family) {
      var _a, _b, _c;
      const corrected = __spreadValues({}, metadata);
      switch (family) {
        case "button":
          if (!((_a = corrected.states) == null ? void 0 : _a.includes("hover"))) {
            corrected.states = [...corrected.states || [], "hover", "focus", "active", "disabled"];
          }
          break;
        case "avatar":
          if (!((_b = corrected.variants) == null ? void 0 : _b.size) && !((_c = corrected.props) == null ? void 0 : _c.some((p) => p.name.includes("size")))) {
            corrected.variants = __spreadProps(__spreadValues({}, corrected.variants), { size: ["small", "medium", "large"] });
          }
          break;
      }
      return corrected;
    }
    applyTokenConsistencyCorrections(tokens) {
      if (!tokens) return tokens;
      const corrected = __spreadValues({}, tokens);
      return corrected;
    }
    ensureConsistentScoring(mcpReadiness, context) {
      var _a;
      const family = ((_a = context.additionalContext) == null ? void 0 : _a.componentFamily) || "generic";
      const baselineScores = {
        button: { structure: 85, tokens: 80, accessibility: 90, consistency: 85 },
        avatar: { structure: 90, tokens: 75, accessibility: 85, consistency: 80 },
        input: { structure: 85, tokens: 85, accessibility: 95, consistency: 90 },
        generic: { structure: 80, tokens: 75, accessibility: 80, consistency: 75 }
      };
      const baseline = baselineScores[family] || baselineScores.generic;
      return __spreadProps(__spreadValues({}, mcpReadiness), {
        score: mcpReadiness.score || Math.round((baseline.structure + baseline.tokens + baseline.accessibility + baseline.consistency) / 4),
        baseline
      });
    }
  };
  var consistency_engine_default = ComponentConsistencyEngine;

  // src/ui/message-handler.ts
  var storedApiKey = null;
  var selectedModel = "claude-3-sonnet-20240229";
  var consistencyEngine = new consistency_engine_default({
    enableCaching: true,
    enableMCPIntegration: true,
    mcpServerUrl: "https://design-systems-mcp.southleft-llc.workers.dev/mcp"
  });
  async function handleUIMessage(msg) {
    const { type, data } = msg;
    console.log("Received message:", type, data);
    try {
      switch (type) {
        case "check-api-key":
          await handleCheckApiKey();
          break;
        case "save-api-key":
          await handleSaveApiKey(data.apiKey, data.model);
          break;
        case "update-model":
          await handleUpdateModel(data.model);
          break;
        case "analyze":
          await handleAnalyzeComponent();
          break;
        case "analyze-enhanced":
          await handleEnhancedAnalyze(data);
          break;
        case "clear-api-key":
          await handleClearApiKey();
          break;
        case "chat-message":
          await handleChatMessage(data);
          break;
        case "chat-clear-history":
          await handleClearChatHistory();
          break;
        default:
          console.warn("Unknown message type:", type);
      }
    } catch (error) {
      console.error("Error handling message:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      sendMessageToUI("analysis-error", { error: errorMessage });
    }
  }
  async function handleCheckApiKey() {
    try {
      if (storedApiKey) {
        sendMessageToUI("api-key-status", { hasKey: true });
        return;
      }
      const savedKey = await figma.clientStorage.getAsync("claude-api-key");
      if (savedKey && isValidApiKeyFormat(savedKey)) {
        storedApiKey = savedKey;
        sendMessageToUI("api-key-status", { hasKey: true });
      } else {
        sendMessageToUI("api-key-status", { hasKey: false });
      }
    } catch (error) {
      console.error("Error checking API key:", error);
      sendMessageToUI("api-key-status", { hasKey: false });
    }
  }
  async function handleSaveApiKey(apiKey, model) {
    try {
      if (!isValidApiKeyFormat(apiKey)) {
        throw new Error("Invalid API key format. Please check your Claude API key.");
      }
      storedApiKey = apiKey;
      if (model) {
        selectedModel = model;
        await figma.clientStorage.setAsync("claude-model", model);
      }
      await figma.clientStorage.setAsync("claude-api-key", apiKey);
      console.log("API key and model saved successfully");
      sendMessageToUI("api-key-saved", { success: true });
      figma.notify("API key and model saved successfully", { timeout: 2e3 });
    } catch (error) {
      console.error("Error saving API key:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      sendMessageToUI("api-key-saved", { success: false, error: errorMessage });
      figma.notify(`Failed to save API key: ${errorMessage}`, { error: true });
    }
  }
  async function handleUpdateModel(model) {
    try {
      selectedModel = model;
      await figma.clientStorage.setAsync("claude-model", model);
      console.log("Model updated to:", model);
      figma.notify(`Model updated to ${model}`, { timeout: 2e3 });
    } catch (error) {
      console.error("Error updating model:", error);
      figma.notify("Failed to update model", { error: true });
    }
  }
  async function handleEnhancedAnalyze(options) {
    var _a;
    try {
      if (!storedApiKey) {
        throw new Error("API key not found. Please save your Claude API key first.");
      }
      const selection = figma.currentPage.selection;
      if (selection.length === 0) {
        throw new Error("No component selected. Please select a Figma component to analyze.");
      }
      if (options.batchMode && selection.length > 1) {
        await handleBatchAnalysis(selection, options);
        return;
      }
      let selectedNode = selection[0];
      const originalSelectedNode = selectedNode;
      if (selectedNode.type === "INSTANCE") {
        const instance = selectedNode;
        if (instance.mainComponent) {
          figma.notify("Analyzing main component instead of instance...", { timeout: 2e3 });
          selectedNode = instance.mainComponent;
        } else {
          throw new Error("This instance has no main component. Please select a component directly.");
        }
      }
      if (selectedNode.type === "COMPONENT" && ((_a = selectedNode.parent) == null ? void 0 : _a.type) === "COMPONENT_SET") {
        const component = selectedNode;
        const parentComponentSet = component.parent;
        figma.notify("Analyzing parent component set to include all variants...", { timeout: 2e3 });
        selectedNode = parentComponentSet;
      }
      if (!isValidNodeForAnalysis(selectedNode)) {
        throw new Error("Please select a Frame, Component, Component Set, or Instance to analyze");
      }
      await consistencyEngine.loadDesignSystemsKnowledge();
      const componentContext = extractComponentContext(selectedNode);
      const tokenAnalysis = await extractDesignTokensFromNode(selectedNode);
      const allTokens = [
        ...tokenAnalysis.colors,
        ...tokenAnalysis.spacing,
        ...tokenAnalysis.typography,
        ...tokenAnalysis.effects,
        ...tokenAnalysis.borders
      ];
      const componentHash = consistencyEngine.generateComponentHash(componentContext, allTokens);
      console.log("\u{1F50D} Component hash generated:", componentHash);
      const cachedAnalysis = consistencyEngine.getCachedAnalysis(componentHash);
      if (cachedAnalysis) {
        console.log("\u2705 Using cached analysis for consistent results");
        figma.notify("Using cached analysis for consistent results", { timeout: 2e3 });
        globalThis.lastAnalyzedMetadata = cachedAnalysis.result.metadata;
        globalThis.lastAnalyzedNode = selectedNode;
        sendMessageToUI("enhanced-analysis-result", cachedAnalysis.result);
        return;
      }
      const deterministicPrompt = consistencyEngine.createDeterministicPrompt(componentContext);
      figma.notify("Performing enhanced analysis with design systems knowledge...", { timeout: 3e3 });
      const analysis = await fetchClaude(deterministicPrompt, storedApiKey, selectedModel, true);
      const enhancedData = extractJSONFromResponse(analysis);
      let result = await processEnhancedAnalysis(enhancedData, selectedNode, originalSelectedNode);
      const isConsistent = consistencyEngine.validateAnalysisConsistency(result, componentContext);
      if (!isConsistent) {
        console.log("\u26A0\uFE0F Applying consistency corrections...");
        result = consistencyEngine.applyConsistencyCorrections(result, componentContext);
        figma.notify("Applied consistency corrections to analysis", { timeout: 2e3 });
      }
      consistencyEngine.cacheAnalysis(componentHash, result);
      globalThis.lastAnalyzedMetadata = result.metadata;
      globalThis.lastAnalyzedNode = selectedNode;
      sendMessageToUI("enhanced-analysis-result", result);
      figma.notify("Enhanced analysis complete! Results cached for consistency.", { timeout: 3e3 });
    } catch (error) {
      console.error("Error during enhanced analysis:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      figma.notify(`Analysis failed: ${errorMessage}`, { error: true });
      sendMessageToUI("analysis-error", { error: errorMessage });
    }
  }
  async function handleAnalyzeComponent() {
    await handleEnhancedAnalyze({ batchMode: false });
  }
  async function handleBatchAnalysis(nodes, _options) {
    const results = [];
    await consistencyEngine.loadDesignSystemsKnowledge();
    for (const node of nodes) {
      if (isValidNodeForAnalysis(node)) {
        try {
          const componentContext = extractComponentContext(node);
          const tokenAnalysis = await extractDesignTokensFromNode(node);
          const allTokens = [
            ...tokenAnalysis.colors,
            ...tokenAnalysis.spacing,
            ...tokenAnalysis.typography,
            ...tokenAnalysis.effects,
            ...tokenAnalysis.borders
          ];
          const componentHash = consistencyEngine.generateComponentHash(componentContext, allTokens);
          const cachedAnalysis = consistencyEngine.getCachedAnalysis(componentHash);
          if (cachedAnalysis) {
            console.log(`\u2705 Using cached analysis for ${node.name}`);
            results.push({
              node: node.name,
              success: true,
              data: cachedAnalysis.result.metadata,
              cached: true
            });
            continue;
          }
          const deterministicPrompt = consistencyEngine.createDeterministicPrompt(componentContext);
          const analysis = await fetchClaude(deterministicPrompt, storedApiKey, selectedModel, true);
          const enhancedData = extractJSONFromResponse(analysis);
          let result = await processEnhancedAnalysis(enhancedData, node, node);
          const isConsistent = consistencyEngine.validateAnalysisConsistency(result, componentContext);
          if (!isConsistent) {
            result = consistencyEngine.applyConsistencyCorrections(result, componentContext);
          }
          consistencyEngine.cacheAnalysis(componentHash, result);
          results.push({
            node: node.name,
            success: true,
            data: result.metadata,
            cached: false
          });
        } catch (error) {
          results.push({
            node: node.name,
            success: false,
            error: error instanceof Error ? error.message : "Analysis failed"
          });
        }
      }
    }
    const cachedCount = results.filter((r) => r.success && r.cached).length;
    const analyzedCount = results.filter((r) => r.success && !r.cached).length;
    sendMessageToUI("batch-analysis-result", { results });
    figma.notify(`Batch analysis complete: ${analyzedCount} analyzed, ${cachedCount} from cache`, { timeout: 3e3 });
  }
  async function handleClearApiKey() {
    try {
      storedApiKey = null;
      await figma.clientStorage.setAsync("claude-api-key", "");
      sendMessageToUI("api-key-cleared", { success: true });
      figma.notify("API key cleared", { timeout: 2e3 });
    } catch (error) {
      console.error("Error clearing API key:", error);
    }
  }
  async function handleChatMessage(data) {
    try {
      console.log("Processing chat message:", data.message);
      if (!storedApiKey) {
        throw new Error("API key not found. Please save your Claude API key first.");
      }
      sendMessageToUI("chat-response-loading", { isLoading: true });
      const componentContext = getCurrentComponentContext();
      const mcpResponse = await queryDesignSystemsMCP(data.message);
      const enhancedPrompt = createChatPromptWithContext(data.message, mcpResponse, data.history, componentContext);
      const response = await fetchClaude(enhancedPrompt, storedApiKey, selectedModel, false);
      const chatResponse = {
        message: response,
        sources: mcpResponse.sources || []
      };
      sendMessageToUI("chat-response", { response: chatResponse });
    } catch (error) {
      console.error("Error handling chat message:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      sendMessageToUI("chat-error", { error: errorMessage });
    }
  }
  async function handleClearChatHistory() {
    try {
      sendMessageToUI("chat-history-cleared", { success: true });
      figma.notify("Chat history cleared", { timeout: 2e3 });
    } catch (error) {
      console.error("Error clearing chat history:", error);
    }
  }
  async function queryDesignSystemsMCP(query) {
    var _a;
    try {
      console.log("\u{1F50D} Querying MCP for chat:", query);
      const mcpServerUrl = ((_a = consistencyEngine["config"]) == null ? void 0 : _a.mcpServerUrl) || "https://design-systems-mcp.southleft-llc.workers.dev/mcp";
      const searchPromises = [
        // General design knowledge search
        searchMCPKnowledge(mcpServerUrl, query, { category: "general", limit: 3 }),
        // Component-specific search if the query mentions components
        query.toLowerCase().includes("component") ? searchMCPKnowledge(mcpServerUrl, query, { category: "components", limit: 2 }) : Promise.resolve({ results: [] }),
        // Token-specific search if the query mentions tokens/design tokens
        query.toLowerCase().includes("token") || query.toLowerCase().includes("design token") ? searchMCPKnowledge(mcpServerUrl, query, { category: "tokens", limit: 2 }) : Promise.resolve({ results: [] })
      ];
      const results = await Promise.allSettled(searchPromises);
      const allSources = [];
      results.forEach((result) => {
        if (result.status === "fulfilled" && result.value.results) {
          allSources.push(...result.value.results);
        }
      });
      console.log(`\u2705 Found ${allSources.length} relevant sources for chat query`);
      return { sources: allSources.slice(0, 5) };
    } catch (error) {
      console.warn("\u26A0\uFE0F MCP query failed for chat:", error);
      return { sources: [] };
    }
  }
  async function searchMCPKnowledge(serverUrl, query, options = {}) {
    const searchPayload = {
      jsonrpc: "2.0",
      id: Math.floor(Math.random() * 1e3) + 100,
      method: "tools/call",
      params: {
        name: "search_design_knowledge",
        arguments: __spreadValues({
          query,
          limit: options.limit || 5
        }, options.category && { category: options.category })
      }
    };
    const response = await fetch(serverUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(searchPayload)
    });
    if (!response.ok) {
      throw new Error(`MCP search failed: ${response.status}`);
    }
    const result = await response.json();
    if (result.result && result.result.content) {
      return {
        results: result.result.content.map((item) => ({
          title: item.title || "Design System Knowledge",
          content: item.content || item.description || "",
          category: item.category || "general"
        }))
      };
    }
    return { results: [] };
  }
  function getCurrentComponentContext() {
    try {
      const lastMetadata = globalThis.lastAnalyzedMetadata;
      const lastNode = globalThis.lastAnalyzedNode;
      if (!lastMetadata && !lastNode) {
        return null;
      }
      const context = {
        hasCurrentComponent: true,
        timestamp: Date.now()
      };
      if (lastNode) {
        context.component = {
          name: lastNode.name,
          type: lastNode.type,
          id: lastNode.id
        };
        const selection = figma.currentPage.selection;
        if (selection.length > 0) {
          context.selection = {
            count: selection.length,
            types: selection.map((node) => node.type),
            names: selection.map((node) => node.name)
          };
        }
      }
      if (lastMetadata) {
        context.analysis = {
          component: lastMetadata.component,
          description: lastMetadata.description,
          props: lastMetadata.props || [],
          states: lastMetadata.states || [],
          accessibility: lastMetadata.accessibility,
          audit: lastMetadata.audit,
          mcpReadiness: lastMetadata.mcpReadiness
        };
      }
      return context;
    } catch (error) {
      console.warn("Failed to get component context:", error);
      return null;
    }
  }
  function createChatPromptWithContext(userMessage, mcpResponse, history, componentContext) {
    let conversationContext = "";
    if (history.length > 0) {
      conversationContext = "\n**Previous Conversation:**\n";
      const recentMessages = history.slice(-6);
      recentMessages.forEach((msg) => {
        conversationContext += `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}
`;
      });
      conversationContext += "\n";
    }
    let currentComponentContext = "";
    if (componentContext && componentContext.hasCurrentComponent) {
      currentComponentContext = "\n**Current Component Context:**\n";
      if (componentContext.component) {
        currentComponentContext += `- Currently analyzing: ${componentContext.component.name} (${componentContext.component.type})
`;
      }
      if (componentContext.selection) {
        currentComponentContext += `- Selected: ${componentContext.selection.count} item(s) - ${componentContext.selection.names.join(", ")}
`;
      }
      if (componentContext.analysis) {
        currentComponentContext += `- Component: ${componentContext.analysis.component}
`;
        currentComponentContext += `- Description: ${componentContext.analysis.description}
`;
        if (componentContext.analysis.props && componentContext.analysis.props.length > 0) {
          currentComponentContext += `- Properties: ${componentContext.analysis.props.map((p) => typeof p === "string" ? p : p.name).join(", ")}
`;
        }
        if (componentContext.analysis.states && componentContext.analysis.states.length > 0) {
          currentComponentContext += `- States: ${componentContext.analysis.states.join(", ")}
`;
        }
        if (componentContext.analysis.audit) {
          const issues = [
            ...componentContext.analysis.audit.accessibilityIssues || [],
            ...componentContext.analysis.audit.namingIssues || [],
            ...componentContext.analysis.audit.consistencyIssues || []
          ];
          if (issues.length > 0) {
            currentComponentContext += `- Current Issues: ${issues.slice(0, 3).join("; ")}${issues.length > 3 ? "..." : ""}
`;
          }
        }
        if (componentContext.analysis.mcpReadiness) {
          currentComponentContext += `- MCP Readiness Score: ${componentContext.analysis.mcpReadiness.score || "Not scored"}
`;
        }
      }
      currentComponentContext += "\n";
    }
    let knowledgeContext = "";
    if (mcpResponse.sources && mcpResponse.sources.length > 0) {
      knowledgeContext = "\n**Relevant Design Systems Knowledge:**\n";
      mcpResponse.sources.forEach((source, index) => {
        knowledgeContext += `
${index + 1}. **${source.title}** (${source.category})
${source.content}
`;
      });
      knowledgeContext += "\n";
    }
    const hasComponentContext = componentContext && componentContext.hasCurrentComponent;
    return `You are a specialized design systems assistant with access to comprehensive design systems knowledge. You're helping a user with their Figma plugin for design system analysis.

${conversationContext}**Current User Question:** ${userMessage}

${currentComponentContext}${knowledgeContext}**Instructions:**
1. ${hasComponentContext ? "The user is currently working on a specific component in Figma. Use the component context above to provide specific, actionable advice about their current work." : "Provide helpful, accurate answers based on the design systems knowledge provided"}
2. ${hasComponentContext ? 'If they ask about "this component" or "my component", refer to the current component context provided above' : "If you need context about a specific component, suggest they select and analyze a component first"}
3. Be conversational and practical in your responses
4. When discussing components, tokens, or patterns, provide specific guidance
5. If referencing the knowledge sources, mention them naturally in your response
6. Keep responses focused and actionable
7. If the user is asking about Figma-specific functionality, provide relevant plugin or design workflow advice
8. ${hasComponentContext ? "Help them improve their current component by addressing any issues mentioned in the analysis context" : "Provide general design systems guidance"}

${hasComponentContext ? "Since you have context about their current component, prioritize advice that directly applies to what they're working on." : "If the user wants component-specific advice, suggest they select and analyze a component in Figma first."}

Respond naturally and helpfully to the user's question.`;
  }
  async function initializePlugin() {
    try {
      const savedApiKey = await figma.clientStorage.getAsync("claude-api-key");
      if (savedApiKey) {
        storedApiKey = savedApiKey;
        sendMessageToUI("api-key-status", { hasKey: true });
      }
      const savedModel = await figma.clientStorage.getAsync("claude-model");
      if (savedModel) {
        selectedModel = savedModel;
        console.log("Loaded saved model:", selectedModel);
      }
      console.log("\u{1F504} Initializing design systems knowledge...");
      consistencyEngine.loadDesignSystemsKnowledge().then(() => {
        console.log("\u2705 Design systems knowledge loaded successfully");
      }).catch((error) => {
        console.warn("\u26A0\uFE0F Failed to load design systems knowledge, using fallback:", error);
      });
      console.log("Plugin initialized successfully");
    } catch (error) {
      console.error("Error initializing plugin:", error);
    }
  }

  // src/code.ts
  var PLUGIN_WINDOW_SIZE = { width: 400, height: 700 };
  try {
    figma.showUI(__html__, PLUGIN_WINDOW_SIZE);
    console.log("\u2705 FigmaLint v2.0 - UI shown successfully");
  } catch (error) {
    console.log("\u2139\uFE0F UI might already be shown in inspect panel:", error);
  }
  figma.ui.onmessage = handleUIMessage;
  initializePlugin();
  console.log("\u{1F680} FigmaLint v2.0 initialized with modular architecture");
})();
