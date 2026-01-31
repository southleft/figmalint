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
  function hasDefaultVariantFrameStyles(node) {
    var _a;
    let currentNode = node;
    let isPartOfVariant = false;
    while (currentNode) {
      if (currentNode.type === "COMPONENT_SET") {
        isPartOfVariant = true;
        break;
      }
      if (currentNode.parent && currentNode.parent.type === "COMPONENT_SET") {
        isPartOfVariant = true;
        break;
      }
      currentNode = currentNode.parent;
    }
    if (!isPartOfVariant) {
      return false;
    }
    if (!("strokes" in node) || !("cornerRadius" in node) || !("strokeWeight" in node)) {
      return false;
    }
    const hasDefaultRadius = node.cornerRadius === 5 || "topLeftRadius" in node && "topRightRadius" in node && "bottomLeftRadius" in node && "bottomRightRadius" in node && node.topLeftRadius === 5 && node.topRightRadius === 5 && node.bottomLeftRadius === 5 && node.bottomRightRadius === 5;
    const hasDefaultStrokeWeight = node.strokeWeight === 1;
    const strokes = node.strokes;
    const hasDefaultStroke = strokes.length > 0 && strokes.some((stroke) => {
      if (stroke.type === "SOLID" && stroke.visible !== false && stroke.color) {
        const hex = rgbToHex(stroke.color.r, stroke.color.g, stroke.color.b).toUpperCase();
        return hex === "#9747FF";
      }
      return false;
    });
    const hasDefaultPadding = "paddingLeft" in node && "paddingRight" in node && "paddingTop" in node && "paddingBottom" in node && node.paddingLeft === 16 && node.paddingRight === 16 && node.paddingTop === 16 && node.paddingBottom === 16;
    const hasAllDefaults = hasDefaultRadius && hasDefaultStrokeWeight && hasDefaultStroke && hasDefaultPadding;
    if (hasAllDefaults) {
      console.log(`\u{1F3AF} [FILTER] Detected default variant frame styles in ${node.name} - filtering out`);
      console.log(`   Type: ${node.type}, Parent: ${(_a = node.parent) == null ? void 0 : _a.type}`);
      console.log(`   Radius: ${node.cornerRadius}, Weight: ${node.strokeWeight}, Color: ${strokes.length > 0 ? rgbToHex(strokes[0].color.r, strokes[0].color.g, strokes[0].color.b) : "none"}`);
      console.log(`   Padding: L=${node.paddingLeft}, R=${node.paddingRight}, T=${node.paddingTop}, B=${node.paddingBottom}`);
    }
    return hasAllDefaults;
  }
  function isNodeInVariant(node) {
    let currentNode = node;
    while (currentNode) {
      if (currentNode.type === "COMPONENT_SET") {
        return true;
      }
      if (currentNode.parent && currentNode.parent.type === "COMPONENT_SET") {
        return true;
      }
      currentNode = currentNode.parent;
    }
    return false;
  }
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
        const strokeWeightProps = ["strokeWeight", "strokeTopWeight", "strokeRightWeight", "strokeBottomWeight", "strokeLeftWeight"];
        strokeWeightProps.forEach((prop) => {
          if (boundVars[prop]) {
            console.log(`   \u{1F4CF} Processing ${prop} variable...`);
            variableProcessingPromises.push(processSingleVariable(boundVars[prop], prop, borderSet, borders, "border"));
          }
        });
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
            const fillDedupKey = `${hex}:${currentNode.id}`;
            if (!colorSet.has(fillDedupKey)) {
              console.log(`   \u26A0\uFE0F Found hard-coded fill: ${hex}`);
              colorSet.add(fillDedupKey);
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
                  nodeId: currentNode.id,
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
        if (hasDefaultVariantFrameStyles(currentNode)) {
          console.log(`   \u{1F6AB} Skipping default variant frame stroke colors`);
        } else {
          currentNode.strokes.forEach((stroke) => {
            if (stroke.type === "SOLID" && stroke.visible !== false && stroke.color) {
              const hex = rgbToHex(stroke.color.r, stroke.color.g, stroke.color.b);
              const strokeDedupKey = `${hex}:${currentNode.id}`;
              if (!colorSet.has(strokeDedupKey)) {
                console.log(`   \u26A0\uFE0F Found hard-coded stroke: ${hex}`);
                colorSet.add(strokeDedupKey);
                const debugContext = getDebugContext(currentNode);
                colors.push({
                  name: `hard-coded-stroke-${colors.length + 1}`,
                  value: hex,
                  type: "stroke",
                  isToken: false,
                  source: "hard-coded",
                  isDefaultVariantStyle: hex.toUpperCase() === "#9747FF" && isNodeInVariant(currentNode),
                  context: {
                    nodeType: currentNode.type,
                    nodeName: currentNode.name,
                    nodeId: currentNode.id,
                    path: debugContext.path,
                    description: debugContext.description,
                    property: "strokes"
                  }
                });
              }
            }
          });
        }
      } else if (hasStrokeVariables) {
        console.log(`\u{1F50D} [VARIABLES] ${currentNode.name} has stroke variables - skipping hard-coded detection`);
      } else if (hasStrokeStyle) {
        console.log(`\u{1F50D} [STYLES] ${currentNode.name} has stroke style - skipping hard-coded detection`);
      }
      if ("strokeWeight" in currentNode && typeof currentNode.strokeWeight === "number") {
        console.log(`\u{1F50D} Node ${currentNode.name} has strokeWeight: ${currentNode.strokeWeight}`);
        const hasStrokes = "strokes" in currentNode && Array.isArray(currentNode.strokes) && currentNode.strokes.length > 0;
        const hasVisibleStrokes = hasStrokes && currentNode.strokes.some((stroke) => stroke.visible !== false);
        const hasStrokeWeightVariable = "boundVariables" in currentNode && currentNode.boundVariables && ["strokeWeight", "strokeTopWeight", "strokeRightWeight", "strokeBottomWeight", "strokeLeftWeight"].some((prop) => currentNode.boundVariables[prop]);
        const boundVarKeys = "boundVariables" in currentNode && currentNode.boundVariables ? Object.keys(currentNode.boundVariables) : [];
        console.log(`   Has strokes: ${hasStrokes}, Has visible strokes: ${hasVisibleStrokes}, Has strokeWeight variable: ${!!hasStrokeWeightVariable}, boundVariable keys: [${boundVarKeys.join(", ")}]`);
        if (hasStrokeWeightVariable) {
          console.log(`   \u{1F517} ${currentNode.name} has strokeWeight bound to variable - skipping hard-coded detection`);
        } else if (currentNode.strokeWeight > 0 && hasVisibleStrokes && !hasDefaultVariantFrameStyles(currentNode)) {
          const strokeWeightValue = `${currentNode.strokeWeight}px`;
          let strokeColor = void 0;
          const firstVisibleStroke = currentNode.strokes.find((stroke) => stroke.visible !== false && stroke.type === "SOLID");
          if (firstVisibleStroke && firstVisibleStroke.type === "SOLID" && firstVisibleStroke.color) {
            strokeColor = rgbToHex(firstVisibleStroke.color.r, firstVisibleStroke.color.g, firstVisibleStroke.color.b);
          }
          const swDedupKey = `${strokeWeightValue}:${currentNode.id}`;
          if (!borderSet.has(swDedupKey)) {
            console.log(`   \u2705 Adding stroke weight: ${strokeWeightValue}`);
            borderSet.add(swDedupKey);
            const debugContext = getDebugContext(currentNode);
            borders.push({
              name: `hard-coded-stroke-weight-${currentNode.strokeWeight}`,
              value: strokeWeightValue,
              type: "stroke-weight",
              isToken: false,
              source: "hard-coded",
              strokeColor,
              isDefaultVariantStyle: currentNode.strokeWeight === 1 && (strokeColor == null ? void 0 : strokeColor.toUpperCase()) === "#9747FF" && isNodeInVariant(currentNode),
              context: {
                nodeType: currentNode.type,
                nodeName: currentNode.name,
                nodeId: currentNode.id,
                hasVisibleStroke: true,
                path: debugContext.path,
                description: debugContext.description,
                property: "strokeWeight"
              }
            });
          }
        } else if (currentNode.strokeWeight > 0 && hasVisibleStrokes && hasDefaultVariantFrameStyles(currentNode)) {
          console.log(`   \u{1F6AB} Skipping default variant frame stroke weight`);
        }
      }
      const hasRadiusVariables = "boundVariables" in currentNode && currentNode.boundVariables && ["topLeftRadius", "topRightRadius", "bottomLeftRadius", "bottomRightRadius", "cornerRadius"].some((prop) => currentNode.boundVariables[prop]);
      if ("cornerRadius" in currentNode && typeof currentNode.cornerRadius === "number" && !hasRadiusVariables) {
        console.log(`\u{1F50D} [HARD-CODED] Checking corner radius for ${currentNode.name} (no variables)`);
        if (hasDefaultVariantFrameStyles(currentNode)) {
          console.log(`   \u{1F6AB} Skipping default variant frame corner radius`);
        } else {
          const radius = currentNode.cornerRadius;
          if (radius > 0) {
            const radiusValue = `${radius}px`;
            const crDedupKey = `${radiusValue}:${currentNode.id}`;
            if (!borderSet.has(crDedupKey)) {
              console.log(`   \u26A0\uFE0F Found hard-coded corner radius: ${radiusValue}`);
              borderSet.add(crDedupKey);
              const debugContext = getDebugContext(currentNode);
              borders.push({
                name: `hard-coded-corner-radius-${radius}`,
                value: radiusValue,
                type: "corner-radius",
                isToken: false,
                source: "hard-coded",
                isDefaultVariantStyle: radius === 5 && isNodeInVariant(currentNode),
                context: {
                  nodeType: currentNode.type,
                  nodeName: currentNode.name,
                  nodeId: currentNode.id,
                  path: debugContext.path,
                  description: debugContext.description,
                  property: "cornerRadius"
                }
              });
            }
          }
        }
      } else if (hasRadiusVariables) {
        console.log(`\u{1F50D} [VARIABLES] ${currentNode.name} has radius variables - skipping hard-coded detection`);
      }
      if (!hasRadiusVariables && "topLeftRadius" in currentNode) {
        console.log(`\u{1F50D} [HARD-CODED] Checking individual corner radius for ${currentNode.name} (no variables)`);
        if (hasDefaultVariantFrameStyles(currentNode)) {
          console.log(`   \u{1F6AB} Skipping default variant frame individual corner radii`);
        } else {
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
                const irDedupKey = `${radiusValue}:${currentNode.id}:${prop}`;
                if (!borderSet.has(irDedupKey)) {
                  console.log(`   \u26A0\uFE0F Found hard-coded ${name} radius: ${radiusValue}`);
                  borderSet.add(irDedupKey);
                  const debugContext = getDebugContext(currentNode);
                  borders.push({
                    name: `hard-coded-${name}-radius-${radius}`,
                    value: radiusValue,
                    type: `${name}-radius`,
                    isToken: false,
                    source: "hard-coded",
                    isDefaultVariantStyle: radius === 5 && isNodeInVariant(currentNode),
                    context: {
                      nodeType: currentNode.type,
                      nodeName: currentNode.name,
                      nodeId: currentNode.id,
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
          const padDedupKey = `${padding.value}:${currentNode.id}:${padding.name}`;
          if (typeof padding.value === "number" && padding.value > 1 && !spacingSet.has(padDedupKey)) {
            console.log(`   \u26A0\uFE0F Found hard-coded padding-${padding.name}: ${padding.value}px`);
            spacingSet.add(padDedupKey);
            const debugContext = getDebugContext(currentNode);
            const isDefaultVariantPadding = padding.value === 16 && isNodeInVariant(currentNode) && hasDefaultVariantFrameStyles(currentNode);
            spacing.push({
              name: `hard-coded-padding-${padding.name}-${padding.value}`,
              value: `${padding.value}px`,
              type: "padding",
              isToken: false,
              source: "hard-coded",
              isDefaultVariantStyle: isDefaultVariantPadding,
              context: {
                nodeType: currentNode.type,
                nodeName: currentNode.name,
                nodeId: currentNode.id,
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
      const nonDefaultTokens = tokens.filter((t) => !t.isDefaultVariantStyle);
      const actualTokens = nonDefaultTokens.filter((t) => t.isActualToken).length;
      const hardCoded = nonDefaultTokens.filter((t) => t.source === "hard-coded").length;
      summary.byCategory[category] = {
        total: nonDefaultTokens.length,
        tokens: actualTokens,
        hardCoded,
        suggestions: 0
      };
      summary.totalTokens += nonDefaultTokens.length;
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

  // src/api/claude.ts
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

**IMPORTANT: Focus on what makes this component ready for CODE GENERATION via MCP.**
Evaluate based on these criteria that actually matter for development:

**Analysis Requirements:**

1. **Component Properties**: Identify all configurable properties needed for flexibility
2. **Design Token Usage**: Analyze use of semantic tokens vs hard-coded values  
3. **Component States**: Document all interactive states (hover, focus, active, disabled, etc.)
4. **Component Boundaries**: Ensure clear component definition and structure
5. **Code Generation Readiness**: Assess how well the component can be translated to code
6. **MCP Compatibility**: Evaluate component structure for automated code generation

**Code Generation Focus Areas:**
- **Properties**: What can be configured when using this component
- **Token Usage**: Semantic tokens that maintain design consistency in code
- **States**: Interactive states that need to be implemented in code
- **Variant Organization**: When and how to use Figma component variants
- **Design Handoff**: Information developers need to implement this design

**Container Component Guidelines:**
- If this appears to be a CONTAINER component (e.g., "tabs", "form", "card-group"), focus on layout and organization rather than interaction variants
- Container components typically need fewer variants than individual interactive components
- Only suggest variants for containers if they truly have different layout patterns (e.g., vertical vs horizontal orientation)

**Variant Recommendations Guidelines:**
- Do NOT recommend variants for components that are intentionally single-purpose (icons, badges, simple dividers, containers)
- Only suggest variants when there's clear evidence the component should have multiple visual or functional states
- For CONTAINER components: Focus on layout variants (orientation, spacing) rather than interaction states
- For INDIVIDUAL components: Consider interaction states, sizes, and visual styles
- Base variant suggestions on actual design system patterns visible in the layer structure

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
  "states": ["IMPORTANT: Only include visual states that can be represented in Figma designs (hover, focus, disabled, loading, error). Do NOT include states that are purely functional/code-level."],
  "slots": ["slot descriptions for content areas"],
  "variants": {
    "size": ["small", "medium", "large"],
    "variant": ["primary", "secondary", "outline"],
    "orientation": ["horizontal", "vertical"]
  },
  "usage": "When and how to use this component in designs",
  "accessibility": {
    "designConsiderations": ["Design-focused accessibility considerations like color contrast, visual hierarchy, readable text sizes"],
    "visualIndicators": ["Visual cues needed for accessibility (focus rings, state indicators, etc.)"],
    "designGuidance": "How to design this component to be accessible"
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
  "recommendedProperties": [
    {
      "name": "Figma property name to add (e.g. 'Size', 'Icon Before')",
      "type": "VARIANT|BOOLEAN|TEXT|INSTANCE_SWAP",
      "description": "Why this property improves the component for design system usage and developer handoff",
      "examples": ["specific example values relevant to this component"]
    }
  ],
  "audit": {
    "tokenOpportunities": ["Specific recommendations for design token implementation in Figma"],
    "structureIssues": ["Component structure improvements for better design system integration"]
  },
  "mcpReadiness": {
    "score": "0-100 readiness score for MCP server code generation",
    "strengths": [
      "REQUIRED: List 2-3 specific DESIGN strengths this component already has for code generation",
      "FIGMA-ONLY Examples: 'Clear visual hierarchy in layers', 'Consistent spacing patterns', 'Well-organized component variants', 'Uses Figma variables for colors', 'Semantic layer naming', 'Defined visual states in Figma'"
    ],
    "gaps": [
      "REQUIRED: List 2-4 specific DESIGN gaps that limit MCP code generation effectiveness",
      "FIGMA-ONLY Examples: 'Missing visual states in Figma designs', 'Hard-coded spacing values (not using Figma variables)', 'Unclear component variant organization', 'Inconsistent layer naming conventions', 'No component properties defined in Figma', 'Missing visual feedback states'"
    ],
    "recommendations": [
      "REQUIRED: List 2-4 specific, actionable FIGMA DESIGN recommendations to improve MCP readiness",
      "FIGMA-ONLY Examples: 'Add hover and focus state designs in Figma', 'Replace hard-coded spacing with Figma variables', 'Define component variant properties in Figma', 'Standardize layer naming convention', 'Create missing visual states in component variants', 'Organize color styles into semantic tokens'"
    ],
    "implementationNotes": "Design handoff guidance for developers implementing this component"
  }
}

**Analysis Guidelines:**

1. **Be Figma-Specific**: Focus on what can be improved within Figma designs
2. **Design System Focus**: Consider how this fits into a broader design system
3. **Visual Design**: Prioritize visual consistency, token usage, and design handoff
4. **Component Architecture**: Evaluate how the component is structured in Figma
5. **Practical Recommendations**: Suggest improvements that designers can actually implement

**Recommended Properties Guidelines:**
For the "recommendedProperties" field, compare the component's EXISTING properties against best practices from established design systems (Material Design, Carbon, Ant Design, Polaris, Lightning, Spectrum, etc.):
- Only recommend Figma component properties that do NOT already exist on this component
- Use Figma property types: VARIANT (for enumerated options like size/style), BOOLEAN (for toggles like show/hide icon), TEXT (for editable text like labels), INSTANCE_SWAP (for swappable sub-components like icons)
- Each recommendation must be specific to THIS component type and its actual structure \u2014 do not suggest generic properties that don't apply
- If the component already has comprehensive properties, return an empty array \u2014 never force recommendations
- Consider what developers will need when consuming this component in code

**CRITICAL: AVOID ALL Development-Only Concerns:**
- Do NOT suggest implementing ARIA attributes, accessibility APIs, or semantic HTML (this is code-level)
- Do NOT suggest adding keyboard navigation, event handlers, or interactive behaviors (this is code-level)
- Do NOT suggest functional programming patterns, state management, or controlled/uncontrolled components (this is code-level)
- Do NOT suggest responsive breakpoint behaviors or CSS-specific implementations (this is code-level)
- Do NOT suggest animation tokens, transition timing, or programmatic animations (this is code-level)
- Do NOT suggest API integration, data binding, or dynamic content loading (this is code-level)
- ONLY focus on VISUAL DESIGN and DESIGN SYSTEM concerns that can be addressed within Figma

**Token Naming Convention:**
- Colors: \`semantic-[purpose]-[variant]\` (e.g., "semantic-color-primary", "neutral-background-subtle")
- Spacing: \`spacing-[size]-[value]\` (e.g., "spacing-md-16px", "spacing-lg-24px")
- Typography: \`text-[property]-[variant]-[value]\` (e.g., "text-size-lg-18px", "text-weight-semibold-600")
- Effects: \`[effect]-[intensity]-[purpose]\` (e.g., "shadow-md-default", "blur-backdrop-light")
- Borders: \`radius-[size]-[value]\` (e.g., "radius-md-8px", "radius-full-999px")

Focus on creating a comprehensive DESIGN analysis that helps designers build scalable, consistent, and well-structured Figma components.`;
  }
  function extractJSONFromResponse(response) {
    try {
      console.log("\u{1F50D} Starting JSON extraction from LLM response...");
      console.log("\u{1F4DD} Response length:", response.length);
      console.log("\u{1F4DD} Response preview (first 200 chars):", response.substring(0, 200));
      try {
        const parsed = JSON.parse(response.trim());
        console.log("\u2705 Successfully parsed entire response as JSON");
        return parsed;
      } catch (fullParseError) {
        console.log("\u26A0\uFE0F Full response is not valid JSON, trying to extract JSON block...");
      }
      const strategies = [
        // Strategy 1: Look for complete JSON objects with balanced braces
        () => extractBalancedJson(response),
        // Strategy 2: Look for JSON between common delimiters
        () => extractJsonBetweenDelimiters(response),
        // Strategy 3: Find JSON in code blocks
        () => extractJsonFromCodeBlocks(response),
        // Strategy 4: Last resort - original regex approach
        () => extractJsonWithRegex(response)
      ];
      for (let i = 0; i < strategies.length; i++) {
        try {
          console.log(`\u{1F50D} Trying extraction strategy ${i + 1}...`);
          const result = strategies[i]();
          if (result) {
            console.log("\u2705 Successfully extracted JSON with strategy", i + 1);
            return result;
          }
        } catch (strategyError) {
          const errorMessage = strategyError instanceof Error ? strategyError.message : "Unknown error";
          console.log(`\u26A0\uFE0F Strategy ${i + 1} failed:`, errorMessage);
          continue;
        }
      }
      throw new Error("No valid JSON found in response after trying all strategies");
    } catch (error) {
      console.error("\u274C Failed to parse JSON from LLM response:", error);
      console.log("\u{1F4DD} Full response for debugging:", response);
      throw new Error("Invalid JSON response from LLM API");
    }
  }
  function extractBalancedJson(response) {
    const firstBrace = response.indexOf("{");
    if (firstBrace === -1) return null;
    let braceCount = 0;
    let inString = false;
    let escapeNext = false;
    for (let i = firstBrace; i < response.length; i++) {
      const char = response[i];
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      if (char === "\\") {
        escapeNext = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (char === "{") {
          braceCount++;
        } else if (char === "}") {
          braceCount--;
          if (braceCount === 0) {
            const jsonStr = response.substring(firstBrace, i + 1);
            try {
              return JSON.parse(jsonStr);
            } catch (parseError) {
              console.log("\u26A0\uFE0F Balanced JSON extraction found malformed JSON:", parseError instanceof Error ? parseError.message : "Parse error");
              return null;
            }
          }
        }
      }
    }
    console.log("\u26A0\uFE0F JSON appears to be truncated, attempting reconstruction...");
    return reconstructTruncatedJson(response, firstBrace);
  }
  function reconstructTruncatedJson(response, startIndex) {
    try {
      const jsonStr = response.substring(startIndex);
      const lines = jsonStr.split("\n");
      let reconstructed = "";
      let braceCount = 0;
      let inString = false;
      let escapeNext = false;
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        let shouldIncludeLine = true;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (escapeNext) {
            escapeNext = false;
            continue;
          }
          if (char === "\\") {
            escapeNext = true;
            continue;
          }
          if (char === '"') {
            inString = !inString;
            continue;
          }
          if (!inString) {
            if (char === "{") {
              braceCount++;
            } else if (char === "}") {
              braceCount--;
            }
          }
        }
        if (inString || line.trim().endsWith(",") === false && lineIndex < lines.length - 1) {
          break;
        }
        reconstructed += line + "\n";
      }
      while (braceCount > 0) {
        reconstructed += "}\n";
        braceCount--;
      }
      const parsed = JSON.parse(reconstructed.trim());
      console.log("\u2705 Successfully reconstructed truncated JSON");
      return parsed;
    } catch (error) {
      console.log("\u26A0\uFE0F Failed to reconstruct truncated JSON:", error instanceof Error ? error.message : "Unknown error");
      return extractBasicComponentInfo(response);
    }
  }
  function extractBasicComponentInfo(response) {
    try {
      console.log("\u{1F504} Attempting to extract basic component info as fallback...");
      const componentMatch = response.match(/"component":\s*"([^"]+)"/);
      const descriptionMatch = response.match(/"description":\s*"([^"]+)"/);
      if (componentMatch && descriptionMatch) {
        const fallbackData = {
          component: componentMatch[1],
          description: descriptionMatch[1],
          props: [],
          states: ["default"],
          variants: {},
          tokens: { colors: [], spacing: [], typography: [] },
          audit: {
            tokenOpportunities: ["Review and simplify component analysis"]
          },
          mcpReadiness: {
            score: 60,
            strengths: ["Component has basic structure"],
            gaps: ["Analysis was incomplete due to response size"],
            recommendations: ["Simplify component structure", "Use MCP-enhanced analysis for better results"]
          },
          propertyCheatSheet: []
        };
        console.log("\u2705 Extracted basic component info as fallback");
        return fallbackData;
      }
      return null;
    } catch (error) {
      console.log("\u26A0\uFE0F Failed to extract basic component info:", error instanceof Error ? error.message : "Unknown error");
      return null;
    }
  }
  function extractJsonBetweenDelimiters(response) {
    const delimiters = [
      ["```json", "```"],
      ["```", "```"],
      ["JSON:", "\n\n"],
      ["Response:", "\n\n"],
      ["{", "}\n"]
    ];
    for (const [start, end] of delimiters) {
      const startIndex = response.indexOf(start);
      if (startIndex === -1) continue;
      const jsonStart = startIndex + start.length;
      let endIndex = response.indexOf(end, jsonStart);
      if (endIndex === -1 && end === "\n\n") {
        endIndex = response.length;
      }
      if (endIndex === -1) continue;
      const jsonStr = response.substring(jsonStart, endIndex).trim();
      try {
        return JSON.parse(jsonStr);
      } catch (parseError) {
        if (jsonStr.startsWith("{")) {
          try {
            return extractBalancedJson(jsonStr);
          } catch (balancedError) {
            continue;
          }
        }
      }
    }
    return null;
  }
  function extractJsonFromCodeBlocks(response) {
    const codeBlockRegex = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/gi;
    let match;
    while ((match = codeBlockRegex.exec(response)) !== null) {
      try {
        return JSON.parse(match[1]);
      } catch (parseError) {
        continue;
      }
    }
    return null;
  }
  function extractJsonWithRegex(response) {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return null;
  }
  function filterDevelopmentRecommendations(data) {
    if (!data || typeof data !== "object") return data;
    const developmentKeywords = [
      "aria",
      "accessibility api",
      "semantic html",
      "keyboard navigation",
      "event handler",
      "interactive behavior",
      "onclick",
      "onchange",
      "state management",
      "controlled component",
      "uncontrolled component",
      "props",
      "responsive breakpoint",
      "css implementation",
      "@media",
      "animation token",
      "transition timing",
      "programmatic animation",
      "keyframe",
      "api integration",
      "data binding",
      "dynamic content",
      "fetch",
      "axios",
      "implement",
      "add handler",
      "bind event",
      "attach listener",
      "programming pattern",
      "functional pattern",
      "react hook",
      "usestate",
      "useeffect"
    ];
    const isDevelopmentFocused = (text) => {
      const lowerText = text.toLowerCase();
      return developmentKeywords.some((keyword) => lowerText.includes(keyword));
    };
    const filterRecommendationArray = (arr) => {
      if (!Array.isArray(arr)) return arr;
      return arr.filter((item) => {
        if (typeof item === "string") {
          const filtered = !isDevelopmentFocused(item);
          if (!filtered) {
            console.log("\u{1F6AB} [FILTER] Removed development-focused recommendation:", item);
          }
          return filtered;
        }
        return true;
      });
    };
    const filteredData = JSON.parse(JSON.stringify(data));
    if (filteredData.mcpReadiness) {
      if (filteredData.mcpReadiness.recommendations) {
        filteredData.mcpReadiness.recommendations = filterRecommendationArray(filteredData.mcpReadiness.recommendations);
      }
      if (filteredData.mcpReadiness.gaps) {
        filteredData.mcpReadiness.gaps = filterRecommendationArray(filteredData.mcpReadiness.gaps);
      }
    }
    if (filteredData.audit) {
      if (filteredData.audit.tokenOpportunities) {
        filteredData.audit.tokenOpportunities = filterRecommendationArray(filteredData.audit.tokenOpportunities);
      }
      if (filteredData.audit.structureIssues) {
        filteredData.audit.structureIssues = filterRecommendationArray(filteredData.audit.structureIssues);
      }
    }
    if (filteredData.accessibility) {
      if (filteredData.accessibility.designConsiderations) {
        filteredData.accessibility.designConsiderations = filterRecommendationArray(filteredData.accessibility.designConsiderations);
      }
      if (filteredData.accessibility.visualIndicators) {
        filteredData.accessibility.visualIndicators = filterRecommendationArray(filteredData.accessibility.visualIndicators);
      }
    }
    return filteredData;
  }

  // src/api/providers/types.ts
  var LLMError = class extends Error {
    constructor(message, code, statusCode, retryAfter) {
      super(message);
      this.code = code;
      this.statusCode = statusCode;
      this.retryAfter = retryAfter;
      this.name = "LLMError";
    }
  };
  var DEFAULT_MODELS = {
    anthropic: "claude-sonnet-4-5-20250929",
    openai: "gpt-5.2",
    google: "gemini-2.5-pro"
  };

  // src/api/providers/anthropic.ts
  var ANTHROPIC_MODELS = [
    {
      id: "claude-opus-4-5-20251218",
      name: "Claude Opus 4.5",
      description: "Flagship model - Most capable, best for complex analysis and reasoning",
      contextWindow: 2e5,
      isDefault: false
    },
    {
      id: "claude-sonnet-4-5-20250929",
      name: "Claude Sonnet 4.5",
      description: "Standard model - Balanced performance and cost, recommended for most tasks",
      contextWindow: 2e5,
      isDefault: true
    },
    {
      id: "claude-haiku-4-5-20251001",
      name: "Claude Haiku 4.5",
      description: "Economy model - Fastest responses, ideal for quick analysis",
      contextWindow: 2e5,
      isDefault: false
    }
  ];
  var AnthropicProvider = class {
    constructor() {
      this.name = "Anthropic";
      this.id = "anthropic";
      this.endpoint = "https://api.anthropic.com/v1/messages";
      this.keyPrefix = "sk-ant-";
      this.keyPlaceholder = "sk-ant-...";
      this.models = ANTHROPIC_MODELS;
    }
    /**
     * Format a request for the Anthropic API
     */
    formatRequest(config) {
      const request = {
        model: config.model,
        messages: [
          {
            role: "user",
            content: config.prompt.trim()
          }
        ],
        max_tokens: config.maxTokens
      };
      if (config.temperature !== void 0) {
        request.temperature = config.temperature;
      }
      if (config.additionalParams) {
        Object.assign(request, config.additionalParams);
      }
      return request;
    }
    /**
     * Parse Anthropic API response into standardized format
     */
    parseResponse(response) {
      const anthropicResponse = response;
      if (!anthropicResponse.content || !Array.isArray(anthropicResponse.content)) {
        throw new LLMError(
          "Invalid response format from Anthropic API: missing content array",
          "INVALID_REQUEST" /* INVALID_REQUEST */
        );
      }
      const textContent = anthropicResponse.content.filter((block) => block.type === "text").map((block) => block.text).join("\n");
      if (!textContent) {
        throw new LLMError(
          "Invalid response format from Anthropic API: no text content found",
          "INVALID_REQUEST" /* INVALID_REQUEST */
        );
      }
      return {
        content: textContent.trim(),
        model: anthropicResponse.model,
        usage: anthropicResponse.usage ? {
          promptTokens: anthropicResponse.usage.input_tokens,
          completionTokens: anthropicResponse.usage.output_tokens,
          totalTokens: anthropicResponse.usage.input_tokens + anthropicResponse.usage.output_tokens
        } : void 0,
        metadata: {
          id: anthropicResponse.id,
          stopReason: anthropicResponse.stop_reason
        }
      };
    }
    /**
     * Validate API key format for Anthropic
     */
    validateApiKey(apiKey) {
      if (!apiKey || typeof apiKey !== "string") {
        return {
          isValid: false,
          error: "API Key Required: Please provide a valid Claude API key."
        };
      }
      const trimmedKey = apiKey.trim();
      if (trimmedKey.length === 0) {
        return {
          isValid: false,
          error: "API Key Required: The Claude API key cannot be empty."
        };
      }
      if (!trimmedKey.startsWith(this.keyPrefix)) {
        return {
          isValid: false,
          error: `Invalid API Key Format: Claude API keys should start with "${this.keyPrefix}". Please check your API key.`
        };
      }
      if (trimmedKey.length < 40) {
        return {
          isValid: false,
          error: "Invalid API Key Format: The API key appears to be too short. Please verify you copied the complete key."
        };
      }
      return { isValid: true };
    }
    /**
     * Get HTTP headers for Anthropic API requests
     */
    getHeaders(apiKey) {
      return {
        "content-type": "application/json",
        "x-api-key": apiKey.trim(),
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      };
    }
    /**
     * Get the default model for Anthropic
     */
    getDefaultModel() {
      const defaultModel = this.models.find((model) => model.isDefault);
      return defaultModel || this.models[1];
    }
    /**
     * Handle Anthropic-specific error responses
     */
    handleError(statusCode, response) {
      var _a;
      const errorResponse = response;
      const errorMessage = ((_a = errorResponse == null ? void 0 : errorResponse.error) == null ? void 0 : _a.message) || (typeof response === "string" ? response : "Unknown error");
      switch (statusCode) {
        case 400:
          return new LLMError(
            `Claude API Error (400): ${errorMessage}. Please check your request format.`,
            "INVALID_REQUEST" /* INVALID_REQUEST */,
            400
          );
        case 401:
          return new LLMError(
            "Claude API Error (401): Invalid API key. Please check your Claude API key in settings.",
            "INVALID_API_KEY" /* INVALID_API_KEY */,
            401
          );
        case 403:
          return new LLMError(
            "Claude API Error (403): Access forbidden. Please check your API key permissions.",
            "INVALID_API_KEY" /* INVALID_API_KEY */,
            403
          );
        case 404:
          return new LLMError(
            `Claude API Error (404): ${errorMessage}. The requested model may not be available.`,
            "MODEL_NOT_FOUND" /* MODEL_NOT_FOUND */,
            404
          );
        case 429:
          return new LLMError(
            "Claude API Error (429): Rate limit exceeded. Please try again later.",
            "RATE_LIMIT_EXCEEDED" /* RATE_LIMIT_EXCEEDED */,
            429
          );
        case 500:
          return new LLMError(
            "Claude API Error (500): Server error. The Claude API is experiencing issues. Please try again later.",
            "SERVER_ERROR" /* SERVER_ERROR */,
            500
          );
        case 503:
          return new LLMError(
            "Claude API Error (503): Service unavailable. The Claude API is temporarily down. Please try again later.",
            "SERVICE_UNAVAILABLE" /* SERVICE_UNAVAILABLE */,
            503
          );
        default:
          return new LLMError(
            `Claude API Error (${statusCode}): ${errorMessage}`,
            "UNKNOWN_ERROR" /* UNKNOWN_ERROR */,
            statusCode
          );
      }
    }
  };
  var anthropicProvider = new AnthropicProvider();

  // src/api/providers/openai.ts
  var OPENAI_MODELS = [
    {
      id: "gpt-5.2",
      name: "GPT-5.2",
      description: "Flagship model with advanced reasoning capabilities",
      contextWindow: 128e3,
      isDefault: true
    },
    {
      id: "gpt-5.2-pro",
      name: "GPT-5.2 Pro",
      description: "Premium model with extended reasoning for complex tasks",
      contextWindow: 128e3,
      isDefault: false
    },
    {
      id: "gpt-5-mini",
      name: "GPT-5 Mini",
      description: "Economy model - fast and cost-effective",
      contextWindow: 128e3,
      isDefault: false
    }
  ];
  var OpenAIProviderClass = class {
    constructor() {
      this.name = "OpenAI";
      this.id = "openai";
      this.endpoint = "https://api.openai.com/v1/chat/completions";
      this.keyPrefix = "sk-";
      this.keyPlaceholder = "sk-...";
      this.models = OPENAI_MODELS;
    }
    /**
     * Format a request for OpenAI's chat completions API
     */
    formatRequest(config) {
      const request = {
        model: config.model,
        messages: [
          {
            role: "user",
            content: config.prompt
          }
        ],
        max_completion_tokens: config.maxTokens,
        temperature: config.temperature
      };
      if (config.additionalParams) {
        Object.assign(request, config.additionalParams);
      }
      return request;
    }
    /**
     * Parse OpenAI's response into standardized format
     */
    parseResponse(response) {
      const openaiResponse = response;
      if (!openaiResponse.choices || openaiResponse.choices.length === 0) {
        throw new LLMError(
          "Invalid response format: no choices returned",
          "INVALID_REQUEST" /* INVALID_REQUEST */
        );
      }
      const choice = openaiResponse.choices[0];
      if (!choice.message || typeof choice.message.content !== "string") {
        throw new LLMError(
          "Invalid response format: missing message content",
          "INVALID_REQUEST" /* INVALID_REQUEST */
        );
      }
      const result = {
        content: choice.message.content.trim(),
        model: openaiResponse.model
      };
      if (openaiResponse.usage) {
        result.usage = {
          promptTokens: openaiResponse.usage.prompt_tokens,
          completionTokens: openaiResponse.usage.completion_tokens,
          totalTokens: openaiResponse.usage.total_tokens
        };
      }
      result.metadata = {
        id: openaiResponse.id,
        finishReason: choice.finish_reason,
        created: openaiResponse.created
      };
      return result;
    }
    /**
     * Validate OpenAI API key format
     */
    validateApiKey(apiKey) {
      if (!apiKey || typeof apiKey !== "string") {
        return {
          isValid: false,
          error: "API Key Required: Please provide a valid OpenAI API key."
        };
      }
      const trimmedKey = apiKey.trim();
      if (trimmedKey.length === 0) {
        return {
          isValid: false,
          error: "API Key Required: The OpenAI API key cannot be empty."
        };
      }
      if (!trimmedKey.startsWith(this.keyPrefix)) {
        return {
          isValid: false,
          error: `Invalid API Key Format: OpenAI API keys should start with "${this.keyPrefix}". Please check your API key.`
        };
      }
      if (trimmedKey.length < 20) {
        return {
          isValid: false,
          error: "Invalid API Key Format: The API key appears to be too short. Please verify you copied the complete key."
        };
      }
      return { isValid: true };
    }
    /**
     * Get headers required for OpenAI API requests
     */
    getHeaders(apiKey) {
      return {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey.trim()}`
      };
    }
    /**
     * Get the default model for OpenAI
     */
    getDefaultModel() {
      const defaultModel = this.models.find((model) => model.isDefault);
      return defaultModel || this.models[0];
    }
    /**
     * Handle OpenAI-specific error responses
     */
    handleError(statusCode, response) {
      var _a;
      const errorResponse = response;
      const errorMessage = ((_a = errorResponse == null ? void 0 : errorResponse.error) == null ? void 0 : _a.message) || (errorResponse == null ? void 0 : errorResponse.message) || "Unknown error occurred";
      switch (statusCode) {
        case 400:
          if (errorMessage.toLowerCase().includes("context_length_exceeded") || errorMessage.toLowerCase().includes("maximum context length")) {
            return new LLMError(
              `OpenAI API Error (400): Context length exceeded. ${errorMessage}`,
              "CONTEXT_LENGTH_EXCEEDED" /* CONTEXT_LENGTH_EXCEEDED */,
              statusCode
            );
          }
          return new LLMError(
            `OpenAI API Error (400): ${errorMessage}. Please check your request format.`,
            "INVALID_REQUEST" /* INVALID_REQUEST */,
            statusCode
          );
        case 401:
          return new LLMError(
            "OpenAI API Error (401): Invalid API key. Please check your OpenAI API key in settings.",
            "INVALID_API_KEY" /* INVALID_API_KEY */,
            statusCode
          );
        case 403:
          return new LLMError(
            "OpenAI API Error (403): Access forbidden. Please check your API key permissions or account status.",
            "INVALID_API_KEY" /* INVALID_API_KEY */,
            statusCode
          );
        case 404:
          return new LLMError(
            `OpenAI API Error (404): Model not found. ${errorMessage}`,
            "MODEL_NOT_FOUND" /* MODEL_NOT_FOUND */,
            statusCode
          );
        case 429:
          const retryMatch = errorMessage.match(/try again in (\d+)/i);
          const retryAfter = retryMatch ? parseInt(retryMatch[1], 10) : void 0;
          return new LLMError(
            `OpenAI API Error (429): Rate limit exceeded. ${retryAfter ? `Please try again in ${retryAfter} seconds.` : "Please try again later."}`,
            "RATE_LIMIT_EXCEEDED" /* RATE_LIMIT_EXCEEDED */,
            statusCode,
            retryAfter
          );
        case 500:
          return new LLMError(
            "OpenAI API Error (500): Server error. The OpenAI API is experiencing issues. Please try again later.",
            "SERVER_ERROR" /* SERVER_ERROR */,
            statusCode
          );
        case 502:
          return new LLMError(
            "OpenAI API Error (502): Bad gateway. The OpenAI API is temporarily unavailable. Please try again later.",
            "SERVICE_UNAVAILABLE" /* SERVICE_UNAVAILABLE */,
            statusCode
          );
        case 503:
          return new LLMError(
            "OpenAI API Error (503): Service unavailable. The OpenAI API is temporarily down. Please try again later.",
            "SERVICE_UNAVAILABLE" /* SERVICE_UNAVAILABLE */,
            statusCode
          );
        case 504:
          return new LLMError(
            "OpenAI API Error (504): Gateway timeout. The request took too long. Please try again.",
            "SERVICE_UNAVAILABLE" /* SERVICE_UNAVAILABLE */,
            statusCode
          );
        default:
          return new LLMError(
            `OpenAI API Error (${statusCode}): ${errorMessage}`,
            "UNKNOWN_ERROR" /* UNKNOWN_ERROR */,
            statusCode
          );
      }
    }
  };
  var OpenAIProvider = new OpenAIProviderClass();

  // src/api/providers/google.ts
  var GOOGLE_MODELS = [
    {
      id: "gemini-3-pro-preview",
      name: "Gemini 3 Pro",
      description: "Flagship model with advanced reasoning and multimodal capabilities",
      contextWindow: 1e6,
      isDefault: true
    },
    {
      id: "gemini-2.5-pro",
      name: "Gemini 2.5 Pro",
      description: "Standard reasoning model with excellent performance",
      contextWindow: 1e6,
      isDefault: false
    },
    {
      id: "gemini-2.5-flash",
      name: "Gemini 2.5 Flash",
      description: "Economy model optimized for speed and efficiency",
      contextWindow: 1e6,
      isDefault: false
    }
  ];
  var GoogleProvider = class {
    constructor() {
      this.name = "Google";
      this.id = "google";
      this.endpoint = "https://generativelanguage.googleapis.com/v1beta/models";
      this.keyPrefix = "AIza";
      this.keyPlaceholder = "AIza...";
      this.models = GOOGLE_MODELS;
    }
    /**
     * Format a request for the Gemini API
     *
     * Gemini uses a different request structure than OpenAI/Anthropic:
     * - contents: Array of content objects with parts
     * - generationConfig: Configuration for the generation
     *
     * @param config - Request configuration
     * @returns Formatted request body for Gemini API
     */
    formatRequest(config) {
      const request = {
        contents: [
          {
            parts: [
              {
                text: config.prompt
              }
            ]
          }
        ],
        generationConfig: {
          maxOutputTokens: config.maxTokens,
          temperature: config.temperature
        }
      };
      if (config.additionalParams) {
        const { topP, topK, stopSequences } = config.additionalParams;
        if (topP !== void 0) {
          request.generationConfig.topP = topP;
        }
        if (topK !== void 0) {
          request.generationConfig.topK = topK;
        }
        if (stopSequences !== void 0) {
          request.generationConfig.stopSequences = stopSequences;
        }
      }
      return request;
    }
    /**
     * Parse Gemini API response into standardized format
     *
     * Gemini response structure:
     * {
     *   candidates: [{
     *     content: {
     *       parts: [{ text: "..." }]
     *     }
     *   }],
     *   usageMetadata: { ... }
     * }
     *
     * @param response - Raw API response
     * @returns Standardized LLM response
     * @throws Error if response format is invalid
     */
    parseResponse(response) {
      var _a;
      const geminiResponse = response;
      if (geminiResponse.error) {
        throw new LLMError(
          geminiResponse.error.message || "Unknown Gemini API error",
          this.mapErrorCodeToLLMErrorCode(geminiResponse.error.code, geminiResponse.error.status),
          geminiResponse.error.code
        );
      }
      if (!geminiResponse.candidates || geminiResponse.candidates.length === 0) {
        const keys = Object.keys(geminiResponse);
        throw new LLMError(
          `No candidates in Gemini response. Response keys: [${keys.join(", ")}]${geminiResponse.error ? `. Error: ${geminiResponse.error.message}` : ""}`,
          "INVALID_REQUEST" /* INVALID_REQUEST */
        );
      }
      const candidate = geminiResponse.candidates[0];
      if (candidate.finishReason === "SAFETY") {
        throw new LLMError(
          "Gemini response blocked by safety filters. Try rephrasing the prompt.",
          "INVALID_REQUEST" /* INVALID_REQUEST */
        );
      }
      const parts = (_a = candidate.content) == null ? void 0 : _a.parts;
      if (!parts || parts.length === 0) {
        throw new LLMError(
          `No content parts in Gemini response. Finish reason: ${candidate.finishReason || "unknown"}. Has content: ${!!candidate.content}`,
          "INVALID_REQUEST" /* INVALID_REQUEST */
        );
      }
      const textPart = parts.find((p) => typeof p.text === "string");
      if (!textPart || !textPart.text) {
        const partTypes = parts.map((p) => Object.keys(p).join(",")).join("; ");
        throw new LLMError(
          `No text content in Gemini response parts. Part types: [${partTypes}]. Finish reason: ${candidate.finishReason || "unknown"}`,
          "INVALID_REQUEST" /* INVALID_REQUEST */
        );
      }
      const text = textPart.text;
      const llmResponse = {
        content: text,
        model: "gemini"
        // Model info not always returned in response
      };
      if (geminiResponse.usageMetadata) {
        llmResponse.usage = {
          promptTokens: geminiResponse.usageMetadata.promptTokenCount || 0,
          completionTokens: geminiResponse.usageMetadata.candidatesTokenCount || 0,
          totalTokens: geminiResponse.usageMetadata.totalTokenCount || 0
        };
      }
      return llmResponse;
    }
    /**
     * Validate Google API key format
     *
     * Google API keys:
     * - Start with 'AIza'
     * - Are typically 39 characters long
     * - Contain alphanumeric characters and underscores
     *
     * @param apiKey - The API key to validate
     * @returns Validation result
     */
    validateApiKey(apiKey) {
      if (!apiKey || typeof apiKey !== "string") {
        return {
          isValid: false,
          error: "API key is required"
        };
      }
      const trimmedKey = apiKey.trim();
      if (trimmedKey.length === 0) {
        return {
          isValid: false,
          error: "API key cannot be empty"
        };
      }
      if (!trimmedKey.startsWith(this.keyPrefix)) {
        return {
          isValid: false,
          error: `Google API keys should start with "${this.keyPrefix}". Please check your API key.`
        };
      }
      if (trimmedKey.length < 30 || trimmedKey.length > 50) {
        return {
          isValid: false,
          error: "API key appears to have an invalid length. Please verify you copied the complete key."
        };
      }
      if (!/^[A-Za-z0-9_-]+$/.test(trimmedKey)) {
        return {
          isValid: false,
          error: "API key contains invalid characters"
        };
      }
      return { isValid: true };
    }
    /**
     * Get headers for API requests
     *
     * Note: Google uses URL-based authentication, so the API key is not
     * included in headers. It is appended to the URL instead.
     *
     * @param _apiKey - The API key (not used in headers for Google)
     * @returns Request headers
     */
    getHeaders(_apiKey) {
      return {
        "Content-Type": "application/json"
      };
    }
    /**
     * Get the full endpoint URL for a specific model and API key
     *
     * Google's API uses URL-based authentication:
     * https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={API_KEY}
     *
     * @param model - The model ID to use
     * @param apiKey - The API key for authentication
     * @returns Full endpoint URL with API key
     */
    getEndpoint(model, apiKey) {
      const trimmedKey = apiKey.trim();
      return `${this.endpoint}/${model}:generateContent?key=${trimmedKey}`;
    }
    /**
     * Get the default model for this provider
     *
     * @returns The default Gemini model
     */
    getDefaultModel() {
      const defaultModel = this.models.find((m) => m.isDefault);
      return defaultModel || this.models[0];
    }
    /**
     * Handle provider-specific error responses
     *
     * @param statusCode - HTTP status code
     * @param response - Error response body
     * @returns Formatted LLMError
     */
    handleError(statusCode, response) {
      var _a, _b;
      const errorResponse = response;
      const errorInfo = errorResponse == null ? void 0 : errorResponse.error;
      const message = (errorInfo == null ? void 0 : errorInfo.message) || "Unknown Google API error";
      const status = errorInfo == null ? void 0 : errorInfo.status;
      const code = (errorInfo == null ? void 0 : errorInfo.code) || statusCode;
      const llmErrorCode = this.mapErrorCodeToLLMErrorCode(code, status);
      let retryAfter;
      if (statusCode === 429) {
        retryAfter = 6e4;
        const retryDetail = (_a = errorInfo == null ? void 0 : errorInfo.details) == null ? void 0 : _a.find(
          (d) => {
            var _a2;
            return (_a2 = d["@type"]) == null ? void 0 : _a2.includes("RetryInfo");
          }
        );
        if ((_b = retryDetail == null ? void 0 : retryDetail.metadata) == null ? void 0 : _b.retryDelay) {
          const delayMatch = retryDetail.metadata.retryDelay.match(/(\d+)s/);
          if (delayMatch) {
            retryAfter = parseInt(delayMatch[1], 10) * 1e3;
          }
        }
      }
      let userMessage = message;
      switch (llmErrorCode) {
        case "INVALID_API_KEY" /* INVALID_API_KEY */:
          userMessage = "Google API Error: Invalid API key. Please check your API key in settings.";
          break;
        case "RATE_LIMIT_EXCEEDED" /* RATE_LIMIT_EXCEEDED */:
          userMessage = `Google API Error: Rate limit exceeded. ${retryAfter ? `Please try again in ${Math.ceil(retryAfter / 1e3)} seconds.` : "Please try again later."}`;
          break;
        case "MODEL_NOT_FOUND" /* MODEL_NOT_FOUND */:
          userMessage = "Google API Error: Model not found. Please select a valid model.";
          break;
        case "CONTEXT_LENGTH_EXCEEDED" /* CONTEXT_LENGTH_EXCEEDED */:
          userMessage = "Google API Error: Input too long. Please reduce the size of your request.";
          break;
        case "SERVER_ERROR" /* SERVER_ERROR */:
          userMessage = "Google API Error: Server error. Please try again later.";
          break;
        case "SERVICE_UNAVAILABLE" /* SERVICE_UNAVAILABLE */:
          userMessage = "Google API Error: Service temporarily unavailable. Please try again later.";
          break;
      }
      return new LLMError(userMessage, llmErrorCode, statusCode, retryAfter);
    }
    /**
     * Map Google error codes/status to LLMErrorCode
     *
     * @param code - HTTP status code or Google error code
     * @param status - Google error status string
     * @returns Appropriate LLMErrorCode
     */
    mapErrorCodeToLLMErrorCode(code, status) {
      if (status) {
        const statusUpper = status.toUpperCase();
        if (statusUpper === "INVALID_ARGUMENT") {
          return "INVALID_REQUEST" /* INVALID_REQUEST */;
        }
        if (statusUpper === "PERMISSION_DENIED" || statusUpper === "UNAUTHENTICATED") {
          return "INVALID_API_KEY" /* INVALID_API_KEY */;
        }
        if (statusUpper === "NOT_FOUND") {
          return "MODEL_NOT_FOUND" /* MODEL_NOT_FOUND */;
        }
        if (statusUpper === "RESOURCE_EXHAUSTED") {
          return "RATE_LIMIT_EXCEEDED" /* RATE_LIMIT_EXCEEDED */;
        }
        if (statusUpper === "UNAVAILABLE") {
          return "SERVICE_UNAVAILABLE" /* SERVICE_UNAVAILABLE */;
        }
      }
      switch (code) {
        case 400:
          return "INVALID_REQUEST" /* INVALID_REQUEST */;
        case 401:
        case 403:
          return "INVALID_API_KEY" /* INVALID_API_KEY */;
        case 404:
          return "MODEL_NOT_FOUND" /* MODEL_NOT_FOUND */;
        case 429:
          return "RATE_LIMIT_EXCEEDED" /* RATE_LIMIT_EXCEEDED */;
        case 500:
          return "SERVER_ERROR" /* SERVER_ERROR */;
        case 503:
          return "SERVICE_UNAVAILABLE" /* SERVICE_UNAVAILABLE */;
        default:
          return "UNKNOWN_ERROR" /* UNKNOWN_ERROR */;
      }
    }
  };
  var googleProvider = new GoogleProvider();

  // src/api/providers/index.ts
  var providers = {
    anthropic: anthropicProvider,
    openai: OpenAIProvider,
    google: googleProvider
  };
  function getProvider(providerId) {
    const provider = providers[providerId];
    if (!provider) {
      throw new LLMError(
        `Unknown provider: ${providerId}`,
        "INVALID_REQUEST" /* INVALID_REQUEST */,
        400
      );
    }
    return provider;
  }
  async function callProvider(providerId, apiKey, config) {
    var _a, _b;
    const provider = getProvider(providerId);
    const validation = provider.validateApiKey(apiKey);
    if (!validation.isValid) {
      throw new LLMError(
        validation.error || "Invalid API key format",
        "INVALID_API_KEY" /* INVALID_API_KEY */,
        401
      );
    }
    const requestBody = provider.formatRequest(config);
    const headers = provider.getHeaders(apiKey);
    let endpoint = provider.endpoint;
    if (providerId === "google") {
      endpoint = `${provider.endpoint}/${config.model}:generateContent?key=${apiKey.trim()}`;
    }
    try {
      console.log(`Making ${provider.name} API call to ${endpoint}...`);
      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody)
      });
      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch (e) {
          errorData = await response.text();
        }
        throw provider.handleError(response.status, errorData);
      }
      const data = await response.json();
      console.log(`${provider.name} API response status: ${response.status}`);
      console.log(`${provider.name} API response keys:`, Object.keys(data));
      if (providerId === "google") {
        console.log(`Gemini response candidates:`, data.candidates ? data.candidates.length : "none");
        if ((_a = data.candidates) == null ? void 0 : _a[0]) {
          console.log(`Gemini candidate[0] keys:`, Object.keys(data.candidates[0]));
          if (data.candidates[0].content) {
            console.log(`Gemini content parts:`, ((_b = data.candidates[0].content.parts) == null ? void 0 : _b.length) || "none");
          }
        }
        if (data.error) {
          console.log(`Gemini error:`, JSON.stringify(data.error));
        }
      }
      return provider.parseResponse(data);
    } catch (error) {
      if (error instanceof LLMError) {
        throw error;
      }
      if (error instanceof Error) {
        if (error.message.includes("Failed to fetch") || error.message.includes("NetworkError")) {
          throw new LLMError(
            `Network error connecting to ${provider.name}. Please check your internet connection.`,
            "NETWORK_ERROR" /* NETWORK_ERROR */
          );
        }
      }
      throw new LLMError(
        `Unexpected error calling ${provider.name}: ${error instanceof Error ? error.message : "Unknown error"}`,
        "UNKNOWN_ERROR" /* UNKNOWN_ERROR */
      );
    }
  }
  var STORAGE_KEYS = {
    /** Selected provider ID */
    SELECTED_PROVIDER: "selected-provider",
    /** Selected model ID */
    SELECTED_MODEL: "selected-model",
    /** API key storage (per provider) */
    apiKey: (providerId) => `${providerId}-api-key`,
    /** Legacy Claude key (for migration) */
    LEGACY_CLAUDE_KEY: "claude-api-key",
    LEGACY_CLAUDE_MODEL: "claude-model"
  };
  var DEFAULTS = {
    provider: "anthropic",
    model: DEFAULT_MODELS.anthropic
  };
  async function checkLegacyMigration() {
    try {
      const legacyKey = await figma.clientStorage.getAsync(STORAGE_KEYS.LEGACY_CLAUDE_KEY);
      const legacyModel = await figma.clientStorage.getAsync(STORAGE_KEYS.LEGACY_CLAUDE_MODEL);
      if (legacyKey) {
        return {
          needsMigration: true,
          legacyKey,
          legacyModel
        };
      }
      return { needsMigration: false };
    } catch (e) {
      return { needsMigration: false };
    }
  }
  async function migrateLegacyStorage() {
    const migration = await checkLegacyMigration();
    if (!migration.needsMigration) {
      return;
    }
    console.log("Migrating legacy Claude storage to multi-provider format...");
    if (migration.legacyKey) {
      await figma.clientStorage.setAsync(STORAGE_KEYS.apiKey("anthropic"), migration.legacyKey);
    }
    await figma.clientStorage.setAsync(STORAGE_KEYS.SELECTED_PROVIDER, "anthropic");
    if (migration.legacyModel) {
      await figma.clientStorage.setAsync(STORAGE_KEYS.SELECTED_MODEL, migration.legacyModel);
    }
    await figma.clientStorage.deleteAsync(STORAGE_KEYS.LEGACY_CLAUDE_KEY);
    await figma.clientStorage.deleteAsync(STORAGE_KEYS.LEGACY_CLAUDE_MODEL);
    console.log("Migration complete");
  }
  async function loadProviderConfig() {
    await migrateLegacyStorage();
    const providerId = await figma.clientStorage.getAsync(STORAGE_KEYS.SELECTED_PROVIDER) || DEFAULTS.provider;
    const modelId = await figma.clientStorage.getAsync(STORAGE_KEYS.SELECTED_MODEL) || DEFAULT_MODELS[providerId];
    const apiKey = await figma.clientStorage.getAsync(STORAGE_KEYS.apiKey(providerId));
    return { providerId, modelId, apiKey };
  }
  async function saveProviderConfig(providerId, modelId, apiKey) {
    await figma.clientStorage.setAsync(STORAGE_KEYS.SELECTED_PROVIDER, providerId);
    await figma.clientStorage.setAsync(STORAGE_KEYS.SELECTED_MODEL, modelId);
    if (apiKey !== void 0) {
      await figma.clientStorage.setAsync(STORAGE_KEYS.apiKey(providerId), apiKey);
    }
  }
  async function clearProviderKey(providerId) {
    await figma.clientStorage.deleteAsync(STORAGE_KEYS.apiKey(providerId));
  }

  // src/fixes/naming-fixer.ts
  var GENERIC_NAMES = /^(Frame|Rectangle|Ellipse|Group|Vector|Line|Polygon|Star|Text|Component|Instance|Slice|Boolean|Union|Subtract|Intersect|Exclude)\s*\d*$/i;
  var NUMBERED_SUFFIX = /\s+\d+$/;
  var COMPONENT_PREFIXES = {
    button: "btn",
    icon: "ico",
    input: "input",
    text: "txt",
    image: "img",
    container: "container",
    card: "card",
    list: "list",
    "list-item": "list-item",
    nav: "nav",
    header: "header",
    footer: "footer",
    modal: "modal",
    dropdown: "dropdown",
    checkbox: "checkbox",
    radio: "radio",
    toggle: "toggle",
    avatar: "avatar",
    badge: "badge",
    divider: "divider",
    spacer: "spacer",
    link: "link",
    tab: "tab",
    tooltip: "tooltip",
    alert: "alert",
    progress: "progress",
    skeleton: "skeleton",
    unknown: "layer"
  };
  var TYPE_KEYWORD_ENTRIES = [
    ["btn", "button"],
    ["button", "button"],
    ["cta", "button"],
    ["submit", "button"],
    ["icon", "icon"],
    ["ico", "icon"],
    ["glyph", "icon"],
    ["symbol", "icon"],
    ["arrow", "icon"],
    ["chevron", "icon"],
    ["close", "icon"],
    ["plus", "icon"],
    ["minus", "icon"],
    ["txt", "text"],
    ["label", "text"],
    ["title", "text"],
    ["heading", "text"],
    ["paragraph", "text"],
    ["description", "text"],
    ["caption", "text"],
    ["subtitle", "text"],
    ["input", "input"],
    ["field", "input"],
    ["textfield", "input"],
    ["textarea", "input"],
    ["searchfield", "input"],
    ["searchbox", "input"],
    ["image", "image"],
    ["img", "image"],
    ["photo", "image"],
    ["picture", "image"],
    ["thumbnail", "image"],
    ["cover", "image"],
    ["container", "container"],
    ["wrapper", "container"],
    ["content", "container"],
    ["section", "container"],
    ["block", "container"],
    ["box", "container"],
    ["card", "card"],
    ["tile", "card"],
    ["panel", "card"],
    ["list", "list"],
    ["items", "list"],
    ["item", "list-item"],
    ["row", "list-item"],
    ["listitem", "list-item"],
    ["nav", "nav"],
    ["navbar", "nav"],
    ["navigation", "nav"],
    ["sidebar", "nav"],
    ["breadcrumb", "nav"],
    ["menu", "nav"],
    ["header", "header"],
    ["topbar", "header"],
    ["footer", "footer"],
    ["bottombar", "footer"],
    ["modal", "modal"],
    ["dialog", "modal"],
    ["popup", "modal"],
    ["overlay", "modal"],
    ["dropdown", "dropdown"],
    ["select", "dropdown"],
    ["picker", "dropdown"],
    ["combobox", "dropdown"],
    ["checkbox", "checkbox"],
    ["checkmark", "checkbox"],
    ["radio", "radio"],
    ["toggle", "toggle"],
    ["switch", "toggle"],
    ["avatar", "avatar"],
    ["profile", "avatar"],
    ["userpic", "avatar"],
    ["badge", "badge"],
    ["tag", "badge"],
    ["chip", "badge"],
    ["pill", "badge"],
    ["status", "badge"],
    ["divider", "divider"],
    ["separator", "divider"],
    ["hr", "divider"],
    ["spacer", "spacer"],
    ["gap", "spacer"],
    ["link", "link"],
    ["anchor", "link"],
    ["href", "link"],
    ["tab", "tab"],
    ["tabs", "tab"],
    ["tabbar", "tab"],
    ["tooltip", "tooltip"],
    ["hint", "tooltip"],
    ["popover", "tooltip"],
    ["alert", "alert"],
    ["notification", "alert"],
    ["toast", "alert"],
    ["message", "alert"],
    ["snackbar", "alert"],
    ["banner", "alert"],
    ["progress", "progress"],
    ["loader", "progress"],
    ["loading", "progress"],
    ["spinner", "progress"],
    ["progressbar", "progress"],
    ["skeleton", "skeleton"],
    ["placeholder", "skeleton"],
    ["shimmer", "skeleton"]
  ];
  function isGenericName(name) {
    if (!name || typeof name !== "string") {
      return true;
    }
    const trimmedName = name.trim();
    if (GENERIC_NAMES.test(trimmedName)) {
      return true;
    }
    if (trimmedName.length === 1) {
      return true;
    }
    if (/^\d+$/.test(trimmedName)) {
      return true;
    }
    return false;
  }
  function hasNumberedSuffix(name) {
    return NUMBERED_SUFFIX.test(name.trim());
  }
  function detectLayerType(node) {
    const name = node.name.toLowerCase();
    for (let i = 0; i < TYPE_KEYWORD_ENTRIES.length; i++) {
      const entry = TYPE_KEYWORD_ENTRIES[i];
      if (name.indexOf(entry[0]) !== -1) {
        return entry[1];
      }
    }
    switch (node.type) {
      case "TEXT":
        return "text";
      case "VECTOR":
      case "STAR":
      case "POLYGON":
      case "BOOLEAN_OPERATION":
        return "icon";
      case "RECTANGLE":
      case "ELLIPSE":
      case "LINE":
        if ("fills" in node && Array.isArray(node.fills)) {
          const fills = node.fills;
          let hasImageFill = false;
          for (let i = 0; i < fills.length; i++) {
            const fill = fills[i];
            if (fill.type === "IMAGE" && fill.visible !== false) {
              hasImageFill = true;
              break;
            }
          }
          if (hasImageFill) {
            return "image";
          }
        }
        if ("width" in node && "height" in node) {
          const width = node.width;
          const height = node.height;
          const aspectRatio = width / height;
          if (height <= 2 && width > 20) {
            return "divider";
          }
          if (width <= 2 && height > 20) {
            return "divider";
          }
          if (width <= 32 && height <= 32 && aspectRatio > 0.5 && aspectRatio < 2) {
            return "spacer";
          }
        }
        return "unknown";
      case "FRAME":
      case "GROUP":
        return detectFrameType(node);
      case "COMPONENT":
      case "INSTANCE":
        return detectComponentType(node);
      case "COMPONENT_SET":
        return detectComponentSetType(node);
      default:
        return "unknown";
    }
  }
  function detectFrameType(node) {
    if (!("children" in node) || node.children.length === 0) {
      return "container";
    }
    const children = node.children;
    const childTypes = [];
    const childNames = [];
    for (let i = 0; i < children.length; i++) {
      childTypes.push(children[i].type);
      childNames.push(children[i].name.toLowerCase());
    }
    let hasText = false;
    let hasIcon = false;
    for (let i = 0; i < childTypes.length; i++) {
      if (childTypes[i] === "TEXT") {
        hasText = true;
      }
      if (childTypes[i] === "VECTOR" || childNames[i].indexOf("icon") !== -1) {
        hasIcon = true;
      }
    }
    const isSmall = "width" in node && "height" in node && node.width < 300 && node.height < 100;
    if (hasText && isSmall && (hasIcon || children.length <= 3)) {
      if ("layoutMode" in node && node.layoutMode !== "NONE") {
        return "button";
      }
    }
    let hasImage = false;
    for (let i = 0; i < childTypes.length; i++) {
      if (childTypes[i] === "RECTANGLE" || childNames[i].indexOf("image") !== -1) {
        hasImage = true;
        break;
      }
    }
    if (hasText && hasImage && children.length >= 2) {
      return "card";
    }
    if (children.length >= 3) {
      const firstChildType = children[0].type;
      let allSameType = true;
      for (let i = 1; i < children.length; i++) {
        if (children[i].type !== firstChildType) {
          allSameType = false;
          break;
        }
      }
      if (allSameType && (firstChildType === "FRAME" || firstChildType === "INSTANCE")) {
        return "list";
      }
    }
    if ("cornerRadius" in node && node.cornerRadius && children.length <= 2) {
      if (hasText && isSmall) {
        return "input";
      }
    }
    if ("layoutMode" in node && node.layoutMode === "HORIZONTAL") {
      let clickableCount = 0;
      for (let i = 0; i < children.length; i++) {
        const childType = children[i].type;
        if (childType === "FRAME" || childType === "INSTANCE" || childType === "TEXT") {
          clickableCount++;
        }
      }
      if (clickableCount >= 3 && isSmall) {
        return "nav";
      }
    }
    return "container";
  }
  function detectComponentType(node) {
    const name = node.name.toLowerCase();
    for (let i = 0; i < TYPE_KEYWORD_ENTRIES.length; i++) {
      const entry = TYPE_KEYWORD_ENTRIES[i];
      if (name.indexOf(entry[0]) !== -1) {
        return entry[1];
      }
    }
    if ("children" in node) {
      return detectFrameType(node);
    }
    return "unknown";
  }
  function detectComponentSetType(node) {
    const name = node.name.toLowerCase();
    for (let i = 0; i < TYPE_KEYWORD_ENTRIES.length; i++) {
      const entry = TYPE_KEYWORD_ENTRIES[i];
      if (name.indexOf(entry[0]) !== -1) {
        return entry[1];
      }
    }
    if ("children" in node && node.children.length > 0) {
      return detectComponentType(node.children[0]);
    }
    return "unknown";
  }
  function analyzeNamingIssues(node, maxDepth = 10) {
    const issues = [];
    function traverse(currentNode, depth, path) {
      if (depth > maxDepth) {
        return;
      }
      const currentPath = path ? `${path} > ${currentNode.name}` : currentNode.name;
      const layerType = detectLayerType(currentNode);
      if (isGenericName(currentNode.name)) {
        const suggestedName = suggestLayerName(currentNode);
        issues.push({
          nodeId: currentNode.id,
          nodeName: currentNode.name,
          currentName: currentNode.name,
          suggestedName,
          severity: "error",
          reason: "Generic layer name detected",
          layerType,
          depth,
          path: currentPath
        });
      } else if (hasNumberedSuffix(currentNode.name)) {
        const baseName = currentNode.name.replace(NUMBERED_SUFFIX, "").trim();
        const suggestedName = suggestLayerName(currentNode);
        issues.push({
          nodeId: currentNode.id,
          nodeName: currentNode.name,
          currentName: currentNode.name,
          suggestedName: suggestedName !== currentNode.name ? suggestedName : baseName,
          severity: "warning",
          reason: "Layer name has numbered suffix (possible duplicate)",
          layerType,
          depth,
          path: currentPath
        });
      }
      if ("children" in currentNode) {
        for (let i = 0; i < currentNode.children.length; i++) {
          traverse(currentNode.children[i], depth + 1, currentPath);
        }
      }
    }
    traverse(node, 0, "");
    return issues;
  }
  function suggestLayerName(node) {
    const layerType = detectLayerType(node);
    if (node.type === "TEXT") {
      return generateTextName(node);
    }
    if (node.type === "VECTOR" || node.type === "STAR" || node.type === "POLYGON" || node.type === "BOOLEAN_OPERATION") {
      return generateIconName(node);
    }
    if ("children" in node && node.children.length > 0) {
      return generateContainerName(node);
    }
    return COMPONENT_PREFIXES[layerType] || "layer";
  }
  function generateIconName(node) {
    const name = node.name.toLowerCase();
    const meaningfulPart = name.replace(GENERIC_NAMES, "").replace(/[_\-\s]+/g, "-").replace(/^-|-$/g, "").trim();
    if (meaningfulPart && meaningfulPart.length > 1) {
      return `icon-${toKebabCase(meaningfulPart)}`;
    }
    if ("children" in node && node.children.length > 0) {
      const childTypes = [];
      for (let i = 0; i < node.children.length; i++) {
        childTypes.push(node.children[i].type);
      }
      for (let i = 0; i < childTypes.length; i++) {
        if (childTypes[i] === "ELLIPSE") {
          return "icon-circle";
        }
        if (childTypes[i] === "STAR") {
          return "icon-star";
        }
        if (childTypes[i] === "POLYGON") {
          return "icon-shape";
        }
      }
    }
    if ("width" in node && "height" in node) {
      const aspectRatio = node.width / node.height;
      if (aspectRatio > 1.5 || aspectRatio < 0.67) {
        return "icon-arrow";
      }
    }
    return "icon";
  }
  function generateTextName(node) {
    const text = node.characters || "";
    const trimmedText = text.trim();
    if (!trimmedText) {
      return "text-empty";
    }
    const words = trimmedText.split(/\s+/);
    if (words.length <= 2 && trimmedText.length <= 30) {
      const kebab = toKebabCase(trimmedText);
      if (kebab) {
        return `text-${kebab}`;
      }
      return "text-content";
    }
    const firstWord = words[0].toLowerCase();
    const headingKeywords = ["welcome", "about", "contact", "services", "features", "pricing"];
    const labelKeywords = ["name", "email", "password", "username", "address", "phone"];
    const buttonKeywords = ["submit", "cancel", "save", "delete", "edit", "add", "remove", "ok", "yes", "no"];
    const linkKeywords = ["learn", "read", "view", "see", "click", "here", "more"];
    const errorKeywords = ["error", "invalid", "required", "failed", "wrong"];
    const successKeywords = ["success", "done", "complete", "saved", "updated"];
    const lowerText = trimmedText.toLowerCase();
    for (let i = 0; i < headingKeywords.length; i++) {
      if (firstWord.indexOf(headingKeywords[i]) !== -1 || lowerText.indexOf(headingKeywords[i]) !== -1) {
        return `text-heading-${toKebabCase(words.slice(0, 2).join(" "))}`;
      }
    }
    for (let i = 0; i < labelKeywords.length; i++) {
      if (firstWord.indexOf(labelKeywords[i]) !== -1 || lowerText.indexOf(labelKeywords[i]) !== -1) {
        return `text-label-${toKebabCase(words.slice(0, 2).join(" "))}`;
      }
    }
    for (let i = 0; i < buttonKeywords.length; i++) {
      if (firstWord.indexOf(buttonKeywords[i]) !== -1 || lowerText.indexOf(buttonKeywords[i]) !== -1) {
        return `text-button-${toKebabCase(words.slice(0, 2).join(" "))}`;
      }
    }
    for (let i = 0; i < linkKeywords.length; i++) {
      if (firstWord.indexOf(linkKeywords[i]) !== -1 || lowerText.indexOf(linkKeywords[i]) !== -1) {
        return `text-link-${toKebabCase(words.slice(0, 2).join(" "))}`;
      }
    }
    for (let i = 0; i < errorKeywords.length; i++) {
      if (firstWord.indexOf(errorKeywords[i]) !== -1 || lowerText.indexOf(errorKeywords[i]) !== -1) {
        return `text-error-${toKebabCase(words.slice(0, 2).join(" "))}`;
      }
    }
    for (let i = 0; i < successKeywords.length; i++) {
      if (firstWord.indexOf(successKeywords[i]) !== -1 || lowerText.indexOf(successKeywords[i]) !== -1) {
        return `text-success-${toKebabCase(words.slice(0, 2).join(" "))}`;
      }
    }
    const defaultKebab = toKebabCase(words.slice(0, 2).join(" "));
    return defaultKebab ? `text-${defaultKebab}` : "text-content";
  }
  function generateContainerName(node) {
    const layerType = detectLayerType(node);
    const prefix = COMPONENT_PREFIXES[layerType];
    if ("children" in node && node.children.length > 0) {
      let textChild;
      for (let i = 0; i < node.children.length; i++) {
        if (node.children[i].type === "TEXT") {
          textChild = node.children[i];
          break;
        }
      }
      if (textChild && textChild.characters) {
        const text = textChild.characters.trim();
        const words = text.split(/\s+/).slice(0, 2);
        if (words.length > 0 && words[0].length > 0) {
          return `${prefix}-${toKebabCase(words.join(" "))}`;
        }
      }
      if (layerType === "button" || layerType === "input") {
        let iconChild;
        for (let i = 0; i < node.children.length; i++) {
          const child = node.children[i];
          if (child.type === "VECTOR" || child.name.toLowerCase().indexOf("icon") !== -1) {
            iconChild = child;
            break;
          }
        }
        if (iconChild) {
          const iconName = iconChild.name.toLowerCase().replace(/icon[-_\s]*/gi, "");
          if (iconName && !isGenericName(iconName)) {
            return `${prefix}-${toKebabCase(iconName)}`;
          }
        }
      }
    }
    return prefix;
  }
  function renameLayer(node, newName) {
    if (!node || !newName || typeof newName !== "string") {
      return false;
    }
    const trimmedName = newName.trim();
    if (trimmedName.length === 0) {
      return false;
    }
    try {
      node.name = trimmedName;
      return true;
    } catch (error) {
      console.error("Failed to rename layer:", error);
      return false;
    }
  }
  function previewRename(node, newName) {
    return {
      nodeId: node.id,
      currentName: node.name,
      newName: newName.trim(),
      layerType: detectLayerType(node),
      willChange: node.name !== newName.trim()
    };
  }
  function toKebabCase(str) {
    return str.replace(/([a-z])([A-Z])/g, "$1-$2").replace(/[\s_]+/g, "-").replace(/[^a-zA-Z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  }

  // src/core/component-analyzer.ts
  async function extractComponentContext(node) {
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
    const additionalContext = await extractAdditionalContext(node);
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
  async function extractAdditionalContext(node) {
    const context = {
      hasInteractiveElements: false,
      possibleUseCase: "",
      designPatterns: [],
      componentFamily: "",
      suggestedConsiderations: []
    };
    const nodeName = node.name.toLowerCase();
    const containerPatterns = [
      "tabs",
      "tab-group",
      "tabset",
      "nav",
      "navbar",
      "navigation",
      "menu",
      "menubar",
      "dropdown",
      "form",
      "form-group",
      "fieldset",
      "list",
      "grid",
      "collection",
      "gallery",
      "group",
      "container",
      "wrapper",
      "layout",
      "toolbar",
      "panel",
      "sidebar",
      "header",
      "footer",
      "card-group",
      "button-group",
      "radio-group",
      "checkbox-group"
    ];
    const isContainerByName = containerPatterns.some((pattern) => nodeName.includes(pattern));
    const isContainerByStructure = await analyzeContainerStructure(node);
    const isContainer = isContainerByName || isContainerByStructure;
    console.log(`\u{1F50D} [CONTAINER DETECTION] ${node.name}:`);
    console.log(`  Name-based: ${isContainerByName}`);
    console.log(`  Structure-based: ${isContainerByStructure}`);
    console.log(`  Final result: ${isContainer}`);
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
    } else if (isContainer) {
      context.componentFamily = "container";
      context.possibleUseCase = "Layout container for organizing child components";
      context.hasInteractiveElements = false;
      context.suggestedConsiderations.push("Focus on layout and organization rather than interaction states");
      context.suggestedConsiderations.push("Child components handle individual interactions");
      context.designPatterns.push("layout-container", "component-organization");
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
  async function analyzeContainerStructure(node) {
    if (!("children" in node) || !node.children || node.children.length === 0) {
      return false;
    }
    const childInstances = node.children.filter((child) => child.type === "INSTANCE");
    if (childInstances.length === 0) {
      console.log(`\u{1F50D} [STRUCTURE] No child instances found in ${node.name}`);
      return false;
    }
    console.log(`\u{1F50D} [STRUCTURE] Analyzing ${node.name} with ${childInstances.length} child instances`);
    const instanceGroups = /* @__PURE__ */ new Map();
    await Promise.all(childInstances.map(async (instance) => {
      try {
        const mainComponent = await instance.getMainComponentAsync();
        if (mainComponent) {
          const componentName = mainComponent.name;
          if (!instanceGroups.has(componentName)) {
            instanceGroups.set(componentName, []);
          }
          instanceGroups.get(componentName).push(instance);
        }
      } catch (error) {
        console.log(`\u26A0\uFE0F [STRUCTURE] Could not access main component for instance:`, error);
      }
    }));
    console.log(`\u{1F50D} [STRUCTURE] Instance groups:`, Array.from(instanceGroups.entries()).map(([name, instances]) => `${name}: ${instances.length}`));
    const hasRepeatedComponents = Array.from(instanceGroups.values()).some((group) => group.length > 1);
    const hasOrganizationalComponents = Array.from(instanceGroups.keys()).some((name) => {
      const lowerName = name.toLowerCase();
      return lowerName.includes("item") || lowerName.includes("panel") || lowerName.includes("content") || lowerName.includes("section") || lowerName.includes("group") || lowerName.includes("wrapper") || // Tab-specific patterns
      lowerName.includes("tab") && !lowerName.includes("button") || // Navigation patterns
      lowerName.includes("nav-item") || lowerName.includes("menu-item") || // List patterns
      lowerName.includes("list-item") || // Card patterns
      lowerName.includes("card-item");
    });
    const instanceRatio = childInstances.length / node.children.length;
    const isInstanceHeavy = instanceRatio > 0.6;
    const hasCollectionPattern = instanceGroups.size >= 2 && hasRepeatedComponents;
    console.log(`\u{1F50D} [STRUCTURE] Analysis for ${node.name}:`);
    console.log(`  Repeated components: ${hasRepeatedComponents}`);
    console.log(`  Organizational components: ${hasOrganizationalComponents}`);
    console.log(`  Instance ratio: ${instanceRatio.toFixed(2)} (${isInstanceHeavy ? "high" : "low"})`);
    console.log(`  Collection pattern: ${hasCollectionPattern}`);
    const isContainer = hasRepeatedComponents || hasOrganizationalComponents || isInstanceHeavy && instanceGroups.size >= 2;
    return isContainer;
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
    const componentName = node.name.toLowerCase();
    const structuralTerms = [
      "radiobutton",
      "checkbox",
      "icon",
      "button",
      "input",
      "focusring",
      "focus",
      "indicator",
      "background",
      "border",
      "outline",
      "shadow",
      "ring",
      "control",
      "handle",
      "thumb",
      "track",
      "progress",
      "slider",
      "arrow",
      "chevron",
      "close",
      "minimize",
      "maximize"
    ];
    const textNodes = allNodes.filter((child) => child.type === "TEXT");
    textNodes.forEach((textNode) => {
      const name = textNode.name.toLowerCase();
      if (structuralTerms.some((term) => name.includes(term))) {
        return;
      }
      if (componentName.includes(name) || name.includes(componentName.split(" ")[0])) {
        return;
      }
      if ((name.includes("title") || name.includes("label") || name.includes("text") || name.includes("content")) && name.length > 2) {
        slots.push(textNode.name);
      }
    });
    const frameNodes = allNodes.filter((child) => child.type === "FRAME");
    frameNodes.forEach((frameNode) => {
      const name = frameNode.name.toLowerCase();
      if (structuralTerms.some((term) => name.includes(term))) {
        return;
      }
      if (name.includes("content") && !name.includes("background") || name.includes("slot") || name.includes("container") && !name.includes("main")) {
        slots.push(frameNode.name);
      }
    });
    const filteredSlots = [...new Set(slots)].filter((slot) => {
      const lowerSlot = slot.toLowerCase();
      return lowerSlot.length > 2 && !["text", "label", "content"].includes(lowerSlot) && // Too generic
      !structuralTerms.some((term) => lowerSlot.includes(term));
    });
    console.log(`\u{1F50D} [SLOTS] Detected ${filteredSlots.length} legitimate content slots from ${slots.length} candidates:`, filteredSlots);
    return filteredSlots;
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
  async function extractActualComponentProperties(node, selectedNode) {
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
          const mainComponent = await instance.getMainComponentAsync();
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
      if (actualProperties.length === 0 && componentSet.children.length > 0) {
        console.log("\u{1F50D} [DEBUG] Analyzing variant structure to infer properties...");
        const propertyPatterns = /* @__PURE__ */ new Map();
        const layerVisibilityPatterns = /* @__PURE__ */ new Map();
        componentSet.children.forEach((variant, index) => {
          if (variant.type === "COMPONENT") {
            const variantName = variant.name;
            console.log(`\u{1F50D} [DEBUG] Analyzing variant ${index}: ${variantName}`);
            const pairs = variantName.split(",").map((s) => s.trim());
            pairs.forEach((pair) => {
              const [key, value] = pair.split("=").map((s) => s.trim());
              if (key && value) {
                if (!propertyPatterns.has(key)) {
                  propertyPatterns.set(key, /* @__PURE__ */ new Set());
                }
                propertyPatterns.get(key).add(value);
              }
            });
            const checkLayerVisibility = (node2, path = "") => {
              const fullPath = path ? `${path}/${node2.name}` : node2.name;
              if (!layerVisibilityPatterns.has(fullPath)) {
                layerVisibilityPatterns.set(fullPath, []);
              }
              layerVisibilityPatterns.get(fullPath).push(node2.visible);
              if ("children" in node2) {
                node2.children.forEach((child) => checkLayerVisibility(child, fullPath));
              }
            };
            checkLayerVisibility(variant);
          }
        });
        propertyPatterns.forEach((values, key) => {
          if (!actualProperties.find((p) => p.name === key)) {
            actualProperties.push({
              name: key,
              values: Array.from(values),
              default: Array.from(values)[0] || "default"
            });
          }
        });
        layerVisibilityPatterns.forEach((visibilityArray, layerPath) => {
          const hasTrue = visibilityArray.includes(true);
          const hasFalse = visibilityArray.includes(false);
          if (hasTrue && hasFalse) {
            const layerName = layerPath.split("/").pop() || "";
            const propertyName = layerName.replace(/\s*(layer|group|frame|icon|text)?\s*/gi, "").trim();
            if (propertyName && !actualProperties.find((p) => p.name === propertyName)) {
              actualProperties.push({
                name: propertyName,
                values: ["true", "false"],
                default: "false"
              });
              console.log(`\u{1F50D} [DEBUG] Inferred boolean property from visibility: ${propertyName}`);
            }
          }
        });
        console.log(`\u{1F50D} [DEBUG] Inferred ${actualProperties.length} properties from variant analysis`);
      }
      if (actualProperties.length === 0) {
        console.log("\u{1F50D} [DEBUG] All Figma APIs failed, using comprehensive structural analysis...");
        const structuralProperties = extractPropertiesFromStructuralAnalysis(componentSet);
        console.log("\u{1F50D} [DEBUG] Properties from structural analysis:", structuralProperties);
        actualProperties.push(...structuralProperties);
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
      const instance = node;
      console.log("\u{1F50D} [DEBUG] Processing INSTANCE node (fallback \u2014 Priority 1 may have been skipped)");
      if (actualProperties.length === 0) {
        try {
          const mainComponent = await instance.getMainComponentAsync();
          if (mainComponent) {
            if (mainComponent.parent && mainComponent.parent.type === "COMPONENT_SET") {
              const componentSet = mainComponent.parent;
              console.log("\u{1F50D} [DEBUG] Instance fallback: extracting from parent component set:", componentSet.name);
              try {
                if ("componentPropertyDefinitions" in componentSet) {
                  const propertyDefinitions = componentSet.componentPropertyDefinitions;
                  if (propertyDefinitions && typeof propertyDefinitions === "object") {
                    for (const propName in propertyDefinitions) {
                      const prop = propertyDefinitions[propName];
                      let displayName = propName;
                      let values = [];
                      let defaultValue = "";
                      if (propName.includes("#")) {
                        displayName = propName.split("#")[0];
                      }
                      switch (prop.type) {
                        case "VARIANT":
                          values = prop.variantOptions || [];
                          defaultValue = String(prop.defaultValue) || values[0] || "default";
                          break;
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
                      actualProperties.push({ name: displayName, values, default: defaultValue });
                    }
                    console.log(`\u{1F50D} [DEBUG] Instance fallback: extracted ${actualProperties.length} properties from component set`);
                  }
                }
              } catch (error) {
                console.warn("\u{1F50D} [WARN] Instance fallback: could not access componentPropertyDefinitions:", error);
              }
              if (actualProperties.length === 0) {
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
                  console.warn("\u{1F50D} [WARN] Instance fallback: could not access variantGroupProperties:", error);
                }
              }
            } else {
              console.log("\u{1F50D} [DEBUG] Instance fallback: extracting from standalone main component");
              try {
                if ("componentPropertyDefinitions" in mainComponent) {
                  const propertyDefinitions = mainComponent.componentPropertyDefinitions;
                  if (propertyDefinitions && typeof propertyDefinitions === "object") {
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
                      actualProperties.push({ name: displayName, values, default: defaultValue });
                    }
                    console.log(`\u{1F50D} [DEBUG] Instance fallback: extracted ${actualProperties.length} properties from main component`);
                  }
                }
              } catch (error) {
                console.warn("\u{1F50D} [WARN] Instance fallback: could not access componentPropertyDefinitions on main component:", error);
              }
            }
          }
        } catch (error) {
          console.warn("\u{1F50D} [WARN] Instance fallback: could not get main component:", error);
        }
      }
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
  async function extractActualComponentStates(node) {
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
        return await extractActualComponentStates(component.parent);
      }
    } else if (node.type === "INSTANCE") {
      const instance = node;
      const mainComponent = await instance.getMainComponentAsync();
      if (mainComponent) {
        return await extractActualComponentStates(mainComponent);
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
  async function processEnhancedAnalysis(context, apiKey, model, options = {}, providerId = "anthropic") {
    console.log("\u{1F3AF} Starting enhanced component analysis...");
    const selectedNode = figma.currentPage.selection[0];
    const node = options.node || selectedNode;
    if (!node) {
      throw new Error("No node selected");
    }
    const actualProperties = await extractActualComponentProperties(node, selectedNode);
    const actualStates = await extractActualComponentStates(node);
    const tokens = await extractDesignTokensFromNode(node);
    let componentDescription = "";
    if (node.type === "COMPONENT" || node.type === "COMPONENT_SET") {
      componentDescription = node.description || "";
    } else if (node.type === "INSTANCE") {
      const instance = node;
      const mainComponent = await instance.getMainComponentAsync();
      if (mainComponent) {
        componentDescription = mainComponent.description || "";
      }
    }
    console.log(`\u{1F4CA} [ANALYSIS] Extracted from Figma API:`);
    console.log(`  Properties: ${actualProperties.length}`);
    console.log(`  States: ${actualStates.length}`);
    console.log(`  Tokens: ${Object.keys(tokens).length} categories`);
    console.log(`  Description: ${componentDescription ? "Present" : "Missing"}`);
    const mcpServerUrl = options.mcpServerUrl || "http://localhost:3000/mcp";
    const useMCP = options.useMCP !== false && mcpServerUrl;
    let analysisResult;
    if (useMCP) {
      console.log(`\u{1F504} Using hybrid LLM + MCP approach (${providerId})...`);
      const llmPrompt = createFigmaDataExtractionPrompt(context, actualProperties, actualStates, tokens, componentDescription);
      const llmResponse = await callProvider(providerId, apiKey, {
        prompt: llmPrompt,
        model,
        maxTokens: 2048,
        temperature: 0.1
      });
      const llmData = extractJSONFromResponse(llmResponse.content);
      if (!llmData) {
        throw new Error("Failed to extract JSON from LLM response");
      }
      let mcpEnhancements = null;
      try {
        mcpEnhancements = await getMCPBestPractices(context, mcpServerUrl, llmData);
        console.log("\u2705 MCP enhancements received");
      } catch (mcpError) {
        console.warn("\u26A0\uFE0F MCP enhancement failed, continuing with LLM data only:", mcpError);
      }
      analysisResult = mergClaudeAndMCPResults(llmData, mcpEnhancements, {
        node,
        context,
        actualProperties,
        actualStates,
        tokens,
        componentDescription
      });
    } else {
      console.log(`\u{1F4DD} Using ${providerId}-only analysis...`);
      const prompt = createEnhancedMetadataPrompt(context);
      const llmFallbackResponse = await callProvider(providerId, apiKey, {
        prompt,
        model,
        maxTokens: 2048,
        temperature: 0.1
      });
      analysisResult = extractJSONFromResponse(llmFallbackResponse.content);
      if (!analysisResult) {
        throw new Error("Failed to extract JSON from response");
      }
    }
    const filteredData = filterDevelopmentRecommendations(analysisResult);
    return await processAnalysisResult(filteredData, context, options);
  }
  function createFigmaDataExtractionPrompt(context, actualProperties, actualStates, tokens, componentDescription) {
    var _a;
    const componentFamily = ((_a = context.additionalContext) == null ? void 0 : _a.componentFamily) || "generic";
    return `Analyze this Figma component and extract its structure and patterns.

**Component Details:**
- Name: ${context.name}
- Type: ${context.type}
- Family: ${componentFamily}
- Description: ${componentDescription || "No description provided"}

**Actual Figma Properties (${actualProperties.length} total):**
${actualProperties.slice(0, 10).map((p) => `- ${p.name}: ${p.values.join(", ")} (default: ${p.default})`).join("\n")}
${actualProperties.length > 10 ? `... and ${actualProperties.length - 10} more properties` : ""}

**Detected States:** ${actualStates.join(", ")}

**Token Analysis:**
- Total token opportunities: ${tokens.summary.totalTokens}
- Actual tokens used: ${tokens.summary.actualTokens}
- Hard-coded values: ${tokens.summary.hardCodedValues}
- AI suggestions: ${tokens.summary.aiSuggestions}

**Component Structure:**
${JSON.stringify(context.hierarchy.slice(0, 3), null, 2)}

**TASK:** Analyze this Figma component and provide:
1. Component name and description based on actual structure
2. All properties with their actual values from Figma
3. All states detected in the component
4. Token usage analysis
5. Structural patterns and variants
6. Recommended properties this component SHOULD have but currently LACKS

Return JSON in this exact format:
{
  "component": "Component name and type",
  "description": "Clear description based on structure",
  "props": [
    {
      "name": "property name from Figma",
      "type": "type",
      "description": "what this property controls",
      "values": ["actual", "values", "from", "figma"],
      "default": "default value"
    }
  ],
  "states": ["actual", "states", "detected"],
  "variants": {
    "property": ["values"]
  },
  "tokens": {
    "colors": ["actual tokens used"],
    "spacing": ["actual tokens used"],
    "typography": ["actual tokens used"]
  },
  "structure": {
    "layers": ${context.hierarchy.length},
    "hasSlots": ${context.detectedSlots.length > 0},
    "complexity": "low|medium|high"
  },
  "recommendedProperties": [
    {
      "name": "Figma property name to add",
      "type": "VARIANT|BOOLEAN|TEXT|INSTANCE_SWAP",
      "description": "Why this property improves the component",
      "examples": ["specific example values"]
    }
  ]
}

For "recommendedProperties": Compare the EXISTING properties listed above against design system best practices (Material Design, Carbon, Ant Design, Polaris, etc.). Only recommend Figma component properties that do NOT already exist. Use Figma property types (VARIANT, BOOLEAN, TEXT, INSTANCE_SWAP). If the component already has comprehensive properties, return an empty array.

Focus ONLY on what's actually in the Figma component for existing data. Recommendations should draw from your knowledge of design system best practices.`;
  }
  async function getMCPBestPractices(context, mcpServerUrl, claudeData) {
    var _a, _b;
    const componentFamily = ((_a = context.additionalContext) == null ? void 0 : _a.componentFamily) || ((_b = claudeData.component) == null ? void 0 : _b.toLowerCase()) || "generic";
    try {
      const [bestPractices, tokenGuidance, scoringCriteria] = await Promise.all([
        // Component best practices (small query)
        queryMCPWithTimeout(mcpServerUrl, "search_design_knowledge", {
          query: `${componentFamily} component essential properties states variants`,
          category: "components",
          limit: 2
        }, 3e3),
        // Token recommendations (small query)
        queryMCPWithTimeout(mcpServerUrl, "search_design_knowledge", {
          query: `design tokens ${componentFamily} semantic naming`,
          category: "tokens",
          limit: 2
        }, 3e3),
        // Scoring criteria (small query)
        queryMCPWithTimeout(mcpServerUrl, "search_chunks", {
          query: `component assessment scoring criteria ${componentFamily}`,
          limit: 1
        }, 3e3)
      ]);
      return {
        bestPractices: (bestPractices == null ? void 0 : bestPractices.entries) || [],
        tokenGuidance: (tokenGuidance == null ? void 0 : tokenGuidance.entries) || [],
        scoringCriteria: (scoringCriteria == null ? void 0 : scoringCriteria.chunks) || [],
        success: true
      };
    } catch (error) {
      console.warn("\u26A0\uFE0F MCP queries failed:", error);
      return {
        bestPractices: [],
        tokenGuidance: [],
        scoringCriteria: [],
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }
  async function queryMCPWithTimeout(serverUrl, toolName, arguments_, timeoutMs = 5e3) {
    var _a, _b;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const payload = {
        jsonrpc: "2.0",
        id: Math.floor(Math.random() * 1e3) + 100,
        method: "tools/call",
        params: {
          name: `mcp_design-systems_${toolName}`,
          arguments: arguments_
        }
      };
      const response = await fetch(serverUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        throw new Error(`MCP ${toolName} failed: ${response.status}`);
      }
      const result = await response.json();
      return ((_b = (_a = result.result) == null ? void 0 : _a.content) == null ? void 0 : _b[0]) || {};
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`MCP ${toolName} timeout after ${timeoutMs}ms`);
      }
      throw error;
    }
  }
  function mergClaudeAndMCPResults(claudeData, mcpEnhancements, fallbackData) {
    var _a;
    const merged = __spreadValues({}, claudeData);
    merged.propertyCheatSheet = generatePropertyCheatSheet(
      fallbackData.actualProperties,
      claudeData.component || fallbackData.context.name
    );
    merged.audit = {
      designIssues: [],
      tokenOpportunities: [],
      structureIssues: []
    };
    if (!fallbackData.componentDescription || fallbackData.componentDescription.trim().length === 0) {
      merged.audit.structureIssues.push("Component lacks description - Add a description in component properties to help MCP and AI understand the component's purpose and usage");
    }
    if (mcpEnhancements == null ? void 0 : mcpEnhancements.success) {
      merged.mcpReadiness = generateMCPReadinessFromBestPractices(
        mcpEnhancements,
        claudeData,
        fallbackData
      );
    } else {
      merged.mcpReadiness = generateFallbackMCPReadiness(fallbackData);
    }
    merged.component = merged.component || fallbackData.context.name;
    merged.description = merged.description || `${((_a = fallbackData.context.additionalContext) == null ? void 0 : _a.componentFamily) || "Component"} with ${fallbackData.actualProperties.length} properties`;
    merged.props = merged.props || fallbackData.actualProperties.map((p) => ({
      name: p.name,
      type: "select",
      description: `Controls ${p.name}`,
      values: p.values,
      default: p.default
    }));
    merged.states = merged.states || fallbackData.actualStates;
    merged.recommendedProperties = claudeData.recommendedProperties || [];
    return merged;
  }
  function generateMCPReadinessFromBestPractices(mcpEnhancements, claudeData, fallbackData) {
    var _a, _b;
    const strengths = [];
    const gaps = [];
    const recommendations = [];
    if (((_a = mcpEnhancements.bestPractices) == null ? void 0 : _a.length) > 0) {
      mcpEnhancements.bestPractices.forEach((entry) => {
        var _a2, _b2;
        if (((_a2 = entry.title) == null ? void 0 : _a2.includes("best practice")) || ((_b2 = entry.title) == null ? void 0 : _b2.includes("pattern"))) {
          recommendations.push(`Follow ${entry.title}`);
        }
      });
    }
    const hasAllStates = fallbackData.actualStates.length >= 3;
    const hasSemanticTokens = fallbackData.tokens.summary && fallbackData.tokens.summary.actualTokens > fallbackData.tokens.summary.hardCodedValues;
    const hasGoodStructure = ((_b = claudeData.structure) == null ? void 0 : _b.complexity) !== "high";
    if (hasAllStates) strengths.push("Component has comprehensive states");
    else gaps.push("Missing interactive states");
    if (hasSemanticTokens) strengths.push("Good token usage");
    else gaps.push("Improve token adoption");
    if (hasGoodStructure) strengths.push("Well-structured component");
    else gaps.push("Complex structure may need simplification");
    const score = Math.round(
      (hasAllStates ? 35 : 15) + (hasSemanticTokens ? 35 : 15) + (hasGoodStructure ? 30 : 20)
    );
    return {
      score,
      strengths,
      gaps,
      recommendations: recommendations.slice(0, 3)
      // Limit recommendations
    };
  }
  function generatePropertyCheatSheet(properties, componentName) {
    const cheatSheet = [];
    const sizeProps = properties.filter(
      (p) => p.name.toLowerCase().includes("size") || p.values.some((v) => ["small", "medium", "large"].includes(v.toLowerCase()))
    );
    const variantProps = properties.filter(
      (p) => p.name.toLowerCase().includes("variant") || p.name.toLowerCase().includes("type")
    );
    const stateProps = properties.filter(
      (p) => p.name.toLowerCase().includes("state") || p.values.some((v) => ["hover", "active", "disabled"].includes(v.toLowerCase()))
    );
    if (sizeProps.length > 0) {
      cheatSheet.push(`\u{1F4CF} Sizes: ${sizeProps.map((p) => p.values.join("/")).join(", ")}`);
    }
    if (variantProps.length > 0) {
      cheatSheet.push(`\u{1F3A8} Variants: ${variantProps.map((p) => `${p.name}(${p.values.length})`).join(", ")}`);
    }
    if (stateProps.length > 0) {
      cheatSheet.push(`\u{1F504} States: ${stateProps.map((p) => p.values.join("/")).join(", ")}`);
    }
    const covered = new Set([...sizeProps, ...variantProps, ...stateProps].map((p) => p.name));
    const remaining = properties.filter((p) => !covered.has(p.name)).slice(0, 3).map((p) => `${p.name}: ${p.values.slice(0, 3).join("/")}`);
    if (remaining.length > 0) {
      cheatSheet.push(`\u2699\uFE0F Other: ${remaining.join(", ")}`);
    }
    return cheatSheet.slice(0, 5);
  }
  async function processAnalysisResult(filteredData, context, options) {
    var _a;
    try {
      console.log("\u{1F504} Processing analysis result...");
      console.log("\u{1F4CA} Filtered data received:", JSON.stringify(filteredData, null, 2).substring(0, 500) + "...");
      const selection = figma.currentPage.selection;
      let node = null;
      if (selection.length > 0) {
        node = selection[0];
      } else {
        throw new Error("No component selected");
      }
      const actualProperties = await extractActualComponentProperties(node, node);
      const actualStates = await extractActualComponentStates(node);
      let componentDescription = "";
      if (node.type === "COMPONENT" || node.type === "COMPONENT_SET") {
        componentDescription = node.description || "";
      } else if (node.type === "INSTANCE") {
        const instance = node;
        const mainComponent = await instance.getMainComponentAsync();
        if (mainComponent) {
          componentDescription = mainComponent.description || "";
        }
      }
      let tokens = {
        colors: [],
        spacing: [],
        typography: [],
        effects: [],
        borders: [],
        summary: {
          totalTokens: 0,
          actualTokens: 0,
          hardCodedValues: 0,
          aiSuggestions: 0,
          byCategory: {}
        }
      };
      if (options.includeTokenAnalysis !== false) {
        tokens = await extractDesignTokensFromNode(node);
      }
      const metadata = {
        component: filteredData.component || context.name || "Component",
        description: filteredData.description || `A ${context.type} component with ${actualProperties.length} properties`,
        // Use actual properties from Figma if Claude didn't provide them
        props: filteredData.props && filteredData.props.length > 0 ? filteredData.props : actualProperties.map((p) => ({
          name: p.name,
          type: "select",
          description: `Controls ${p.name}`,
          values: p.values,
          defaultValue: p.default,
          required: false
        })),
        // Use actual states from Figma if Claude didn't provide them
        states: filteredData.states && filteredData.states.length > 0 ? filteredData.states.map((s) => typeof s === "string" ? s : s.name) : actualStates.length > 0 ? actualStates : ["default"],
        variants: filteredData.variants || {},
        slots: filteredData.slots || [],
        tokens: filteredData.tokens || {
          colors: tokens.colors.filter((t) => t.isActualToken).map((t) => t.name),
          spacing: tokens.spacing.filter((t) => t.isActualToken).map((t) => t.name),
          typography: tokens.typography.filter((t) => t.isActualToken).map((t) => t.name)
        },
        usage: filteredData.usage || "General purpose component for design systems",
        accessibility: filteredData.accessibility || {
          keyboardNavigation: "Standard keyboard navigation support",
          screenReader: "Screen reader accessible",
          colorContrast: "WCAG compliant contrast ratios"
        },
        audit: filteredData.audit || {
          accessibilityIssues: [],
          namingIssues: [],
          consistencyIssues: [],
          tokenOpportunities: []
        },
        // Ensure propertyCheatSheet exists
        propertyCheatSheet: filteredData.propertyCheatSheet || actualProperties.map((p) => ({
          name: p.name,
          values: p.values,
          default: p.default,
          description: `Property for ${p.name} configuration`
        })),
        // Ensure mcpReadiness exists
        mcpReadiness: filteredData.mcpReadiness || generateFallbackMCPReadiness({
          node,
          context,
          actualProperties,
          actualStates,
          tokens,
          componentDescription
        })
      };
      console.log("\u{1F4E4} Sending to UI - metadata.props:", (_a = metadata.props) == null ? void 0 : _a.length);
      console.log("\u{1F4E4} Sending to UI - metadata.states:", metadata.states);
      console.log("\u{1F4E4} Sending to UI - metadata.mcpReadiness:", metadata.mcpReadiness);
      const audit = await createAuditResults(filteredData, context, node, actualProperties, actualStates, tokens, componentDescription);
      const recommendations = (filteredData.recommendedProperties || []).map((rec) => ({
        name: rec.name || "",
        type: rec.type || "VARIANT",
        description: rec.description || "",
        examples: rec.examples || []
      })).filter((rec) => rec.name);
      console.log(`\u{1F4A1} AI-generated property recommendations: ${recommendations.length}`);
      const namingIssues = analyzeNamingIssues(node, 5);
      console.log(`\u{1F4DB} Found ${namingIssues.length} naming issues`);
      console.log("\u2705 Analysis result processed successfully");
      return {
        metadata,
        tokens,
        audit,
        properties: actualProperties,
        recommendations,
        namingIssues
      };
    } catch (error) {
      console.error("Error processing analysis result:", error);
      throw error;
    }
  }
  async function createAuditResults(filteredData, context, node, actualProperties, actualStates, tokens, componentDescription) {
    var _a;
    let parentHasDescription = false;
    let parentDescription = "";
    if (node.type === "COMPONENT" && ((_a = node.parent) == null ? void 0 : _a.type) === "COMPONENT_SET") {
      const parentSet = node.parent;
      parentDescription = parentSet.description || "";
      parentHasDescription = parentDescription.trim().length > 0;
    } else if (node.type === "COMPONENT_SET") {
      parentHasDescription = !!(componentDescription && componentDescription.trim().length > 0);
    }
    const hasDescription = !!(componentDescription && componentDescription.trim().length > 0);
    let descriptionStatus = hasDescription ? "pass" : "warning";
    let descriptionSuggestion = "";
    if (hasDescription) {
      descriptionSuggestion = "Component has description for MCP/AI context";
    } else if (parentHasDescription) {
      descriptionStatus = "pass";
      descriptionSuggestion = "Component set has a description. Consider adding a variant-specific description for richer context.";
    } else {
      descriptionSuggestion = "Add a component description to help MCP and AI understand the component purpose and usage";
    }
    const componentReadiness = [
      {
        check: "Property configuration",
        status: actualProperties.length > 0 ? "pass" : "warning",
        suggestion: actualProperties.length > 0 ? "Component has configurable properties" : "Consider adding properties for component customization"
      },
      {
        check: "Component description",
        status: descriptionStatus,
        suggestion: descriptionSuggestion
      }
    ];
    const accessibility = runAccessibilityChecks(node, actualStates);
    return {
      states: actualStates.map((state) => ({
        name: state,
        found: true
      })),
      componentReadiness,
      accessibility
    };
  }
  var INTERACTIVE_KEYWORDS = [
    "button",
    "btn",
    "link",
    "anchor",
    "checkbox",
    "check-box",
    "radio",
    "toggle",
    "switch",
    "tab",
    "chip",
    "tag",
    "input",
    "select",
    "dropdown",
    "menu-item",
    "menuitem",
    "slider",
    "stepper",
    "icon-button",
    "fab",
    "action"
  ];
  function isInteractiveComponent(node, states) {
    const nameLower = node.name.toLowerCase();
    if (INTERACTIVE_KEYWORDS.some((kw) => nameLower.includes(kw))) return true;
    const interactiveStates = ["hover", "pressed", "focus", "focused", "active", "disabled"];
    if (states.some((s) => interactiveStates.includes(s.toLowerCase()))) return true;
    return false;
  }
  function getLuminance(r, g, b) {
    const [rs, gs, bs] = [r, g, b].map((c) => {
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  }
  function getContrastRatio(l1, l2) {
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }
  function findBackgroundColor(node) {
    let current = node.parent;
    while (current && "type" in current) {
      const sceneNode = current;
      if ("fills" in sceneNode) {
        const fills = sceneNode.fills;
        if (Array.isArray(fills)) {
          for (const fill of fills) {
            if (fill.type === "SOLID" && fill.visible !== false && fill.color) {
              if (fill.boundVariables && fill.boundVariables.color) continue;
              return fill.color;
            }
          }
        }
      }
      current = current.parent;
    }
    return null;
  }
  function runAccessibilityChecks(node, states) {
    const checks = [];
    const interactive = isInteractiveComponent(node, states);
    if (interactive) {
      const width = "width" in node ? node.width : 0;
      const height = "height" in node ? node.height : 0;
      const minDim = Math.min(width, height);
      if (minDim >= 44) {
        checks.push({
          check: "Touch target size",
          status: "pass",
          suggestion: `Target size ${Math.round(width)}\xD7${Math.round(height)}px meets recommended 44px minimum`
        });
      } else if (minDim >= 24) {
        checks.push({
          check: "Touch target size",
          status: "warning",
          suggestion: `Target size ${Math.round(width)}\xD7${Math.round(height)}px meets WCAG minimum (24px) but is below recommended 44px`
        });
      } else {
        checks.push({
          check: "Touch target size",
          status: "fail",
          suggestion: `Target size ${Math.round(width)}\xD7${Math.round(height)}px is below WCAG 2.5.8 minimum of 24\xD724px`
        });
      }
    }
    if (interactive) {
      const hasFocus = states.some((s) => {
        const lower = s.toLowerCase();
        return lower === "focus" || lower === "focused" || lower.includes("focus");
      });
      checks.push({
        check: "Focus state",
        status: hasFocus ? "pass" : "warning",
        suggestion: hasFocus ? "Component has a focus state for keyboard navigation" : "Add a visible focus state to support keyboard navigation (WCAG 2.4.7)"
      });
    }
    if ("findAll" in node) {
      const containerNode = node;
      const textNodes = containerNode.findAll((n) => n.type === "TEXT");
      if (textNodes.length > 0) {
        let smallestSize = Infinity;
        let hasSmallText = false;
        for (const text of textNodes) {
          const size = typeof text.fontSize === "number" ? text.fontSize : 0;
          if (size > 0 && size < smallestSize) smallestSize = size;
          if (size > 0 && size < 12) hasSmallText = true;
        }
        if (hasSmallText) {
          checks.push({
            check: "Minimum font size",
            status: "warning",
            suggestion: `Text as small as ${smallestSize}px detected. Consider using 12px minimum for readability`
          });
        } else if (smallestSize !== Infinity) {
          checks.push({
            check: "Minimum font size",
            status: "pass",
            suggestion: `Smallest text is ${smallestSize}px, meets readability guidelines`
          });
        }
      }
    }
    if ("findAll" in node) {
      const containerNode = node;
      const textNodes = containerNode.findAll((n) => n.type === "TEXT");
      let worstRatio = Infinity;
      let checkedCount = 0;
      let worstTextName = "";
      for (const text of textNodes) {
        const fills = text.fills;
        if (!Array.isArray(fills) || fills.length === 0) continue;
        const textFill = fills.find(
          (f) => f.type === "SOLID" && f.visible !== false && f.color && !(f.boundVariables && f.boundVariables.color)
        );
        if (!textFill) continue;
        const bgColor = findBackgroundColor(text);
        if (!bgColor) continue;
        const textLum = getLuminance(textFill.color.r, textFill.color.g, textFill.color.b);
        const bgLum = getLuminance(bgColor.r, bgColor.g, bgColor.b);
        const ratio = getContrastRatio(textLum, bgLum);
        checkedCount++;
        if (ratio < worstRatio) {
          worstRatio = ratio;
          worstTextName = text.name || "text";
        }
      }
      if (checkedCount > 0 && worstRatio !== Infinity) {
        const ratioStr = worstRatio.toFixed(1);
        if (worstRatio >= 4.5) {
          checks.push({
            check: "Color contrast",
            status: "pass",
            suggestion: `Lowest contrast ratio is ${ratioStr}:1, meets WCAG AA (4.5:1)`
          });
        } else if (worstRatio >= 3) {
          checks.push({
            check: "Color contrast",
            status: "warning",
            suggestion: `"${worstTextName}" has ${ratioStr}:1 contrast. Meets large text AA (3:1) but not normal text (4.5:1)`
          });
        } else {
          checks.push({
            check: "Color contrast",
            status: "fail",
            suggestion: `"${worstTextName}" has ${ratioStr}:1 contrast, below WCAG AA minimum of 3:1`
          });
        }
      }
    }
    if (checks.length === 0) {
      checks.push({
        check: "Accessibility review",
        status: "pass",
        suggestion: "No accessibility issues detected for this component type"
      });
    }
    return checks;
  }
  function generateFallbackMCPReadiness(data) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k;
    const { node, context, actualProperties, actualStates, tokens, componentDescription } = data;
    const family = context.componentFamily || "generic";
    const strengths = [];
    const gaps = [];
    const recommendations = [];
    if (componentDescription && componentDescription.trim().length > 0) {
      strengths.push("Has component description for better MCP/AI context");
    } else {
      gaps.push("Missing component description - AI cannot understand component purpose and intent");
      recommendations.push("Add a descriptive explanation in component properties to help AI understand the component's purpose, behavior, and usage patterns");
    }
    if (actualProperties.length > 0) {
      strengths.push(`Has ${actualProperties.length} configurable properties`);
    } else {
      gaps.push("No configurable properties - component cannot be customized for different use cases");
      recommendations.push("Add component properties for customization (size, variant, text content, etc.)");
    }
    const shouldHaveStates = context.hasInteractiveElements && family !== "badge" && family !== "icon";
    if (shouldHaveStates) {
      if (actualStates.length > 1) {
        strengths.push("Includes multiple component states");
      } else {
        gaps.push("Missing interactive states - users won't receive proper feedback for interactions");
        recommendations.push("Add hover, focus, and disabled states with clear visual feedback");
      }
    }
    const tokenCounts = {
      colors: ((_b = (_a = tokens == null ? void 0 : tokens.colors) == null ? void 0 : _a.filter((t) => t.isActualToken)) == null ? void 0 : _b.length) || 0,
      spacing: ((_d = (_c = tokens == null ? void 0 : tokens.spacing) == null ? void 0 : _c.filter((t) => t.isActualToken)) == null ? void 0 : _d.length) || 0,
      typography: ((_f = (_e = tokens == null ? void 0 : tokens.typography) == null ? void 0 : _e.filter((t) => t.isActualToken)) == null ? void 0 : _f.length) || 0,
      // Count ALL hard-coded values across categories, not just colors
      hardCoded: [
        ...((_g = tokens == null ? void 0 : tokens.colors) == null ? void 0 : _g.filter((t) => !t.isActualToken && !t.isDefaultVariantStyle)) || [],
        ...((_h = tokens == null ? void 0 : tokens.spacing) == null ? void 0 : _h.filter((t) => !t.isActualToken && !t.isDefaultVariantStyle)) || [],
        ...((_i = tokens == null ? void 0 : tokens.typography) == null ? void 0 : _i.filter((t) => !t.isActualToken && !t.isDefaultVariantStyle)) || [],
        ...((_j = tokens == null ? void 0 : tokens.effects) == null ? void 0 : _j.filter((t) => !t.isActualToken && !t.isDefaultVariantStyle)) || [],
        ...((_k = tokens == null ? void 0 : tokens.borders) == null ? void 0 : _k.filter((t) => !t.isActualToken && !t.isDefaultVariantStyle)) || []
      ].length
    };
    const totalTokens = tokenCounts.colors + tokenCounts.spacing + tokenCounts.typography;
    if (totalTokens > 0) {
      strengths.push("Uses design tokens for consistency");
      if (tokenCounts.hardCoded > 0) {
        gaps.push("Found hard-coded values - inconsistent with design system");
        recommendations.push("Replace remaining hard-coded colors and spacing with design tokens");
      }
    } else if (tokenCounts.hardCoded > 2) {
      gaps.push("No design tokens used - component styling is inconsistent with design system");
      recommendations.push("Replace hard-coded values with design tokens for colors, spacing, and typography");
    }
    const hasSize = actualProperties.some(
      (prop) => prop.name.toLowerCase().includes("size") || prop.name.toLowerCase().includes("scale") || prop.name.toLowerCase().includes("dimension")
    );
    const hasVariant = actualProperties.some(
      (prop) => prop.name.toLowerCase().includes("variant") || prop.name.toLowerCase().includes("style") || prop.name.toLowerCase().includes("type")
    );
    if (family === "avatar") {
      if (!hasSize && actualProperties.length > 0) {
        gaps.push("No size variants defined - limits reusability across different contexts");
        recommendations.push("Add size property (xs, sm, md, lg, xl) for headers, lists, and profiles");
      }
    } else if (family === "button") {
      if (actualStates.length <= 1) {
        gaps.push("Missing interactive states - reduces accessibility and user feedback");
        recommendations.push("Add hover, focus, and disabled states with clear visual feedback");
      }
      if (!hasVariant && actualProperties.length > 0) {
        gaps.push("No visual hierarchy variants - limits design flexibility");
        recommendations.push("Add variant property (primary, secondary, danger) for proper hierarchy");
      }
    } else if (family === "input") {
      if (actualStates.length <= 1) {
        gaps.push("Missing form states - poor accessibility and user experience");
        recommendations.push("Add focus, error, and disabled states with clear visual indicators");
      }
    } else if (family === "container") {
      if (!hasVariant && actualProperties.length > 0) {
        gaps.push("No layout variants defined - limits flexibility for different use cases");
        recommendations.push("Add orientation property (horizontal, vertical) or density variants");
      }
      if (actualProperties.length > 0 && !actualProperties.some((prop) => prop.name.toLowerCase().includes("spacing"))) {
        gaps.push("No spacing customization - may not fit all design contexts");
        recommendations.push("Add spacing property to control internal padding and gaps");
      }
    }
    if (actualProperties.length === 0) {
      gaps.push("No configurable properties - component lacks flexibility for different use cases");
      if (family === "container") {
        recommendations.push("Add layout properties for customization (orientation, spacing, alignment)");
      } else {
        recommendations.push("Add component properties to enable customization and reuse");
      }
    } else if (actualProperties.length === 1 && !hasSize && !hasVariant) {
      gaps.push("Limited customization options - consider adding more properties for flexibility");
      if (family !== "container" && shouldHaveStates && actualStates.length <= 1) {
        recommendations.push("Add interactive states and additional variant options");
      } else if (family === "container") {
        recommendations.push("Consider adding layout variant properties (orientation, density)");
      }
    }
    if (strengths.length === 0) {
      strengths.push("Component follows basic Figma structure patterns");
    }
    if (gaps.length === 0) {
      gaps.push("Well-structured component - consider minor enhancements for broader usage");
    }
    if (recommendations.length === 0) {
      recommendations.push("Component is well-configured - ready for code generation");
    }
    let score = 0;
    const hasProperties = actualProperties.length > 0;
    const hasTokens = totalTokens > 0;
    const tokenUsageRatio = totalTokens > 0 ? totalTokens / (totalTokens + tokenCounts.hardCoded) : 0;
    if (hasProperties) {
      score += 22;
    }
    const hasDescription = componentDescription && componentDescription.trim().length > 0;
    if (hasDescription) {
      score += 3;
    }
    score += Math.round(25 * tokenUsageRatio);
    const needsStates = context.hasInteractiveElements && family !== "badge" && family !== "icon";
    if (needsStates) {
      const stateCompleteness = Math.min(actualStates.length / 3, 1);
      score += Math.round(20 * stateCompleteness);
    } else {
      score += 20;
    }
    if (node.type === "COMPONENT" || node.type === "COMPONENT_SET" || node.type === "INSTANCE") {
      score += 10;
    }
    if (context.name && !context.name.toLowerCase().includes("untitled")) {
      score += 10;
    }
    if (hasProperties || hasTokens || actualStates.length > 0) {
      score += 10;
    }
    score = Math.max(0, Math.min(100, score));
    return {
      score,
      strengths,
      gaps: deduplicateRecommendations(gaps),
      // Apply same deduplication to gaps
      recommendations: deduplicateRecommendations(recommendations),
      implementationNotes: generateImplementationNotes(family, strengths, gaps, actualProperties, actualStates, tokenCounts)
    };
  }
  function generateImplementationNotes(family, strengths, gaps, properties, states, tokenCounts) {
    const notes = [];
    if (family === "button") {
      if (states.length < 3) {
        notes.push("Implement hover, focus, and active states for better interactivity");
      }
      if (properties.length === 0) {
        notes.push("Add variant and size properties to support different use cases");
      }
    } else if (family === "input") {
      if (!states.includes("error")) {
        notes.push("Add error state with clear visual indicators for form validation");
      }
      notes.push("Ensure proper label association and placeholder text patterns");
    } else if (family === "card") {
      notes.push("Consider implementing click handlers for interactive cards");
      if (properties.length === 0) {
        notes.push("Add elevation or variant properties for visual hierarchy");
      }
    } else if (family === "avatar") {
      notes.push("Implement fallback patterns for missing images");
      if (!properties.some((p) => p.name.toLowerCase().includes("size"))) {
        notes.push("Add size variants for flexible usage across contexts");
      }
    } else if (family === "container") {
      notes.push("Focus on layout flexibility and content composition");
      notes.push("Consider responsive behavior for different screen sizes");
    }
    if (tokenCounts.hardCoded > tokenCounts.colors + tokenCounts.spacing) {
      notes.push("Prioritize converting hard-coded values to design tokens");
    }
    if (properties.length === 0) {
      notes.push("Define component properties to enable customization without code changes");
    } else if (properties.length === 1) {
      notes.push("Consider additional properties for greater flexibility");
    }
    if (notes.length === 0) {
      if (gaps.length > 3) {
        notes.push("Focus on addressing the high-priority gaps identified above");
      } else if (strengths.length > gaps.length) {
        notes.push("Component is well-structured for code generation with minor improvements needed");
      } else {
        notes.push("Balance quick wins with systematic improvements for optimal results");
      }
    }
    return notes.join(". ") + ".";
  }
  function deduplicateRecommendations(items) {
    if (items.length <= 1) return items;
    const deduplicated = [];
    const seenPatterns = /* @__PURE__ */ new Set();
    const similarityPatterns = [
      // Component properties patterns (recommendations)
      {
        pattern: /add.*component.*propert/i,
        message: "Add component properties for customization and reuse"
      },
      // State patterns (recommendations)
      {
        pattern: /add.*(hover|focus|disabled|interactive).*state/i,
        message: "Add hover, focus, and disabled states with clear visual feedback"
      },
      // Token patterns (recommendations)
      {
        pattern: /replace.*hard.coded.*(color|spacing|token)/i,
        message: "Replace remaining hard-coded colors and spacing with design tokens"
      },
      // Variant patterns (recommendations)
      {
        pattern: /add.*(size|variant).*propert/i,
        message: "Add size and style variant properties for different use cases"
      },
      // Gap-specific patterns
      {
        pattern: /no.*configurable.*propert.*(cannot|lacks|limited)/i,
        message: "No configurable properties - component lacks flexibility for different use cases"
      },
      {
        pattern: /(missing|no).*(interactive|hover|focus).*state/i,
        message: "Missing interactive states - reduces accessibility and user feedback"
      },
      {
        pattern: /found.*hard.coded.*value.*(inconsistent|design.*system)/i,
        message: "Found hard-coded values - inconsistent with design system"
      },
      {
        pattern: /(minimal|simple).*layer.*structure.*(lack|semantic|organization)/i,
        message: "Minimal layer structure - may lack semantic organization for complex use cases"
      }
    ];
    items.forEach((item) => {
      const normalizedItem = item.trim();
      if (!normalizedItem) return;
      let shouldAdd = true;
      let patternMessage = normalizedItem;
      for (const { pattern, message } of similarityPatterns) {
        if (pattern.test(normalizedItem)) {
          if (seenPatterns.has(pattern.source)) {
            shouldAdd = false;
            break;
          } else {
            seenPatterns.add(pattern.source);
            patternMessage = message;
            break;
          }
        }
      }
      const lowerItem = normalizedItem.toLowerCase();
      const isDuplicate = deduplicated.some(
        (existing) => existing.toLowerCase() === lowerItem || // Check for very similar messages (80% similarity)
        calculateSimilarity(existing.toLowerCase(), lowerItem) > 0.8
      );
      if (shouldAdd && !isDuplicate) {
        deduplicated.push(patternMessage);
      }
    });
    console.log(`\u{1F50D} [DEDUP] Reduced ${items.length} items to ${deduplicated.length}`);
    if (items.length !== deduplicated.length) {
      console.log(`\u{1F50D} [DEDUP] Original:`, items);
      console.log(`\u{1F50D} [DEDUP] Deduplicated:`, deduplicated);
    }
    return deduplicated;
  }
  function calculateSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    if (longer.length === 0) return 1;
    const distance = levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }
  function levenshteinDistance(str1, str2) {
    const matrix = [];
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            // substitution
            matrix[i][j - 1] + 1,
            // insertion
            matrix[i - 1][j] + 1
            // deletion
          );
        }
      }
    }
    return matrix[str2.length][str1.length];
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
        button: "Button components require comprehensive state management (default, hover, focus, active, disabled). Score based on state completeness (45%), semantic token usage (35%), and accessibility (20%).",
        avatar: "Avatar components should support multiple sizes and states. Interactive avatars need hover/focus states. Score based on size variants (25%), state coverage (25%), image handling (25%), and fallback mechanisms (25%).",
        card: "Card components need consistent spacing, proper content hierarchy, and optional interactive states. Score based on content structure (30%), spacing consistency (25%), optional interactivity (25%), and token usage (20%).",
        badge: "Badge components are typically status indicators with semantic color usage. Score based on semantic color mapping (40%), size variants (30%), content clarity (20%), and accessibility (10%).",
        input: "Form input components require comprehensive state management and accessibility. Score based on state completeness (35%), accessibility compliance (30%), validation feedback (20%), and token usage (15%).",
        icon: "Icon components should be scalable and consistent. Score based on sizing flexibility (35%), accessibility (35%), and style consistency (30%).",
        generic: "Generic components should follow basic design system principles. Score based on structure clarity (35%), token usage (35%), and accessibility basics (30%)."
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
        button: "Buttons require all interactive states (default, hover, focus, active, disabled). Score based on state completeness (45%), semantic token usage (35%), and accessibility (20%).",
        avatar: "Avatars should support multiple sizes and states. Interactive avatars need hover/focus states. Score based on size variants (25%), state coverage (25%), image handling (25%), and fallback mechanisms (25%).",
        card: "Cards need consistent spacing, proper content hierarchy, and optional interactive states. Score based on content structure (30%), spacing consistency (25%), optional interactivity (25%), and token usage (20%).",
        badge: "Badges are typically status indicators with semantic color usage. Score based on semantic color mapping (40%), size variants (30%), content clarity (20%), and accessibility (10%).",
        input: "Form inputs require comprehensive state management and accessibility. Score based on state completeness (35%), accessibility compliance (30%), validation feedback (20%), and token usage (15%).",
        generic: "Generic components should follow basic design system principles. Score based on structure clarity (35%), token usage (35%), and accessibility basics (30%)."
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
      return __spreadProps(__spreadValues({}, mcpReadiness), {
        score: mcpReadiness.score || 0
      });
    }
  };
  var consistency_engine_default = ComponentConsistencyEngine;

  // src/fixes/token-fixer.ts
  async function bindColorToken(node, propertyType, variableId, paintIndex = 0) {
    try {
      if (!(propertyType in node)) {
        return {
          success: false,
          message: `Node does not support ${propertyType}`,
          error: `Property ${propertyType} not found on node type ${node.type}`
        };
      }
      const variable = await figma.variables.getVariableByIdAsync(variableId);
      if (!variable) {
        return {
          success: false,
          message: "Variable not found",
          error: `Could not find variable with ID: ${variableId}`
        };
      }
      if (variable.resolvedType !== "COLOR") {
        return {
          success: false,
          message: "Variable is not a color type",
          error: `Variable ${variable.name} is of type ${variable.resolvedType}, expected COLOR`
        };
      }
      const nodeWithPaints = node;
      const paints = [...nodeWithPaints[propertyType]];
      if (paintIndex >= paints.length) {
        return {
          success: false,
          message: "Paint index out of range",
          error: `Paint index ${paintIndex} does not exist. Node has ${paints.length} ${propertyType}.`
        };
      }
      const currentPaint = paints[paintIndex];
      if (currentPaint.type !== "SOLID") {
        return {
          success: false,
          message: "Can only bind to solid paints",
          error: `Paint at index ${paintIndex} is of type ${currentPaint.type}, expected SOLID`
        };
      }
      const boundPaint = figma.variables.setBoundVariableForPaint(
        currentPaint,
        "color",
        variable
      );
      paints[paintIndex] = boundPaint;
      if (propertyType === "fills") {
        node.fills = paints;
      } else {
        node.strokes = paints;
      }
      return {
        success: true,
        message: `Successfully bound ${variable.name} to ${propertyType}[${paintIndex}]`,
        appliedFix: {
          nodeId: node.id,
          nodeName: node.name,
          propertyPath: `${propertyType}[${paintIndex}]`,
          beforeValue: currentPaint.type === "SOLID" && currentPaint.color ? rgbToHex(currentPaint.color.r, currentPaint.color.g, currentPaint.color.b) : "unknown",
          afterValue: variable.name,
          tokenId: variableId,
          tokenName: variable.name,
          fixType: "color"
        }
      };
    } catch (error) {
      return {
        success: false,
        message: "Failed to bind color token",
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  async function bindSpacingToken(node, property, variableId) {
    try {
      if (!(property in node)) {
        return {
          success: false,
          message: `Node does not support ${property}`,
          error: `Property ${property} not found on node type ${node.type}`
        };
      }
      const variable = await figma.variables.getVariableByIdAsync(variableId);
      if (!variable) {
        return {
          success: false,
          message: "Variable not found",
          error: `Could not find variable with ID: ${variableId}`
        };
      }
      if (variable.resolvedType !== "FLOAT") {
        return {
          success: false,
          message: "Variable is not a number type",
          error: `Variable ${variable.name} is of type ${variable.resolvedType}, expected FLOAT`
        };
      }
      const currentValue = node[property];
      const bindableNode = node;
      bindableNode.setBoundVariable(property, variable);
      return {
        success: true,
        message: `Successfully bound ${variable.name} to ${property}`,
        appliedFix: {
          nodeId: node.id,
          nodeName: node.name,
          propertyPath: property,
          beforeValue: typeof currentValue === "number" ? `${currentValue}px` : String(currentValue),
          afterValue: variable.name,
          tokenId: variableId,
          tokenName: variable.name,
          fixType: property.includes("Radius") ? "border" : "spacing"
        }
      };
    } catch (error) {
      return {
        success: false,
        message: "Failed to bind spacing token",
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  async function findMatchingColorVariable(hexColor, tolerance = 0) {
    try {
      const targetRgb = hexToRgb(hexColor);
      if (!targetRgb) {
        return [];
      }
      const suggestions = [];
      const colorVariables = await figma.variables.getLocalVariablesAsync("COLOR");
      const collections = await figma.variables.getLocalVariableCollectionsAsync();
      const collectionMap = /* @__PURE__ */ new Map();
      for (const collection of collections) {
        collectionMap.set(collection.id, collection);
      }
      for (const variable of colorVariables) {
        const collection = collectionMap.get(variable.variableCollectionId);
        if (!collection) continue;
        const modeId = collection.modes[0].modeId;
        const value = variable.valuesByMode[modeId];
        if (!value || typeof value !== "object" || !("r" in value)) {
          continue;
        }
        const varColor = value;
        const matchScore = calculateColorMatchScore(targetRgb, varColor);
        if (matchScore >= 1 - tolerance) {
          suggestions.push({
            variableId: variable.id,
            variableName: variable.name,
            collectionName: collection.name,
            value: rgbToHex(varColor.r, varColor.g, varColor.b),
            matchScore,
            type: "color"
          });
        }
      }
      return suggestions.sort((a, b) => b.matchScore - a.matchScore);
    } catch (error) {
      console.error("Error finding matching color variable:", error);
      return [];
    }
  }
  async function findMatchingSpacingVariable(pixelValue, tolerance = 0) {
    try {
      const suggestions = [];
      const numberVariables = await figma.variables.getLocalVariablesAsync("FLOAT");
      const collections = await figma.variables.getLocalVariableCollectionsAsync();
      const collectionMap = /* @__PURE__ */ new Map();
      for (const collection of collections) {
        collectionMap.set(collection.id, collection);
      }
      for (const variable of numberVariables) {
        const collection = collectionMap.get(variable.variableCollectionId);
        if (!collection) continue;
        const modeId = collection.modes[0].modeId;
        const value = variable.valuesByMode[modeId];
        if (typeof value !== "number") {
          continue;
        }
        const difference = Math.abs(value - pixelValue);
        if (difference <= tolerance) {
          const matchScore = difference === 0 ? 1 : 1 - difference / (tolerance || 1);
          suggestions.push({
            variableId: variable.id,
            variableName: variable.name,
            collectionName: collection.name,
            value: `${value}px`,
            matchScore,
            type: "number"
          });
        }
      }
      return suggestions.sort((a, b) => b.matchScore - a.matchScore);
    } catch (error) {
      console.error("Error finding matching spacing variable:", error);
      return [];
    }
  }
  async function findBestMatchingVariable(pixelValue, propertyPath, tolerance = 2) {
    const suggestions = await findMatchingSpacingVariable(pixelValue, tolerance);
    if (suggestions.length === 0) return suggestions;
    const affinityMap = {
      strokeWeight: ["stroke", "border-width", "border/width", "borderwidth"],
      cornerRadius: ["radius", "corner", "round", "border-radius"],
      topLeftRadius: ["radius", "corner", "round"],
      topRightRadius: ["radius", "corner", "round"],
      bottomLeftRadius: ["radius", "corner", "round"],
      bottomRightRadius: ["radius", "corner", "round"],
      paddingTop: ["padding", "spacing", "space"],
      paddingRight: ["padding", "spacing", "space"],
      paddingBottom: ["padding", "spacing", "space"],
      paddingLeft: ["padding", "spacing", "space"],
      itemSpacing: ["gap", "spacing", "space"],
      counterAxisSpacing: ["gap", "spacing", "space"]
    };
    const keywords = affinityMap[propertyPath] || [];
    if (keywords.length === 0) return suggestions;
    const boosted = suggestions.map((s) => {
      const nameLower = s.variableName.toLowerCase();
      const hasAffinity = keywords.some((kw) => nameLower.includes(kw));
      return __spreadProps(__spreadValues({}, s), {
        matchScore: hasAffinity ? Math.min(s.matchScore + 0.3, 1) : s.matchScore
      });
    });
    return boosted.sort((a, b) => b.matchScore - a.matchScore);
  }
  async function applyColorFix(node, propertyPath, tokenId) {
    const match = propertyPath.match(/^(fills|strokes)\[(\d+)\]$/);
    if (!match) {
      return {
        success: false,
        message: "Invalid property path",
        error: `Expected format: fills[n] or strokes[n], got: ${propertyPath}`
      };
    }
    const [, propertyType, indexStr] = match;
    const paintIndex = parseInt(indexStr, 10);
    return bindColorToken(
      node,
      propertyType,
      tokenId,
      paintIndex
    );
  }
  async function applySpacingFix(node, propertyPath, tokenId) {
    const validProperties = [
      "paddingTop",
      "paddingRight",
      "paddingBottom",
      "paddingLeft",
      "itemSpacing",
      "counterAxisSpacing",
      "cornerRadius",
      "topLeftRadius",
      "topRightRadius",
      "bottomLeftRadius",
      "bottomRightRadius",
      "strokeWeight"
    ];
    if (!validProperties.includes(propertyPath)) {
      return {
        success: false,
        message: "Invalid property path",
        error: `Property ${propertyPath} is not a valid spacing property`
      };
    }
    if (propertyPath === "cornerRadius") {
      const corners = [
        "topLeftRadius",
        "topRightRadius",
        "bottomLeftRadius",
        "bottomRightRadius"
      ];
      const results = [];
      for (const corner of corners) {
        const result = await bindSpacingToken(node, corner, tokenId);
        results.push(result);
        if (!result.success) {
          return {
            success: false,
            message: `Failed to bind ${corner}`,
            error: result.error
          };
        }
      }
      return {
        success: true,
        message: `Successfully bound variable to all 4 corner radii`,
        appliedFix: results[0].appliedFix ? __spreadProps(__spreadValues({}, results[0].appliedFix), { propertyPath: "cornerRadius" }) : void 0
      };
    }
    return bindSpacingToken(
      node,
      propertyPath,
      tokenId
    );
  }
  async function previewFix(node, propertyPath, tokenId) {
    try {
      const variable = await figma.variables.getVariableByIdAsync(tokenId);
      if (!variable) {
        return null;
      }
      let fixType;
      let beforeValue;
      const colorMatch = propertyPath.match(/^(fills|strokes)\[(\d+)\]$/);
      if (colorMatch) {
        fixType = "color";
        const [, propertyType, indexStr] = colorMatch;
        const paintIndex = parseInt(indexStr, 10);
        if (!(propertyType in node)) {
          return null;
        }
        const nodeWithPaints = node;
        const paints = nodeWithPaints[propertyType];
        if (paintIndex >= paints.length) {
          return null;
        }
        const paint = paints[paintIndex];
        if (paint.type === "SOLID" && paint.color) {
          beforeValue = rgbToHex(paint.color.r, paint.color.g, paint.color.b);
        } else {
          beforeValue = paint.type;
        }
      } else {
        if (!(propertyPath in node)) {
          return null;
        }
        const currentValue = node[propertyPath];
        beforeValue = typeof currentValue === "number" ? `${currentValue}px` : String(currentValue);
        fixType = propertyPath.includes("Radius") ? "border" : "spacing";
      }
      let afterValue = variable.name;
      const collection = await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId);
      if (collection) {
        const modeId = collection.modes[0].modeId;
        const value = variable.valuesByMode[modeId];
        if (typeof value === "number") {
          afterValue = `${variable.name} (${value}px)`;
        } else if (value && typeof value === "object" && "r" in value) {
          const rgb = value;
          afterValue = `${variable.name} (${rgbToHex(rgb.r, rgb.g, rgb.b)})`;
        }
      }
      return {
        nodeId: node.id,
        nodeName: node.name,
        propertyPath,
        beforeValue,
        afterValue,
        tokenId,
        tokenName: variable.name,
        fixType
      };
    } catch (error) {
      console.error("Error generating fix preview:", error);
      return null;
    }
  }
  function hexToRgb(hex) {
    const cleanHex = hex.replace(/^#/, "");
    let fullHex = cleanHex;
    if (cleanHex.length === 3) {
      fullHex = cleanHex[0] + cleanHex[0] + cleanHex[1] + cleanHex[1] + cleanHex[2] + cleanHex[2];
    }
    if (fullHex.length !== 6) {
      return null;
    }
    const r = parseInt(fullHex.substring(0, 2), 16);
    const g = parseInt(fullHex.substring(2, 4), 16);
    const b = parseInt(fullHex.substring(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) {
      return null;
    }
    return {
      r: r / 255,
      g: g / 255,
      b: b / 255
    };
  }
  function calculateColorMatchScore(color1, color2) {
    const dr = color1.r - color2.r;
    const dg = color1.g - color2.g;
    const db = color1.b - color2.b;
    const distance = Math.sqrt(dr * dr + dg * dg + db * db);
    const maxDistance = Math.sqrt(3);
    return 1 - distance / maxDistance;
  }

  // src/ui/message-handler.ts
  var storedApiKey = null;
  var selectedModel = "claude-sonnet-4-5-20250929";
  var selectedProvider = "anthropic";
  function isValidApiKeyFormat(apiKey, provider = selectedProvider) {
    const trimmed = (apiKey == null ? void 0 : apiKey.trim()) || "";
    switch (provider) {
      case "anthropic":
        return trimmed.startsWith("sk-ant-") && trimmed.length >= 40;
      case "openai":
        return trimmed.startsWith("sk-") && trimmed.length >= 20;
      case "google":
        return trimmed.startsWith("AIza") && trimmed.length >= 35;
      default:
        return false;
    }
  }
  var lastAnalyzedMetadata = null;
  var lastAnalyzedNode = null;
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
          await handleSaveApiKey(data.apiKey, data.model, data.provider);
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
        case "select-node":
          await handleSelectNode(data);
          break;
        // Auto-fix handlers
        case "preview-fix":
          await handlePreviewFix(data);
          break;
        case "apply-token-fix":
          await handleApplyTokenFix(data);
          break;
        case "apply-naming-fix":
          await handleApplyNamingFix(data);
          break;
        case "apply-batch-fix":
          await handleApplyBatchFix(data);
          break;
        case "update-description":
          await handleUpdateDescription(data);
          break;
        case "add-component-property":
          await handleAddComponentProperty(data);
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
      await migrateLegacyStorage();
      const config = await loadProviderConfig();
      selectedProvider = config.providerId;
      selectedModel = config.modelId;
      if (storedApiKey) {
        sendMessageToUI("api-key-status", {
          hasKey: true,
          provider: selectedProvider,
          model: selectedModel
        });
        return;
      }
      if (config.apiKey && isValidApiKeyFormat(config.apiKey, config.providerId)) {
        storedApiKey = config.apiKey;
        sendMessageToUI("api-key-status", {
          hasKey: true,
          provider: selectedProvider,
          model: selectedModel
        });
      } else {
        sendMessageToUI("api-key-status", {
          hasKey: false,
          provider: selectedProvider,
          model: selectedModel
        });
      }
    } catch (error) {
      console.error("Error checking API key:", error);
      sendMessageToUI("api-key-status", { hasKey: false, provider: "anthropic" });
    }
  }
  async function handleSaveApiKey(apiKey, model, provider) {
    try {
      const providerId = provider || selectedProvider;
      if (!isValidApiKeyFormat(apiKey, providerId)) {
        const providerObj2 = getProvider(providerId);
        throw new Error(`Invalid API key format for ${providerObj2.name}. Expected format: ${providerObj2.keyPlaceholder}`);
      }
      selectedProvider = providerId;
      storedApiKey = apiKey;
      if (model) {
        selectedModel = model;
      }
      await saveProviderConfig(providerId, selectedModel, apiKey);
      console.log(`${providerId} API key and model saved successfully`);
      const providerObj = getProvider(providerId);
      sendMessageToUI("api-key-saved", { success: true, provider: providerId });
      figma.notify(`${providerObj.name} API key saved successfully`, { timeout: 2e3 });
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
      await saveProviderConfig(selectedProvider, model);
      console.log("Model updated to:", model);
      figma.notify(`Model updated to ${model}`, { timeout: 2e3 });
    } catch (error) {
      console.error("Error updating model:", error);
      figma.notify("Failed to update model", { error: true });
    }
  }
  async function handleEnhancedAnalyze(options) {
    var _a, _b;
    try {
      if (!storedApiKey) {
        const providerName = getProvider(selectedProvider).name;
        throw new Error(`API key not found. Please save your ${providerName} API key first.`);
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
        try {
          const mainComponent = await instance.getMainComponentAsync();
          if (mainComponent) {
            figma.notify("Analyzing main component instead of instance...", { timeout: 2e3 });
            selectedNode = mainComponent;
          } else {
            throw new Error("This instance has no main component. Please select a component directly.");
          }
        } catch (error) {
          console.error("Error accessing main component:", error);
          throw new Error("Could not access main component. Please select a component directly.");
        }
      }
      if (selectedNode.type === "COMPONENT" && ((_a = selectedNode.parent) == null ? void 0 : _a.type) === "COMPONENT_SET") {
        const component = selectedNode;
        const parentComponentSet = component.parent;
        figma.notify("Analyzing parent component set to include all variants...", { timeout: 2e3 });
        selectedNode = parentComponentSet;
      }
      if (!isValidNodeForAnalysis(selectedNode)) {
        const componentTypes = /* @__PURE__ */ new Set(["COMPONENT_SET", "COMPONENT", "INSTANCE"]);
        let componentAncestor = null;
        let frameAncestor = null;
        let ancestor = selectedNode.parent;
        while (ancestor && "type" in ancestor) {
          const sceneAncestor = ancestor;
          if (componentTypes.has(sceneAncestor.type) && !componentAncestor) {
            componentAncestor = sceneAncestor;
            break;
          }
          if (!frameAncestor && isValidNodeForAnalysis(sceneAncestor)) {
            frameAncestor = sceneAncestor;
          }
          ancestor = ancestor.parent;
        }
        const bestAncestor = componentAncestor || frameAncestor;
        if (bestAncestor) {
          figma.notify(`Analyzing parent ${bestAncestor.type.toLowerCase()} "${bestAncestor.name}"...`, { timeout: 2e3 });
          selectedNode = bestAncestor;
        }
      }
      if (selectedNode.type === "INSTANCE") {
        const instance = selectedNode;
        try {
          const mainComponent = await instance.getMainComponentAsync();
          if (mainComponent) {
            figma.notify("Analyzing main component instead of instance...", { timeout: 2e3 });
            selectedNode = mainComponent;
          }
        } catch (e) {
        }
      }
      if (selectedNode.type === "COMPONENT" && ((_b = selectedNode.parent) == null ? void 0 : _b.type) === "COMPONENT_SET") {
        const parentComponentSet = selectedNode.parent;
        figma.notify("Analyzing parent component set to include all variants...", { timeout: 2e3 });
        selectedNode = parentComponentSet;
      }
      if (!isValidNodeForAnalysis(selectedNode)) {
        throw new Error("Please select a Frame, Component, Component Set, or Instance to analyze");
      }
      await consistencyEngine.loadDesignSystemsKnowledge();
      const componentContext = await extractComponentContext(selectedNode);
      const enhancedOptions = __spreadValues({
        enableMCPEnhancement: true,
        // Enable MCP enhancement by default
        batchMode: options.batchMode || false,
        enableAudit: options.enableAudit !== false,
        // Enable by default
        includeTokenAnalysis: options.includeTokenAnalysis !== false
      }, options);
      figma.notify("Performing enhanced analysis with design systems knowledge...", { timeout: 3e3 });
      const result = await processEnhancedAnalysis(
        componentContext,
        storedApiKey,
        selectedModel,
        enhancedOptions,
        selectedProvider
      );
      lastAnalyzedMetadata = result.metadata;
      lastAnalyzedNode = selectedNode;
      sendMessageToUI("enhanced-analysis-result", __spreadProps(__spreadValues({}, result), {
        analyzedNodeId: selectedNode.id
      }));
      figma.notify("Enhanced analysis complete! Check the results panel.", { timeout: 3e3 });
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
          const componentContext = await extractComponentContext(node);
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
          const batchLlmResponse = await callProvider(selectedProvider, storedApiKey, {
            prompt: deterministicPrompt,
            model: selectedModel,
            maxTokens: 2048,
            temperature: 0.1
          });
          const rawEnhancedData = extractJSONFromResponse(batchLlmResponse.content);
          const enhancedData = filterDevelopmentRecommendations(rawEnhancedData);
          let result = await processAnalysisResult(enhancedData, componentContext, { batchMode: true });
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
      await clearProviderKey(selectedProvider);
      await figma.clientStorage.setAsync("claude-api-key", "");
      const providerName = getProvider(selectedProvider).name;
      sendMessageToUI("api-key-cleared", { success: true });
      figma.notify(`${providerName} API key cleared`, { timeout: 2e3 });
    } catch (error) {
      console.error("Error clearing API key:", error);
    }
  }
  async function handleChatMessage(data) {
    try {
      console.log("Processing chat message:", data.message);
      if (!storedApiKey) {
        const providerName = getProvider(selectedProvider).name;
        throw new Error(`API key not found. Please save your ${providerName} API key first.`);
      }
      sendMessageToUI("chat-response-loading", { isLoading: true });
      const componentContext = getCurrentComponentContext();
      const mcpResponse = await queryDesignSystemsMCP(data.message);
      const enhancedPrompt = createChatPromptWithContext(data.message, mcpResponse, data.history, componentContext);
      const llmResponse = await callProvider(selectedProvider, storedApiKey, {
        prompt: enhancedPrompt,
        model: selectedModel,
        maxTokens: 2048,
        temperature: 0.7
      });
      const chatResponse = {
        message: llmResponse.content,
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
  async function handleSelectNode(data) {
    try {
      console.log("\u{1F3AF} Attempting to select node:", data.nodeId);
      const node = await figma.getNodeByIdAsync(data.nodeId);
      if (!node) {
        console.warn("\u26A0\uFE0F Node not found:", data.nodeId);
        figma.notify("Node not found - it may have been deleted or moved", { error: true });
        return;
      }
      if (!isNodeOnCurrentPage(node)) {
        console.warn("\u26A0\uFE0F Node is not on current page:", data.nodeId);
        figma.notify("Node is on a different page", { error: true });
        return;
      }
      figma.currentPage.selection = [node];
      figma.viewport.scrollAndZoomIntoView([node]);
      console.log("\u2705 Successfully selected and zoomed to node:", node.name);
      figma.notify(`Selected "${node.name}"`, { timeout: 2e3 });
    } catch (error) {
      console.error("Error selecting node:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      figma.notify(`Failed to select node: ${errorMessage}`, { error: true });
    }
  }
  function isNodeOnCurrentPage(node) {
    try {
      let currentNode = node;
      const maxDepth = 50;
      let depth = 0;
      while (currentNode && currentNode.parent && depth < maxDepth) {
        currentNode = currentNode.parent;
        depth++;
        if (currentNode === figma.currentPage) {
          return true;
        }
      }
      if (currentNode === figma.currentPage) {
        return true;
      }
      if (node.parent === figma.currentPage) {
        return true;
      }
      const allPages = figma.root.children.filter((child) => child.type === "PAGE");
      const currentPage = figma.currentPage;
      if (node.type === "COMPONENT" || node.type === "COMPONENT_SET") {
        return findNodeInPage(currentPage, node.id);
      }
      return false;
    } catch (error) {
      console.warn("Error checking node page:", error);
      return false;
    }
  }
  function findNodeInPage(page, nodeId) {
    try {
      const allNodes = page.findAll();
      return allNodes.some((node) => node.id === nodeId);
    } catch (error) {
      return false;
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
      const lastMetadata = lastAnalyzedMetadata;
      const lastNode = lastAnalyzedNode;
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
      const config = await loadProviderConfig();
      selectedProvider = config.providerId;
      selectedModel = config.modelId;
      if (config.apiKey) {
        storedApiKey = config.apiKey;
        sendMessageToUI("api-key-status", {
          hasKey: true,
          provider: selectedProvider,
          model: selectedModel
        });
      } else {
        sendMessageToUI("api-key-status", {
          hasKey: false,
          provider: selectedProvider,
          model: selectedModel
        });
      }
      console.log(`Plugin initialized with provider: ${selectedProvider}, model: ${selectedModel}`);
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
  async function handlePreviewFix(data) {
    try {
      const node = await figma.getNodeByIdAsync(data.nodeId);
      if (!node || !("type" in node)) {
        sendMessageToUI("fix-preview", {
          success: false,
          error: "Node not found or is not a valid scene node"
        });
        return;
      }
      const sceneNode = node;
      let preview = null;
      if (data.type === "token") {
        if (!data.propertyPath) {
          sendMessageToUI("fix-preview", {
            success: false,
            error: "Property path is required for token fixes"
          });
          return;
        }
        const matches = data.propertyPath.match(/^(fills|strokes)\[(\d+)\]$/);
        if (matches) {
          const colorMatches = await findMatchingColorVariable(data.suggestedValue || "", 0.1);
          if (colorMatches.length > 0) {
            preview = await previewFix(sceneNode, data.propertyPath, colorMatches[0].variableId);
          }
        } else {
          const pixelValue = parseFloat(data.suggestedValue || "0");
          const spacingMatches = await findBestMatchingVariable(pixelValue, data.propertyPath || "", 2);
          if (spacingMatches.length > 0) {
            preview = await previewFix(sceneNode, data.propertyPath, spacingMatches[0].variableId);
          }
        }
        if (preview) {
          const fixPreview = preview;
          sendMessageToUI("fix-preview", {
            success: true,
            type: "token",
            nodeId: fixPreview.nodeId,
            nodeName: fixPreview.nodeName,
            propertyPath: fixPreview.propertyPath,
            beforeValue: fixPreview.beforeValue,
            afterValue: fixPreview.afterValue,
            tokenId: fixPreview.tokenId,
            tokenName: fixPreview.tokenName
          });
        } else {
          sendMessageToUI("fix-preview", {
            success: false,
            error: "No matching token found for this value"
          });
        }
      } else if (data.type === "naming") {
        const suggestedName = data.suggestedValue || suggestLayerName(sceneNode);
        preview = previewRename(sceneNode, suggestedName);
        sendMessageToUI("fix-preview", { success: true, preview });
      } else {
        sendMessageToUI("fix-preview", {
          success: false,
          error: `Unknown fix type: ${data.type}`
        });
      }
    } catch (error) {
      console.error("Error previewing fix:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      sendMessageToUI("fix-preview", { success: false, error: errorMessage });
    }
  }
  async function handleApplyTokenFix(data) {
    try {
      const node = await figma.getNodeByIdAsync(data.nodeId);
      if (!node || !("type" in node)) {
        sendMessageToUI("fix-applied", {
          success: false,
          error: "Node not found or is not a valid scene node"
        });
        figma.notify("Failed to apply fix: Node not found", { error: true });
        return;
      }
      const sceneNode = node;
      if (!data.propertyPath) {
        sendMessageToUI("fix-applied", {
          success: false,
          error: "Property path is required for token fixes"
        });
        figma.notify("Failed to apply fix: Property path missing", { error: true });
        return;
      }
      if (!data.tokenId) {
        sendMessageToUI("fix-applied", {
          success: false,
          error: "Token ID is required for token fixes"
        });
        figma.notify("Failed to apply fix: Token ID missing", { error: true });
        return;
      }
      let result;
      const isColorProperty = /^(fills|strokes)\[\d+\]$/.test(data.propertyPath);
      if (isColorProperty) {
        result = await applyColorFix(sceneNode, data.propertyPath, data.tokenId);
      } else {
        result = await applySpacingFix(sceneNode, data.propertyPath, data.tokenId);
      }
      sendMessageToUI("fix-applied", __spreadProps(__spreadValues({}, result), {
        fixType: "token",
        nodeId: data.nodeId,
        propertyPath: data.propertyPath
      }));
      if (result.success) {
        figma.notify(`Applied token to ${sceneNode.name}`, { timeout: 2e3 });
      } else {
        figma.notify(`Failed to apply token: ${result.error || result.message}`, { error: true });
      }
    } catch (error) {
      console.error("Error applying token fix:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      sendMessageToUI("fix-applied", { success: false, error: errorMessage, fixType: "token", nodeId: data.nodeId });
      figma.notify(`Failed to apply fix: ${errorMessage}`, { error: true });
    }
  }
  async function handleApplyNamingFix(data) {
    try {
      const node = await figma.getNodeByIdAsync(data.nodeId);
      if (!node || !("type" in node)) {
        sendMessageToUI("fix-applied", {
          success: false,
          error: "Node not found or is not a valid scene node"
        });
        figma.notify("Failed to rename: Node not found", { error: true });
        return;
      }
      const sceneNode = node;
      const newName = data.newValue || suggestLayerName(sceneNode);
      const oldName = sceneNode.name;
      if (oldName === newName) {
        sendMessageToUI("fix-applied", {
          success: true,
          fixType: "naming",
          nodeId: data.nodeId,
          message: `Layer already named "${newName}"`,
          oldName,
          newName
        });
        figma.notify(`Layer already named "${newName}"`, { timeout: 2e3 });
        return;
      }
      const success = renameLayer(sceneNode, newName);
      const result = {
        success,
        fixType: "naming",
        nodeId: data.nodeId,
        message: success ? `Renamed "${oldName}" to "${newName}"` : `Failed to rename layer`,
        oldName,
        newName: success ? newName : oldName
      };
      sendMessageToUI("fix-applied", result);
      if (success) {
        figma.notify(`Renamed "${oldName}" to "${newName}"`, { timeout: 2e3 });
      } else {
        figma.notify("Failed to rename layer", { error: true });
      }
    } catch (error) {
      console.error("Error applying naming fix:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      sendMessageToUI("fix-applied", { success: false, error: errorMessage });
      figma.notify(`Failed to rename: ${errorMessage}`, { error: true });
    }
  }
  async function handleApplyBatchFix(data) {
    try {
      const results = [];
      let successCount = 0;
      let errorCount = 0;
      for (const fix of data.fixes) {
        try {
          const node = await figma.getNodeByIdAsync(fix.nodeId);
          if (!node || !("type" in node)) {
            results.push({
              nodeId: fix.nodeId,
              success: false,
              message: "Node not found",
              error: "Node not found or is not a valid scene node"
            });
            errorCount++;
            continue;
          }
          const sceneNode = node;
          if (fix.type === "token") {
            if (!fix.propertyPath) {
              results.push({
                nodeId: fix.nodeId,
                success: false,
                message: "Missing property path",
                error: "Token fixes require a propertyPath"
              });
              errorCount++;
              continue;
            }
            let tokenId = fix.tokenId;
            const isColorProperty = /^(fills|strokes)\[\d+\]$/.test(fix.propertyPath);
            if (!tokenId && fix.newValue) {
              try {
                if (isColorProperty) {
                  const colorMatches = await findMatchingColorVariable(fix.newValue, 0.1);
                  if (colorMatches.length > 0) {
                    tokenId = colorMatches[0].variableId;
                  }
                } else {
                  const pixelValue = parseFloat(fix.newValue);
                  if (!isNaN(pixelValue)) {
                    const spacingMatches = await findBestMatchingVariable(pixelValue, fix.propertyPath || "", 2);
                    if (spacingMatches.length > 0) {
                      tokenId = spacingMatches[0].variableId;
                    }
                  }
                }
              } catch (matchError) {
                console.warn("Could not find matching variable:", matchError);
              }
            }
            if (!tokenId) {
              results.push({
                nodeId: fix.nodeId,
                success: false,
                message: "No matching design token found for this value",
                error: "Could not find a matching variable to bind"
              });
              errorCount++;
              continue;
            }
            let result;
            if (isColorProperty) {
              result = await applyColorFix(sceneNode, fix.propertyPath, tokenId);
            } else {
              result = await applySpacingFix(sceneNode, fix.propertyPath, tokenId);
            }
            results.push({
              nodeId: fix.nodeId,
              success: result.success,
              message: result.message,
              error: result.error
            });
            if (result.success) {
              successCount++;
            } else {
              errorCount++;
            }
          } else if (fix.type === "naming") {
            const newName = fix.newValue || suggestLayerName(sceneNode);
            const oldName = sceneNode.name;
            const success = renameLayer(sceneNode, newName);
            results.push({
              nodeId: fix.nodeId,
              success,
              message: success ? `Renamed "${oldName}" to "${newName}"` : "Failed to rename layer"
            });
            if (success) {
              successCount++;
            } else {
              errorCount++;
            }
          } else {
            results.push({
              nodeId: fix.nodeId,
              success: false,
              message: `Unknown fix type: ${fix.type}`,
              error: `Unsupported fix type: ${fix.type}`
            });
            errorCount++;
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          results.push({
            nodeId: fix.nodeId,
            success: false,
            message: "Error applying fix",
            error: errorMessage
          });
          errorCount++;
        }
      }
      const summary = {
        total: data.fixes.length,
        success: successCount,
        errors: errorCount,
        results
      };
      sendMessageToUI("batch-fix-applied", summary);
      if (errorCount === 0) {
        figma.notify(`Applied ${successCount} fix${successCount !== 1 ? "es" : ""} successfully`, { timeout: 2e3 });
      } else if (successCount > 0) {
        figma.notify(`Applied ${successCount} fix${successCount !== 1 ? "es" : ""}, ${errorCount} failed`, { timeout: 3e3 });
      } else {
        figma.notify(`Failed to apply ${errorCount} fix${errorCount !== 1 ? "es" : ""}`, { error: true });
      }
    } catch (error) {
      console.error("Error applying batch fixes:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      sendMessageToUI("batch-fix-applied", {
        total: data.fixes.length,
        success: 0,
        errors: data.fixes.length,
        error: errorMessage
      });
      figma.notify(`Batch fix failed: ${errorMessage}`, { error: true });
    }
  }
  async function handleUpdateDescription(data) {
    try {
      const node = await figma.getNodeByIdAsync(data.nodeId);
      if (!node) {
        sendMessageToUI("description-updated", {
          success: false,
          error: "Node not found"
        });
        figma.notify("Failed to update description: Node not found", { error: true });
        return;
      }
      if (node.type !== "COMPONENT" && node.type !== "COMPONENT_SET") {
        sendMessageToUI("description-updated", {
          success: false,
          error: "Node is not a component or component set"
        });
        figma.notify("Description can only be set on components", { error: true });
        return;
      }
      const componentNode = node;
      const oldDescription = componentNode.description;
      componentNode.description = data.description;
      sendMessageToUI("description-updated", {
        success: true,
        oldDescription,
        newDescription: data.description
      });
      figma.notify("Component description updated", { timeout: 2e3 });
    } catch (error) {
      console.error("Error updating description:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      sendMessageToUI("description-updated", {
        success: false,
        error: errorMessage
      });
      figma.notify(`Failed to update description: ${errorMessage}`, { error: true });
    }
  }
  async function handleAddComponentProperty(data) {
    try {
      const { nodeId, propertyName, propertyType, defaultValue } = data;
      const node = await figma.getNodeByIdAsync(nodeId);
      if (!node) {
        sendMessageToUI("property-added", {
          success: false,
          propertyName,
          message: "Node not found"
        });
        figma.notify("Node not found", { error: true });
        return;
      }
      let targetNode = null;
      if (node.type === "COMPONENT") {
        const component = node;
        if (component.parent && component.parent.type === "COMPONENT_SET") {
          targetNode = component.parent;
        } else {
          targetNode = component;
        }
      } else if (node.type === "COMPONENT_SET") {
        targetNode = node;
      } else if (node.type === "INSTANCE") {
        const mainComponent = await node.getMainComponentAsync();
        if (mainComponent) {
          if (mainComponent.parent && mainComponent.parent.type === "COMPONENT_SET") {
            targetNode = mainComponent.parent;
          } else {
            targetNode = mainComponent;
          }
        }
      }
      if (!targetNode) {
        sendMessageToUI("property-added", {
          success: false,
          propertyName,
          message: "Selected node is not a component"
        });
        figma.notify("Selected node is not a component", { error: true });
        return;
      }
      const existingDefs = targetNode.componentPropertyDefinitions;
      for (const key of Object.keys(existingDefs)) {
        const baseName = key.replace(/#\d+:\d+$/, "");
        if (baseName.toLowerCase() === propertyName.toLowerCase()) {
          sendMessageToUI("property-added", {
            success: false,
            propertyName,
            message: `Property "${propertyName}" already exists`
          });
          figma.notify(`Property "${propertyName}" already exists`, { error: true });
          return;
        }
      }
      let figmaType;
      switch (propertyType.toLowerCase()) {
        case "boolean":
          figmaType = "BOOLEAN";
          break;
        case "text":
          figmaType = "TEXT";
          break;
        case "slot":
          figmaType = "INSTANCE_SWAP";
          break;
        case "variant":
          if (targetNode.type === "COMPONENT_SET") {
            figmaType = "VARIANT";
          } else {
            figmaType = "TEXT";
          }
          break;
        default:
          figmaType = "TEXT";
      }
      targetNode.addComponentProperty(propertyName, figmaType, defaultValue);
      let stagingNote = "";
      if (figmaType === "VARIANT" && targetNode.type === "COMPONENT_SET" && data.variantOptions && data.variantOptions.length > 1) {
        const componentSet = targetNode;
        const existingChildren = [...componentSet.children];
        const additionalOptions = data.variantOptions.slice(1);
        const searchStr = `${propertyName}=${defaultValue}`;
        const page = figma.currentPage;
        let containerNode = componentSet;
        while (containerNode.parent && containerNode.parent.type !== "PAGE") {
          containerNode = containerNode.parent;
        }
        const absX = containerNode.absoluteTransform[0][2];
        const absY = containerNode.absoluteTransform[1][2];
        const stagingX = absX;
        const stagingY = absY + containerNode.height + 50;
        const section = figma.createSection();
        section.name = `FigmaLint: ${propertyName} Variants`;
        page.appendChild(section);
        section.x = stagingX;
        section.y = stagingY;
        const label = figma.createText();
        await figma.loadFontAsync({ family: "Inter", style: "Medium" });
        label.fontName = { family: "Inter", style: "Medium" };
        label.characters = `New "${propertyName}" variants \u2014 drag into the ComponentSet`;
        label.fontSize = 14;
        label.fills = [{ type: "SOLID", color: { r: 0.4, g: 0.4, b: 0.4 } }];
        section.appendChild(label);
        label.x = 24;
        label.y = 24;
        const padding = 24;
        const childGap = 32;
        let currentY = label.y + label.height + 24;
        let maxWidth = label.width + padding * 2;
        for (const option of additionalOptions) {
          const replaceStr = `${propertyName}=${option}`;
          const optionLabel = figma.createText();
          await figma.loadFontAsync({ family: "Inter", style: "Semi Bold" });
          optionLabel.fontName = { family: "Inter", style: "Semi Bold" };
          optionLabel.characters = `${propertyName}=${option}`;
          optionLabel.fontSize = 12;
          optionLabel.fills = [{ type: "SOLID", color: { r: 0.6, g: 0.3, b: 0.9 } }];
          section.appendChild(optionLabel);
          optionLabel.x = padding;
          optionLabel.y = currentY;
          currentY += optionLabel.height + 12;
          let rowX = padding;
          let rowMaxHeight = 0;
          for (const child of existingChildren) {
            const clone = child.clone();
            clone.name = clone.name.replace(searchStr, replaceStr);
            section.appendChild(clone);
            clone.x = rowX;
            clone.y = currentY;
            rowX += clone.width + childGap;
            rowMaxHeight = Math.max(rowMaxHeight, clone.height);
          }
          maxWidth = Math.max(maxWidth, rowX - childGap + padding);
          currentY += rowMaxHeight + childGap;
        }
        section.resizeWithoutConstraints(
          Math.max(maxWidth, 400),
          currentY + padding
        );
        stagingNote = ` \u2014 new variants created in staging section to the right`;
      }
      sendMessageToUI("property-added", {
        success: true,
        propertyName,
        message: `Property "${propertyName}" added successfully${stagingNote}`
      });
      figma.notify(`Property "${propertyName}" added${stagingNote ? " (see staging section)" : ""}`, { timeout: 3e3 });
    } catch (error) {
      console.error("Error adding component property:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      sendMessageToUI("property-added", {
        success: false,
        propertyName: data.propertyName,
        message: errorMessage
      });
      figma.notify(`Failed to add property: ${errorMessage}`, { error: true });
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
