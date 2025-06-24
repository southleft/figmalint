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
              source: "hard-coded",
              context: {
                nodeType: currentNode.type,
                nodeName: currentNode.name
              }
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
      mcpReadiness: claudeData.mcpReadiness ? {
        score: parseInt(claudeData.mcpReadiness.score) || 0,
        strengths: claudeData.mcpReadiness.strengths || [],
        gaps: claudeData.mcpReadiness.gaps || [],
        recommendations: claudeData.mcpReadiness.recommendations || [],
        implementationNotes: claudeData.mcpReadiness.implementationNotes || ""
      } : void 0
    };
    return {
      metadata: cleanMetadata,
      tokens,
      audit,
      properties: actualProperties
      // This will be used by the UI for the property cheat sheet
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
6. **MCP Server Compatibility**: Ensure component structure supports automated code generation

**MCP Server Integration Focus:**
- **Property Definitions**: Components need clearly defined props that map to code
- **State Management**: Interactive components require all necessary states (hover, focus, disabled, etc.)
- **Token Usage**: Hard-coded values should use design tokens for consistency
- **Semantic Structure**: Layer names should be descriptive and follow conventions
- **Variant Patterns**: Only recommend variants when they serve a logical purpose (size, style, or functional differences)
- **Developer Handoff**: Metadata should include implementation guidance

**Important: Variant Recommendations Guidelines:**
- Do NOT recommend variants for components that are intentionally single-purpose (icons, badges, simple dividers)
- Only suggest variants when there's clear evidence the component should have multiple visual or functional states
- Consider the component family: buttons typically need variants, simple graphics usually don't
- Base variant suggestions on actual design system patterns, not theoretical possibilities

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
  },
  "mcpReadiness": {
    "score": "0-100 readiness score for MCP server code generation",
    "strengths": ["What's already well-structured for code generation"],
    "gaps": ["What needs to be improved for MCP compatibility"],
    "recommendations": [
      "Specific actions to make this component MCP-ready",
      "Priority improvements for code generation accuracy"
    ],
    "implementationNotes": "Developer guidance for implementing this component"
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
        case "clear-api-key":
          await handleClearApiKey();
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
      const componentContext = extractComponentContext(selectedNode);
      const prompt = createEnhancedMetadataPrompt(componentContext);
      figma.notify("Performing enhanced analysis with Claude AI...", { timeout: 3e3 });
      const analysis = await fetchClaude(prompt, storedApiKey, selectedModel);
      const enhancedData = extractJSONFromResponse(analysis);
      const result = await processEnhancedAnalysis(enhancedData, selectedNode, originalSelectedNode);
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
