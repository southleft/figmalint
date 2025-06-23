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
      try {
        const componentSet = node;
        componentSet.variantGroupProperties;
        return true;
      } catch (error) {
        console.warn("Component set has errors, skipping:", error);
        return false;
      }
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
  function getVariableName(variableId) {
    try {
      const variable = figma.variables.getVariableById(variableId);
      return variable ? variable.name : null;
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
        if (boundVars.fills) {
          try {
            const variables = Array.isArray(boundVars.fills) ? boundVars.fills : [boundVars.fills];
            variables.forEach((v) => {
              if ((v == null ? void 0 : v.id) && typeof v.id === "string") {
                const varName = getVariableName(v.id);
                if (varName && !colorSet.has(varName)) {
                  colorSet.add(varName);
                  colors.push({
                    name: varName,
                    value: varName,
                    type: "fills-variable",
                    isToken: true,
                    isActualToken: true,
                    source: "figma-variable"
                  });
                }
              }
            });
          } catch (error) {
            console.warn("Error processing fills variables:", error);
          }
        }
        if (boundVars.strokes) {
          try {
            const variables = Array.isArray(boundVars.strokes) ? boundVars.strokes : [boundVars.strokes];
            variables.forEach((v) => {
              if ((v == null ? void 0 : v.id) && typeof v.id === "string") {
                const varName = getVariableName(v.id);
                if (varName && !colorSet.has(varName)) {
                  colorSet.add(varName);
                  colors.push({
                    name: varName,
                    value: varName,
                    type: "strokes-variable",
                    isToken: true,
                    isActualToken: true,
                    source: "figma-variable"
                  });
                }
              }
            });
          } catch (error) {
            console.warn("Error processing strokes variables:", error);
          }
        }
        const spacingProps = ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "itemSpacing"];
        spacingProps.forEach((prop) => {
          const variable = boundVars[prop];
          if (variable && typeof variable === "object" && "id" in variable && typeof variable.id === "string") {
            const varName = getVariableName(variable.id);
            if (varName && !spacingSet.has(varName)) {
              spacingSet.add(varName);
              spacing.push({
                name: varName,
                value: varName,
                type: `${prop}-variable`,
                isToken: true,
                isActualToken: true,
                source: "figma-variable"
              });
            }
          }
        });
      }
      if ("fills" in currentNode && Array.isArray(currentNode.fills) && !currentNode.fillStyleId) {
        currentNode.fills.forEach((fill) => {
          if (fill.type === "SOLID" && fill.visible !== false && fill.color) {
            const hex = rgbToHex(fill.color.r, fill.color.g, fill.color.b);
            if (!colorSet.has(hex)) {
              colorSet.add(hex);
              colors.push({
                name: `hard-coded-fill-${colors.length + 1}`,
                value: hex,
                type: "fill",
                isToken: false,
                source: "hard-coded"
              });
            }
          }
        });
      }
      if ("strokes" in currentNode && Array.isArray(currentNode.strokes) && !currentNode.strokeStyleId) {
        currentNode.strokes.forEach((stroke) => {
          if (stroke.type === "SOLID" && stroke.visible !== false && stroke.color) {
            const hex = rgbToHex(stroke.color.r, stroke.color.g, stroke.color.b);
            if (!colorSet.has(hex)) {
              colorSet.add(hex);
              colors.push({
                name: `hard-coded-stroke-${colors.length + 1}`,
                value: hex,
                type: "stroke",
                isToken: false,
                source: "hard-coded",
                context: {
                  nodeType: currentNode.type,
                  nodeName: currentNode.name
                }
              });
            }
          }
        });
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
                hasVisibleStroke: true
              }
            });
          }
        }
      }
      if ("paddingLeft" in currentNode && typeof currentNode.paddingLeft === "number") {
        const frame = currentNode;
        const paddings = [
          { value: frame.paddingLeft, name: "left" },
          { value: frame.paddingRight, name: "right" },
          { value: frame.paddingTop, name: "top" },
          { value: frame.paddingBottom, name: "bottom" }
        ];
        paddings.forEach((padding) => {
          if (typeof padding.value === "number" && padding.value > 1 && !spacingSet.has(padding.value.toString())) {
            spacingSet.add(padding.value.toString());
            spacing.push({
              name: `hard-coded-padding-${padding.name}-${padding.value}`,
              value: `${padding.value}px`,
              type: "padding",
              isToken: false,
              source: "hard-coded"
            });
          }
        });
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
        const variantProps = componentSet.variantGroupProperties;
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
  async function processEnhancedAnalysis(claudeData, node) {
    var _a, _b;
    const tokens = await extractDesignTokensFromNode(node);
    const audit = {
      states: [],
      accessibility: [],
      naming: [],
      consistency: []
    };
    const actualStates = [];
    if (node.type === "COMPONENT_SET") {
      const componentSet = node;
      const variantProps = componentSet.variantGroupProperties;
      for (const propName in variantProps) {
        const prop = variantProps[propName];
        if (propName.toLowerCase() === "state" || propName.toLowerCase() === "states") {
          actualStates.push(...prop.values);
        }
      }
      componentSet.children.forEach((variant) => {
        const variantName = variant.name.toLowerCase();
        ["default", "hover", "focus", "disabled", "pressed", "active"].forEach((state) => {
          if (variantName.includes(state) && !actualStates.includes(state)) {
            actualStates.push(state);
          }
        });
      });
    }
    const recommendedStates = claudeData.states || [];
    if (actualStates.length > 0) {
      const expectedStates = ["default", "hover", "focus", "disabled"];
      expectedStates.forEach((state) => {
        audit.states.push({
          name: state,
          found: actualStates.includes(state)
        });
      });
      actualStates.forEach((state) => {
        if (!expectedStates.includes(state)) {
          audit.states.push({
            name: state,
            found: true
          });
        }
      });
    } else if (recommendedStates.length > 0) {
      recommendedStates.forEach((state) => {
        audit.states.push({
          name: state,
          found: false
        });
      });
    }
    if ((_a = claudeData.audit) == null ? void 0 : _a.accessibilityIssues) {
      claudeData.audit.accessibilityIssues.forEach((issue) => {
        audit.accessibility.push({
          check: issue,
          status: "fail",
          suggestion: "Fix required"
        });
      });
    }
    if ((_b = claudeData.audit) == null ? void 0 : _b.namingIssues) {
      claudeData.audit.namingIssues.forEach((issue) => {
        let layerName = "Component";
        let suggestion = "Follow naming conventions";
        const layerMatch = issue.match(/["']([^"']+)["']/);
        if (layerMatch) {
          layerName = layerMatch[1];
        } else if (issue.toLowerCase().includes("component")) {
          layerName = node.name;
        }
        const suggestionMatch = issue.match(/should be ([\w-]+)/i);
        if (suggestionMatch) {
          suggestion = suggestionMatch[1];
        }
        audit.naming.push({
          layer: layerName,
          issue,
          suggestion
        });
      });
    }
    const suggestions = [
      {
        category: "token",
        priority: "high",
        title: "Token Implementation",
        description: `Found ${tokens.summary.hardCodedValues} hard-coded values that could use design tokens`,
        action: "Review token recommendations"
      }
    ];
    if (audit.accessibility.length > 0) {
      suggestions.push({
        category: "accessibility",
        priority: "high",
        title: "Accessibility Improvements",
        description: `${audit.accessibility.length} accessibility issues need attention`,
        action: "Review accessibility audit"
      });
    }
    return {
      metadata: claudeData,
      tokens,
      audit,
      suggestions
    };
  }

  // src/api/claude.ts
  var ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
  var DEFAULT_MODEL = "claude-3-sonnet-20240229";
  var MAX_TOKENS = 2048;
  async function fetchClaude(prompt, apiKey, model = DEFAULT_MODEL) {
    console.log("Making Claude API call directly...");
    const requestBody = {
      model,
      messages: [
        {
          role: "user",
          content: prompt.trim()
        }
      ],
      max_tokens: MAX_TOKENS
    };
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
  function createEnhancedMetadataPrompt(componentContext) {
    return `You are an expert design system architect analyzing a Figma component for comprehensive metadata and design token recommendations.

**Component Analysis Context:**
- Component Name: ${componentContext.name}
- Component Type: ${componentContext.type}
- Layer Structure: ${JSON.stringify(componentContext.hierarchy, null, 2)}
- Detected Colors: ${componentContext.colors && componentContext.colors.length > 0 ? componentContext.colors.join(", ") : "None detected"}
- Detected Spacing: ${componentContext.spacing && componentContext.spacing.length > 0 ? componentContext.spacing.join(", ") : "None detected"}
- Text Content: ${componentContext.textContent || "No text content"}

**Additional Context & Considerations:**
${componentContext.additionalContext ? `
- Component Family: ${componentContext.additionalContext.componentFamily || "Generic"}
- Possible Use Case: ${componentContext.additionalContext.possibleUseCase || "Unknown"}
- Has Interactive Elements: ${componentContext.additionalContext.hasInteractiveElements ? "Yes" : "No"}
- Design Patterns: ${componentContext.additionalContext.designPatterns.join(", ") || "None identified"}
- Considerations: ${componentContext.additionalContext.suggestedConsiderations.join("; ") || "None"}
` : "- No additional context available"}

**Analysis Requirements:**

1. **Component Metadata**: Provide comprehensive component documentation
2. **Design Token Analysis**: Analyze and recommend semantic design tokens
3. **Accessibility Assessment**: Evaluate accessibility compliance
4. **Naming Convention Review**: Check layer naming consistency
5. **Design System Integration**: Suggest improvements for scalability

**Design Token Focus Areas:**
- **Color Tokens**: Semantic color usage (primary, secondary, neutral, semantic colors)
- **Spacing Tokens**: Consistent spacing patterns (padding, margins, gaps)
- **Typography Tokens**: Font sizes, weights, line heights, letter spacing
- **Effect Tokens**: Shadows, blurs, and other visual effects
- **Border Tokens**: Border radius, stroke weights
- **Layout Tokens**: Grid systems, breakpoints, container sizes

**Response Format (JSON only):**
{
  "component": "Component name and purpose",
  "description": "Detailed component description and use cases",
  "props": [
    {
      "name": "property name",
      "type": "string|boolean|number|variant",
      "description": "Property purpose and usage",
      "defaultValue": "default value",
      "required": true/false
    }
  ],
  "states": ["IMPORTANT: Use the Additional Context section above to determine appropriate states. For avatars marked as interactive, include hover/focus states. Only list states that make sense based on the component's use case and interactivity"],
  "slots": ["slot descriptions for content areas"],
  "variants": {
    "size": ["small", "medium", "large"],
    "variant": ["primary", "secondary", "outline"],
    "theme": ["light", "dark"]
  },
  "usage": "When and how to use this component",
  "accessibility": {
    "ariaLabels": ["required aria labels"],
    "keyboardSupport": "keyboard interaction requirements",
    "colorContrast": "contrast compliance status",
    "focusManagement": "focus behavior description"
  },
  "tokens": {
    "colors": [
      "semantic-color-primary",
      "semantic-color-secondary",
      "neutral-background-default",
      "neutral-text-primary",
      "semantic-color-success",
      "semantic-color-error",
      "semantic-color-warning"
    ],
    "spacing": [
      "spacing-xs-4px",
      "spacing-sm-8px",
      "spacing-md-16px",
      "spacing-lg-24px",
      "spacing-xl-32px"
    ],
    "typography": [
      "text-size-sm-12px",
      "text-size-base-14px",
      "text-size-lg-16px",
      "text-size-xl-18px",
      "text-weight-normal-400",
      "text-weight-medium-500",
      "text-weight-semibold-600"
    ],
    "effects": [
      "shadow-sm-subtle",
      "shadow-md-default",
      "shadow-lg-prominent",
      "blur-backdrop-light"
    ],
    "borders": [
      "radius-sm-4px",
      "radius-md-8px",
      "radius-lg-12px",
      "radius-full-999px"
    ]
  },
  "propertyCheatSheet": [
    {
      "name": "Property name",
      "values": ["value1", "value2", "value3"],
      "default": "default value",
      "description": "What this property controls"
    }
  ],
  "audit": {
    "accessibilityIssues": ["List specific accessibility issues found"],
    "namingIssues": ["List layer naming problems with suggestions"],
    "consistencyIssues": ["List design consistency issues"],
    "tokenOpportunities": ["Specific recommendations for design token implementation"]
  }
}

**Analysis Guidelines:**

1. **Be Specific**: Provide actionable, specific recommendations
2. **Modern Practices**: Follow current design system best practices
3. **Semantic Naming**: Use semantic token names that describe purpose, not appearance
4. **Scalability**: Consider how tokens support design system growth
5. **Accessibility**: Ensure recommendations support inclusive design
6. **Consistency**: Identify patterns that can be systematized

**Token Naming Convention:**
- Colors: \`semantic-[purpose]-[variant]\` (e.g., "semantic-color-primary", "neutral-background-subtle")
- Spacing: \`spacing-[size]-[value]\` (e.g., "spacing-md-16px", "spacing-lg-24px")
- Typography: \`text-[property]-[variant]-[value]\` (e.g., "text-size-lg-18px", "text-weight-semibold-600")
- Effects: \`[effect]-[intensity]-[purpose]\` (e.g., "shadow-md-default", "blur-backdrop-light")
- Borders: \`radius-[size]-[value]\` (e.g., "radius-md-8px", "radius-full-999px")

Focus on creating a comprehensive analysis that helps designers build scalable, consistent, and accessible design systems.`;
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

  // src/ui/message-handler.ts
  var storedApiKey = null;
  var selectedModel = "claude-3-sonnet-20240229";
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
        case "generate-variants":
          await handleGenerateVariants(data.metadata);
          break;
        case "generate-playground":
          await handleGeneratePlayground(data.metadata);
          break;
        case "generate-docs-frame":
          await handleGenerateDocsFrame(data);
          break;
        case "embed-metadata":
          await handleEmbedMetadata(data.metadata);
          break;
        case "clear-api-key":
          await handleClearApiKey();
          break;
        case "save-collab-notes":
          await handleSaveCollabNotes(data.notes);
          break;
        case "fix-naming":
          await handleFixNaming(data);
          break;
        case "add-state":
          await handleAddState(data);
          break;
        case "fix-accessibility":
          await handleFixAccessibility(data);
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
      if (selectedNode.type === "INSTANCE") {
        const instance = selectedNode;
        if (instance.mainComponent) {
          figma.notify("Analyzing main component instead of instance...", { timeout: 2e3 });
          selectedNode = instance.mainComponent;
        } else {
          throw new Error("This instance has no main component. Please select a component directly.");
        }
      }
      if (!isValidNodeForAnalysis(selectedNode)) {
        throw new Error("Please select a Frame, Component, or Instance to analyze");
      }
      const componentContext = extractComponentContext(selectedNode);
      const prompt = createEnhancedMetadataPrompt(componentContext);
      figma.notify("Performing enhanced analysis with Claude AI...", { timeout: 3e3 });
      const analysis = await fetchClaude(prompt, storedApiKey, selectedModel);
      const enhancedData = extractJSONFromResponse(analysis);
      const result = await processEnhancedAnalysis(enhancedData, selectedNode);
      globalThis.lastAnalyzedMetadata = result.metadata;
      globalThis.lastAnalyzedNode = selectedNode;
      sendMessageToUI("enhanced-analysis-result", result);
      figma.notify("Enhanced analysis complete!", { timeout: 3e3 });
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
    for (const node of nodes) {
      if (isValidNodeForAnalysis(node)) {
        try {
          const componentContext = extractComponentContext(node);
          const prompt = createEnhancedMetadataPrompt(componentContext);
          const analysis = await fetchClaude(prompt, storedApiKey, selectedModel);
          const data = extractJSONFromResponse(analysis);
          results.push({
            node: node.name,
            success: true,
            data
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
    sendMessageToUI("batch-analysis-result", { results });
    figma.notify(`Batch analysis complete: ${results.length} components processed`, { timeout: 3e3 });
  }
  async function handleGenerateVariants(_metadata) {
    figma.notify("Variant generation not yet implemented in refactored version", { timeout: 2e3 });
  }
  async function handleGeneratePlayground(metadata) {
    try {
      const selection = figma.currentPage.selection;
      if (selection.length === 0) {
        throw new Error("No component selected");
      }
      let selectedNode = selection[0];
      if (selectedNode.type === "INSTANCE") {
        const instance = selectedNode;
        if (instance.mainComponent) {
          selectedNode = instance.mainComponent;
        } else {
          throw new Error("Instance has no main component");
        }
      }
      if (selectedNode.type !== "COMPONENT" && selectedNode.type !== "COMPONENT_SET") {
        throw new Error("Please select a component or component set");
      }
      const playgroundFrame = figma.createFrame();
      playgroundFrame.name = `${selectedNode.name} - Component Playground`;
      playgroundFrame.x = selectedNode.x + selectedNode.width + 100;
      playgroundFrame.y = selectedNode.y;
      playgroundFrame.fills = [{ type: "SOLID", color: { r: 0.05, g: 0.05, b: 0.05 } }];
      playgroundFrame.layoutMode = "VERTICAL";
      playgroundFrame.primaryAxisSizingMode = "AUTO";
      playgroundFrame.counterAxisSizingMode = "AUTO";
      playgroundFrame.paddingLeft = 48;
      playgroundFrame.paddingRight = 48;
      playgroundFrame.paddingTop = 48;
      playgroundFrame.paddingBottom = 48;
      playgroundFrame.itemSpacing = 48;
      const title = figma.createText();
      await figma.loadFontAsync({ family: "Inter", style: "Medium" });
      title.fontName = { family: "Inter", style: "Medium" };
      title.fontSize = 24;
      title.characters = selectedNode.name;
      title.fills = [{ type: "SOLID", color: { r: 0.6, g: 0.6, b: 0.6 } }];
      playgroundFrame.appendChild(title);
      if (selectedNode.type === "COMPONENT_SET") {
        await generateComponentSetPlayground(selectedNode, playgroundFrame, metadata);
      } else {
        await generateSingleComponentPlayground(selectedNode, playgroundFrame, metadata);
      }
      figma.currentPage.selection = [playgroundFrame];
      figma.viewport.scrollAndZoomIntoView([playgroundFrame]);
      sendMessageToUI("playground-generated", { success: true });
      figma.notify("Component playground generated successfully!", { timeout: 3e3 });
    } catch (error) {
      console.error("Error generating playground:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to generate playground";
      figma.notify(`Error: ${errorMessage}`, { error: true });
      sendMessageToUI("playground-generated", { success: false, error: errorMessage });
    }
  }
  async function generateComponentSetPlayground(componentSet, playgroundFrame, metadata) {
    const variantProps = componentSet.variantGroupProperties;
    const variantKeys = Object.keys(variantProps);
    if (variantKeys.length === 0) {
      const instancesFrame = createVariantSection("All Variants", playgroundFrame);
      componentSet.children.forEach((variant, index) => {
        if (variant.type === "COMPONENT") {
          const instance = variant.createInstance();
          instancesFrame.appendChild(instance);
        }
      });
      return;
    }
    if (variantKeys.length === 1) {
      const prop = variantKeys[0];
      const values = variantProps[prop].values;
      const section = createVariantSection(prop, playgroundFrame);
      values.forEach((value) => {
        const variant = findVariantByProperty(componentSet, prop, value);
        if (variant) {
          const instance = variant.createInstance();
          section.appendChild(instance);
        }
      });
    } else if (variantKeys.length === 2) {
      const [prop1, prop2] = variantKeys;
      const values1 = variantProps[prop1].values;
      const values2 = variantProps[prop2].values;
      const gridFrame = figma.createFrame();
      gridFrame.name = "Variants Grid";
      gridFrame.layoutMode = "VERTICAL";
      gridFrame.primaryAxisSizingMode = "AUTO";
      gridFrame.counterAxisSizingMode = "AUTO";
      gridFrame.itemSpacing = 24;
      gridFrame.fills = [];
      playgroundFrame.appendChild(gridFrame);
      const headerRow = figma.createFrame();
      headerRow.layoutMode = "HORIZONTAL";
      headerRow.primaryAxisSizingMode = "AUTO";
      headerRow.counterAxisSizingMode = "AUTO";
      headerRow.itemSpacing = 24;
      headerRow.fills = [];
      gridFrame.appendChild(headerRow);
      const emptyCell = figma.createFrame();
      emptyCell.resize(100, 40);
      emptyCell.fills = [];
      headerRow.appendChild(emptyCell);
      for (const value2 of values2) {
        const header = await createLabel(`${prop2}: ${value2}`);
        headerRow.appendChild(header);
      }
      for (const value1 of values1) {
        const row = figma.createFrame();
        row.layoutMode = "HORIZONTAL";
        row.primaryAxisSizingMode = "AUTO";
        row.counterAxisSizingMode = "AUTO";
        row.itemSpacing = 24;
        row.fills = [];
        gridFrame.appendChild(row);
        const rowLabel = await createLabel(`${prop1}: ${value1}`);
        row.appendChild(rowLabel);
        for (const value2 of values2) {
          const variant = findVariantByProperties(componentSet, {
            [prop1]: value1,
            [prop2]: value2
          });
          if (variant) {
            const instance = variant.createInstance();
            row.appendChild(instance);
          } else {
            const placeholder = figma.createFrame();
            placeholder.resize(100, 40);
            placeholder.fills = [];
            row.appendChild(placeholder);
          }
        }
      }
    } else {
      const mainProp = variantKeys[0];
      const mainValues = variantProps[mainProp].values;
      mainValues.forEach((mainValue) => {
        const section = createVariantSection(`${mainProp}: ${mainValue}`, playgroundFrame);
        const variants = componentSet.children.filter((child) => {
          if (child.type === "COMPONENT") {
            const component = child;
            const variantProps2 = parseVariantProperties(component.name);
            return variantProps2[mainProp] === mainValue;
          }
          return false;
        });
        variants.forEach((variant) => {
          if (variant.type === "COMPONENT") {
            const instance = variant.createInstance();
            section.appendChild(instance);
          }
        });
      });
    }
  }
  async function generateSingleComponentPlayground(component, playgroundFrame, metadata) {
    const states = (metadata == null ? void 0 : metadata.states) || [];
    const hasStates = states.length > 0;
    if (!hasStates) {
      const section = createVariantSection("Default Instance", playgroundFrame);
      const instance = component.createInstance();
      section.appendChild(instance);
    } else {
      const sectionTitle = "Recommended States (Not Yet Implemented)";
      const section = createVariantSection(sectionTitle, playgroundFrame);
      const note = await createLabel("These states are recommended based on the component type");
      note.fontSize = 10;
      note.fills = [{ type: "SOLID", color: { r: 0.6, g: 0.6, b: 0.6 } }];
      section.appendChild(note);
      states.forEach((state) => {
        const container = figma.createFrame();
        container.layoutMode = "VERTICAL";
        container.primaryAxisSizingMode = "AUTO";
        container.counterAxisSizingMode = "AUTO";
        container.itemSpacing = 8;
        container.fills = [];
        section.appendChild(container);
        createLabel(state).then((label) => {
          container.appendChild(label);
        });
        const instance = component.createInstance();
        container.appendChild(instance);
      });
    }
  }
  function createVariantSection(title, parent) {
    const section = figma.createFrame();
    section.name = title;
    section.layoutMode = "HORIZONTAL";
    section.primaryAxisSizingMode = "AUTO";
    section.counterAxisSizingMode = "AUTO";
    section.itemSpacing = 24;
    section.paddingLeft = 24;
    section.paddingRight = 24;
    section.paddingTop = 24;
    section.paddingBottom = 24;
    section.fills = [];
    section.strokes = [{
      type: "SOLID",
      color: { r: 0.5, g: 0.3, b: 0.8 },
      opacity: 0.5
    }];
    section.strokeWeight = 1;
    section.dashPattern = [4, 4];
    section.cornerRadius = 8;
    parent.appendChild(section);
    return section;
  }
  async function createLabel(text) {
    const label = figma.createText();
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });
    label.fontName = { family: "Inter", style: "Regular" };
    label.fontSize = 12;
    label.characters = text;
    label.fills = [{ type: "SOLID", color: { r: 0.5, g: 0.3, b: 0.8 } }];
    return label;
  }
  function findVariantByProperty(componentSet, property, value) {
    return componentSet.children.find((child) => {
      if (child.type === "COMPONENT") {
        const variantProps = parseVariantProperties(child.name);
        return variantProps[property] === value;
      }
      return false;
    });
  }
  function findVariantByProperties(componentSet, properties) {
    return componentSet.children.find((child) => {
      if (child.type === "COMPONENT") {
        const variantProps = parseVariantProperties(child.name);
        return Object.entries(properties).every(([key, value]) => variantProps[key] === value);
      }
      return false;
    });
  }
  function parseVariantProperties(name) {
    const props = {};
    const parts = name.split(",").map((p) => p.trim());
    parts.forEach((part) => {
      const [key, value] = part.split("=").map((p) => p.trim());
      if (key && value) {
        props[key] = value;
      }
    });
    return props;
  }
  async function handleGenerateDocsFrame(_data) {
    figma.notify("Documentation frame generation not yet implemented in refactored version", { timeout: 2e3 });
  }
  async function handleEmbedMetadata(_metadata) {
    figma.notify("Metadata embedding not yet implemented in refactored version", { timeout: 2e3 });
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
  async function handleSaveCollabNotes(_notes) {
    figma.notify("Collaboration notes not yet implemented in refactored version", { timeout: 2e3 });
  }
  async function handleFixNaming(data) {
    try {
      const { layer, newName } = data;
      if (!layer || !newName) {
        throw new Error("Layer name and new name are required");
      }
      const selection = figma.currentPage.selection;
      if (selection.length === 0) {
        throw new Error("No component selected");
      }
      let selectedNode = selection[0];
      if (selectedNode.type === "INSTANCE") {
        const instance = selectedNode;
        if (instance.mainComponent) {
          selectedNode = instance.mainComponent;
        }
      }
      let nodeToRename = null;
      if (selectedNode.name === layer) {
        nodeToRename = selectedNode;
      } else {
        nodeToRename = findNodeByName(selectedNode, layer);
      }
      if (!nodeToRename) {
        throw new Error(`Layer "${layer}" not found in the component`);
      }
      const oldName = nodeToRename.name;
      nodeToRename.name = newName;
      sendMessageToUI("fix-naming", {
        success: true,
        message: `Renamed "${oldName}" to "${newName}"`
      });
      figma.notify(`Renamed "${oldName}" to "${newName}"`, { timeout: 2e3 });
    } catch (error) {
      console.error("Error fixing naming:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to rename layer";
      sendMessageToUI("fix-naming", { success: false, error: errorMessage });
      figma.notify(`Error: ${errorMessage}`, { error: true });
    }
  }
  function findNodeByName(node, name) {
    if (node.name === name) {
      return node;
    }
    if ("children" in node) {
      for (const child of node.children) {
        const found = findNodeByName(child, name);
        if (found) {
          return found;
        }
      }
    }
    return null;
  }
  async function handleAddState(data) {
    try {
      const { state } = data;
      if (!state) {
        throw new Error("State name is required");
      }
      const selection = figma.currentPage.selection;
      if (selection.length === 0) {
        throw new Error("No component selected");
      }
      let selectedNode = selection[0];
      if (selectedNode.type === "INSTANCE") {
        const instance = selectedNode;
        if (instance.mainComponent) {
          selectedNode = instance.mainComponent;
        }
      }
      if (selectedNode.type !== "COMPONENT") {
        throw new Error("Selected node must be a component to add states");
      }
      const component = selectedNode;
      const parent = component.parent;
      if (!parent) {
        throw new Error("Component must have a parent to create variants");
      }
      let componentSet;
      if (parent.type === "COMPONENT_SET") {
        componentSet = parent;
      } else {
        componentSet = figma.combineAsVariants([component], parent, parent.children.indexOf(component));
        componentSet.name = component.name;
      }
      const newVariant = component.clone();
      newVariant.name = `State=${state}`;
      newVariant.x = component.x + component.width + 20;
      componentSet.appendChild(newVariant);
      if (state === "hover") {
        applyHoverState(newVariant);
      } else if (state === "focus") {
        applyFocusState(newVariant);
      } else if (state === "disabled") {
        applyDisabledState(newVariant);
      } else if (state === "pressed" || state === "active") {
        applyPressedState(newVariant);
      }
      sendMessageToUI("state-added", {
        success: true,
        state,
        message: `Added ${state} state`
      });
      figma.notify(`Added ${state} state to component`, { timeout: 2e3 });
    } catch (error) {
      console.error("Error adding state:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to add state";
      sendMessageToUI("state-added", { success: false, error: errorMessage });
      figma.notify(`Error: ${errorMessage}`, { error: true });
    }
  }
  function applyHoverState(node) {
    if ("opacity" in node) {
      node.opacity = Math.min(node.opacity * 1.1, 1);
    }
  }
  function applyFocusState(node) {
    if ("strokes" in node) {
      node.strokes = [{
        type: "SOLID",
        color: { r: 0.33, g: 0.53, b: 1 },
        opacity: 1
      }];
      node.strokeWeight = 2;
    }
  }
  function applyDisabledState(node) {
    if ("opacity" in node) {
      node.opacity = 0.5;
    }
  }
  function applyPressedState(node) {
    if ("opacity" in node) {
      node.opacity = Math.max(node.opacity * 0.9, 0.1);
    }
  }
  async function handleFixAccessibility(_data) {
    figma.notify("Accessibility fixes not yet implemented in refactored version", { timeout: 2e3 });
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
      console.log("Plugin initialized successfully");
    } catch (error) {
      console.error("Error initializing plugin:", error);
    }
  }

  // src/code.ts
  var PLUGIN_WINDOW_SIZE = { width: 400, height: 700 };
  try {
    figma.showUI(__html__, PLUGIN_WINDOW_SIZE);
    console.log("\u2705 AI Design Co-Pilot v2.0 - UI shown successfully");
  } catch (error) {
    console.log("\u2139\uFE0F UI might already be shown in inspect panel:", error);
  }
  figma.ui.onmessage = handleUIMessage;
  initializePlugin();
  console.log("\u{1F680} AI Design Co-Pilot v2.0 initialized with modular architecture");
})();
