/// <reference types="@figma/plugin-typings" />

// =============================================================================
// NAMING FIXER MODULE
// Layer naming auto-fix functionality for FigmaLint plugin
// =============================================================================

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Severity levels for naming issues
 */
export type NamingIssueSeverity = 'error' | 'warning' | 'info';

/**
 * Naming strategies available for batch operations
 */
export enum NamingStrategy {
  SEMANTIC = 'semantic',
  BEM = 'bem',
  PREFIX_BASED = 'prefix-based',
  CAMEL_CASE = 'camelCase',
  KEBAB_CASE = 'kebab-case',
  SNAKE_CASE = 'snake_case',
}

/**
 * Semantic layer types detected from node content and structure
 */
export type SemanticLayerType =
  | 'button'
  | 'icon'
  | 'text'
  | 'input'
  | 'image'
  | 'container'
  | 'card'
  | 'list'
  | 'list-item'
  | 'nav'
  | 'header'
  | 'footer'
  | 'modal'
  | 'dropdown'
  | 'checkbox'
  | 'radio'
  | 'toggle'
  | 'avatar'
  | 'badge'
  | 'divider'
  | 'spacer'
  | 'link'
  | 'tab'
  | 'tooltip'
  | 'alert'
  | 'progress'
  | 'skeleton'
  | 'unknown';

/**
 * Interface for naming issues found in a node
 */
export interface NamingIssue {
  nodeId: string;
  nodeName: string;
  currentName: string;
  suggestedName: string;
  severity: NamingIssueSeverity;
  reason: string;
  layerType: SemanticLayerType;
  depth: number;
  path: string;
}

/**
 * Interface for rename preview results
 */
export interface RenamePreview {
  nodeId: string;
  currentName: string;
  newName: string;
  layerType: SemanticLayerType;
  willChange: boolean;
  children?: RenamePreview[];
}

/**
 * Interface for batch rename results
 */
export interface BatchRenameResult {
  success: boolean;
  renamed: number;
  skipped: number;
  errors: string[];
  previews: RenamePreview[];
}

/**
 * Naming convention configuration
 */
export interface NamingConvention {
  strategy: NamingStrategy;
  prefix?: string;
  separator?: string;
  includeType?: boolean;
  maxLength?: number;
}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/**
 * Pattern to detect generic Figma layer names
 */
export const GENERIC_NAMES = /^(Frame|Rectangle|Ellipse|Group|Vector|Line|Polygon|Star|Text|Component|Instance|Slice|Boolean|Union|Subtract|Intersect|Exclude)\s*\d*$/i;

/**
 * Pattern to detect numbered suffixes (e.g., "Button 2", "Icon 3")
 */
export const NUMBERED_SUFFIX = /\s+\d+$/;

/**
 * Component type prefixes for naming conventions
 */
export const COMPONENT_PREFIXES: Record<SemanticLayerType, string> = {
  button: 'btn',
  icon: 'ico',
  input: 'input',
  text: 'txt',
  image: 'img',
  container: 'container',
  card: 'card',
  list: 'list',
  'list-item': 'list-item',
  nav: 'nav',
  header: 'header',
  footer: 'footer',
  modal: 'modal',
  dropdown: 'dropdown',
  checkbox: 'checkbox',
  radio: 'radio',
  toggle: 'toggle',
  avatar: 'avatar',
  badge: 'badge',
  divider: 'divider',
  spacer: 'spacer',
  link: 'link',
  tab: 'tab',
  tooltip: 'tooltip',
  alert: 'alert',
  progress: 'progress',
  skeleton: 'skeleton',
  unknown: 'layer',
};

/**
 * Keywords that indicate specific layer types as array entries for iteration
 * Note: When multiple keywords could match, the first match in iteration order wins
 */
const TYPE_KEYWORD_ENTRIES: Array<[string, SemanticLayerType]> = [
  ['btn', 'button'],
  ['button', 'button'],
  ['cta', 'button'],
  ['submit', 'button'],
  ['icon', 'icon'],
  ['ico', 'icon'],
  ['glyph', 'icon'],
  ['symbol', 'icon'],
  ['arrow', 'icon'],
  ['chevron', 'icon'],
  ['close', 'icon'],
  ['plus', 'icon'],
  ['minus', 'icon'],
  ['txt', 'text'],
  ['label', 'text'],
  ['title', 'text'],
  ['heading', 'text'],
  ['paragraph', 'text'],
  ['description', 'text'],
  ['caption', 'text'],
  ['subtitle', 'text'],
  ['input', 'input'],
  ['field', 'input'],
  ['textfield', 'input'],
  ['textarea', 'input'],
  ['searchfield', 'input'],
  ['searchbox', 'input'],
  ['image', 'image'],
  ['img', 'image'],
  ['photo', 'image'],
  ['picture', 'image'],
  ['thumbnail', 'image'],
  ['cover', 'image'],
  ['container', 'container'],
  ['wrapper', 'container'],
  ['content', 'container'],
  ['section', 'container'],
  ['block', 'container'],
  ['box', 'container'],
  ['card', 'card'],
  ['tile', 'card'],
  ['panel', 'card'],
  ['list', 'list'],
  ['items', 'list'],
  ['item', 'list-item'],
  ['row', 'list-item'],
  ['listitem', 'list-item'],
  ['nav', 'nav'],
  ['navbar', 'nav'],
  ['navigation', 'nav'],
  ['sidebar', 'nav'],
  ['breadcrumb', 'nav'],
  ['menu', 'nav'],
  ['header', 'header'],
  ['topbar', 'header'],
  ['footer', 'footer'],
  ['bottombar', 'footer'],
  ['modal', 'modal'],
  ['dialog', 'modal'],
  ['popup', 'modal'],
  ['overlay', 'modal'],
  ['dropdown', 'dropdown'],
  ['select', 'dropdown'],
  ['picker', 'dropdown'],
  ['combobox', 'dropdown'],
  ['checkbox', 'checkbox'],
  ['checkmark', 'checkbox'],
  ['radio', 'radio'],
  ['toggle', 'toggle'],
  ['switch', 'toggle'],
  ['avatar', 'avatar'],
  ['profile', 'avatar'],
  ['userpic', 'avatar'],
  ['badge', 'badge'],
  ['tag', 'badge'],
  ['chip', 'badge'],
  ['pill', 'badge'],
  ['status', 'badge'],
  ['divider', 'divider'],
  ['separator', 'divider'],
  ['hr', 'divider'],
  ['spacer', 'spacer'],
  ['gap', 'spacer'],
  ['link', 'link'],
  ['anchor', 'link'],
  ['href', 'link'],
  ['tab', 'tab'],
  ['tabs', 'tab'],
  ['tabbar', 'tab'],
  ['tooltip', 'tooltip'],
  ['hint', 'tooltip'],
  ['popover', 'tooltip'],
  ['alert', 'alert'],
  ['notification', 'alert'],
  ['toast', 'alert'],
  ['message', 'alert'],
  ['snackbar', 'alert'],
  ['banner', 'alert'],
  ['progress', 'progress'],
  ['loader', 'progress'],
  ['loading', 'progress'],
  ['spinner', 'progress'],
  ['progressbar', 'progress'],
  ['skeleton', 'skeleton'],
  ['placeholder', 'skeleton'],
  ['shimmer', 'skeleton'],
];

// -----------------------------------------------------------------------------
// Naming Analysis Functions
// -----------------------------------------------------------------------------

/**
 * Check if a name is a generic Figma default name
 * @param name - The layer name to check
 * @returns True if the name is generic
 */
export function isGenericName(name: string): boolean {
  if (!name || typeof name !== 'string') {
    return true;
  }

  const trimmedName = name.trim();

  // Check against the generic names pattern
  if (GENERIC_NAMES.test(trimmedName)) {
    return true;
  }

  // Check for single character names
  if (trimmedName.length === 1) {
    return true;
  }

  // Check for purely numeric names
  if (/^\d+$/.test(trimmedName)) {
    return true;
  }

  return false;
}

/**
 * Check if a name has a numbered suffix that might indicate duplication
 * @param name - The layer name to check
 * @returns True if the name has a numbered suffix
 */
export function hasNumberedSuffix(name: string): boolean {
  return NUMBERED_SUFFIX.test(name.trim());
}

/**
 * Detect the semantic type of a layer based on its content and structure
 * @param node - The Figma node to analyze
 * @returns The detected semantic layer type
 */
export function detectLayerType(node: SceneNode): SemanticLayerType {
  const name = node.name.toLowerCase();

  // First, check if the name contains known keywords
  for (let i = 0; i < TYPE_KEYWORD_ENTRIES.length; i++) {
    const entry = TYPE_KEYWORD_ENTRIES[i];
    if (name.indexOf(entry[0]) !== -1) {
      return entry[1];
    }
  }

  // Detect based on node type and properties
  switch (node.type) {
    case 'TEXT':
      return 'text';

    case 'VECTOR':
    case 'STAR':
    case 'POLYGON':
    case 'BOOLEAN_OPERATION':
      // Likely an icon if it's a vector shape
      return 'icon';

    case 'RECTANGLE':
    case 'ELLIPSE':
    case 'LINE':
      // Could be divider, spacer, or image placeholder
      if ('fills' in node && Array.isArray(node.fills)) {
        const fills = node.fills as readonly Paint[];
        let hasImageFill = false;
        for (let i = 0; i < fills.length; i++) {
          const fill = fills[i];
          if (fill.type === 'IMAGE' && fill.visible !== false) {
            hasImageFill = true;
            break;
          }
        }
        if (hasImageFill) {
          return 'image';
        }
      }

      // Check dimensions for divider/spacer detection
      if ('width' in node && 'height' in node) {
        const width = node.width;
        const height = node.height;
        const aspectRatio = width / height;

        // Very thin horizontal or vertical = divider
        if (height <= 2 && width > 20) {
          return 'divider';
        }
        if (width <= 2 && height > 20) {
          return 'divider';
        }

        // Square-ish small element could be spacer
        if (width <= 32 && height <= 32 && aspectRatio > 0.5 && aspectRatio < 2) {
          return 'spacer';
        }
      }

      return 'unknown';

    case 'FRAME':
    case 'GROUP':
      return detectFrameType(node as FrameNode | GroupNode);

    case 'COMPONENT':
    case 'INSTANCE':
      return detectComponentType(node as ComponentNode | InstanceNode);

    case 'COMPONENT_SET':
      return detectComponentSetType(node as ComponentSetNode);

    default:
      return 'unknown';
  }
}

/**
 * Detect the semantic type of a frame or group based on its children
 */
function detectFrameType(node: FrameNode | GroupNode): SemanticLayerType {
  if (!('children' in node) || node.children.length === 0) {
    return 'container';
  }

  const children = node.children;
  const childTypes: string[] = [];
  const childNames: string[] = [];

  for (let i = 0; i < children.length; i++) {
    childTypes.push(children[i].type);
    childNames.push(children[i].name.toLowerCase());
  }

  // Check for button patterns: small frame with text and possibly icon
  let hasText = false;
  let hasIcon = false;

  for (let i = 0; i < childTypes.length; i++) {
    if (childTypes[i] === 'TEXT') {
      hasText = true;
    }
    if (childTypes[i] === 'VECTOR' || childNames[i].indexOf('icon') !== -1) {
      hasIcon = true;
    }
  }

  const isSmall =
    'width' in node && 'height' in node && node.width < 300 && node.height < 100;

  if (hasText && isSmall && (hasIcon || children.length <= 3)) {
    // Could be a button
    if ('layoutMode' in node && node.layoutMode !== 'NONE') {
      return 'button';
    }
  }

  // Check for card patterns: has multiple children including text and images
  let hasImage = false;
  for (let i = 0; i < childTypes.length; i++) {
    if (childTypes[i] === 'RECTANGLE' || childNames[i].indexOf('image') !== -1) {
      hasImage = true;
      break;
    }
  }
  if (hasText && hasImage && children.length >= 2) {
    return 'card';
  }

  // Check for list patterns: multiple similar children
  if (children.length >= 3) {
    const firstChildType = children[0].type;
    let allSameType = true;
    for (let i = 1; i < children.length; i++) {
      if (children[i].type !== firstChildType) {
        allSameType = false;
        break;
      }
    }
    if (allSameType && (firstChildType === 'FRAME' || firstChildType === 'INSTANCE')) {
      return 'list';
    }
  }

  // Check for input field patterns
  if ('cornerRadius' in node && node.cornerRadius && children.length <= 2) {
    if (hasText && isSmall) {
      return 'input';
    }
  }

  // Check for nav patterns
  if ('layoutMode' in node && node.layoutMode === 'HORIZONTAL') {
    let clickableCount = 0;
    for (let i = 0; i < children.length; i++) {
      const childType = children[i].type;
      if (childType === 'FRAME' || childType === 'INSTANCE' || childType === 'TEXT') {
        clickableCount++;
      }
    }
    if (clickableCount >= 3 && isSmall) {
      return 'nav';
    }
  }

  return 'container';
}

/**
 * Detect the semantic type of a component or instance
 */
function detectComponentType(node: ComponentNode | InstanceNode): SemanticLayerType {
  const name = node.name.toLowerCase();

  // Check component name for type hints
  for (let i = 0; i < TYPE_KEYWORD_ENTRIES.length; i++) {
    const entry = TYPE_KEYWORD_ENTRIES[i];
    if (name.indexOf(entry[0]) !== -1) {
      return entry[1];
    }
  }

  // Fallback to frame-based detection
  if ('children' in node) {
    return detectFrameType(node as unknown as FrameNode);
  }

  return 'unknown';
}

/**
 * Detect the semantic type of a component set
 */
function detectComponentSetType(node: ComponentSetNode): SemanticLayerType {
  const name = node.name.toLowerCase();

  // Check component set name for type hints
  for (let i = 0; i < TYPE_KEYWORD_ENTRIES.length; i++) {
    const entry = TYPE_KEYWORD_ENTRIES[i];
    if (name.indexOf(entry[0]) !== -1) {
      return entry[1];
    }
  }

  // Check the first variant
  if ('children' in node && node.children.length > 0) {
    return detectComponentType(node.children[0] as ComponentNode);
  }

  return 'unknown';
}

/**
 * Analyze naming issues in a node and its children
 * @param node - The root node to analyze
 * @param maxDepth - Maximum depth to traverse (default: 10)
 * @returns Array of naming issues found
 */
export function analyzeNamingIssues(
  node: SceneNode,
  maxDepth: number = 10
): NamingIssue[] {
  const issues: NamingIssue[] = [];

  function traverse(currentNode: SceneNode, depth: number, path: string): void {
    if (depth > maxDepth) {
      return;
    }

    const currentPath = path ? `${path} > ${currentNode.name}` : currentNode.name;
    const layerType = detectLayerType(currentNode);

    // Check for generic names
    if (isGenericName(currentNode.name)) {
      const suggestedName = suggestLayerName(currentNode);
      issues.push({
        nodeId: currentNode.id,
        nodeName: currentNode.name,
        currentName: currentNode.name,
        suggestedName,
        severity: 'error',
        reason: 'Generic layer name detected',
        layerType,
        depth,
        path: currentPath,
      });
    }
    // Check for numbered suffixes that might indicate duplicates
    else if (hasNumberedSuffix(currentNode.name)) {
      const baseName = currentNode.name.replace(NUMBERED_SUFFIX, '').trim();
      const suggestedName = suggestLayerName(currentNode);
      issues.push({
        nodeId: currentNode.id,
        nodeName: currentNode.name,
        currentName: currentNode.name,
        suggestedName: suggestedName !== currentNode.name ? suggestedName : baseName,
        severity: 'warning',
        reason: 'Layer name has numbered suffix (possible duplicate)',
        layerType,
        depth,
        path: currentPath,
      });
    }

    // Traverse children
    if ('children' in currentNode) {
      for (let i = 0; i < currentNode.children.length; i++) {
        traverse(currentNode.children[i], depth + 1, currentPath);
      }
    }
  }

  traverse(node, 0, '');
  return issues;
}

// -----------------------------------------------------------------------------
// Name Suggestion Functions
// -----------------------------------------------------------------------------

/**
 * Suggest a semantic name for a layer based on its content and context
 * @param node - The node to suggest a name for
 * @returns Suggested semantic name
 */
export function suggestLayerName(node: SceneNode): string {
  const layerType = detectLayerType(node);

  // For text nodes, use the text content
  if (node.type === 'TEXT') {
    return generateTextName(node as TextNode);
  }

  // For vector/icon nodes
  if (
    node.type === 'VECTOR' ||
    node.type === 'STAR' ||
    node.type === 'POLYGON' ||
    node.type === 'BOOLEAN_OPERATION'
  ) {
    return generateIconName(node);
  }

  // For frames and components, analyze children
  if ('children' in node && node.children.length > 0) {
    return generateContainerName(node as FrameNode | GroupNode | ComponentNode | InstanceNode);
  }

  // Default: use the type prefix
  return COMPONENT_PREFIXES[layerType] || 'layer';
}

/**
 * Suggest a BEM-style name for a layer
 * @param node - The node to name
 * @param parentName - Optional parent block name
 * @param modifier - Optional modifier
 * @returns BEM-formatted name (block__element--modifier)
 */
export function suggestBEMName(
  node: SceneNode,
  parentName?: string,
  modifier?: string
): string {
  const layerType = detectLayerType(node);
  const elementName = COMPONENT_PREFIXES[layerType] || 'element';

  let bemName = '';

  if (parentName) {
    // This is an element within a block
    bemName = `${toKebabCase(parentName)}__${elementName}`;
  } else {
    // This is a block
    bemName = elementName;
  }

  if (modifier) {
    bemName += `--${toKebabCase(modifier)}`;
  }

  return bemName;
}

/**
 * Generate a name for icon layers based on their appearance
 * @param node - The icon node
 * @returns Generated icon name
 */
export function generateIconName(node: SceneNode): string {
  const name = node.name.toLowerCase();

  // Try to extract meaningful name from existing name
  const meaningfulPart = name
    .replace(GENERIC_NAMES, '')
    .replace(/[_\-\s]+/g, '-')
    .replace(/^-|-$/g, '')
    .trim();

  if (meaningfulPart && meaningfulPart.length > 1) {
    return `icon-${toKebabCase(meaningfulPart)}`;
  }

  // Check for common icon patterns in the node structure
  if ('children' in node && node.children.length > 0) {
    // Analyze children for shape hints
    const childTypes: string[] = [];
    for (let i = 0; i < node.children.length; i++) {
      childTypes.push(node.children[i].type);
    }

    for (let i = 0; i < childTypes.length; i++) {
      if (childTypes[i] === 'ELLIPSE') {
        return 'icon-circle';
      }
      if (childTypes[i] === 'STAR') {
        return 'icon-star';
      }
      if (childTypes[i] === 'POLYGON') {
        return 'icon-shape';
      }
    }
  }

  // Check dimensions for arrow-like shapes
  if ('width' in node && 'height' in node) {
    const aspectRatio = node.width / node.height;
    if (aspectRatio > 1.5 || aspectRatio < 0.67) {
      return 'icon-arrow';
    }
  }

  return 'icon';
}

/**
 * Generate a name for text layers based on their content
 * @param node - The text node
 * @returns Generated text name
 */
export function generateTextName(node: TextNode): string {
  const text = node.characters || '';
  const trimmedText = text.trim();

  if (!trimmedText) {
    return 'text-empty';
  }

  // For very short text (1-2 words), use it directly
  const words = trimmedText.split(/\s+/);
  if (words.length <= 2 && trimmedText.length <= 30) {
    const kebab = toKebabCase(trimmedText);
    // If toKebabCase stripped all characters (e.g., "#", symbols), use a descriptive fallback
    if (kebab) {
      return `text-${kebab}`;
    }
    return 'text-content';
  }

  // For longer text, create a summary
  const firstWord = words[0].toLowerCase();

  // Check for common text patterns
  const headingKeywords = ['welcome', 'about', 'contact', 'services', 'features', 'pricing'];
  const labelKeywords = ['name', 'email', 'password', 'username', 'address', 'phone'];
  const buttonKeywords = ['submit', 'cancel', 'save', 'delete', 'edit', 'add', 'remove', 'ok', 'yes', 'no'];
  const linkKeywords = ['learn', 'read', 'view', 'see', 'click', 'here', 'more'];
  const errorKeywords = ['error', 'invalid', 'required', 'failed', 'wrong'];
  const successKeywords = ['success', 'done', 'complete', 'saved', 'updated'];

  const lowerText = trimmedText.toLowerCase();

  for (let i = 0; i < headingKeywords.length; i++) {
    if (firstWord.indexOf(headingKeywords[i]) !== -1 || lowerText.indexOf(headingKeywords[i]) !== -1) {
      return `text-heading-${toKebabCase(words.slice(0, 2).join(' '))}`;
    }
  }

  for (let i = 0; i < labelKeywords.length; i++) {
    if (firstWord.indexOf(labelKeywords[i]) !== -1 || lowerText.indexOf(labelKeywords[i]) !== -1) {
      return `text-label-${toKebabCase(words.slice(0, 2).join(' '))}`;
    }
  }

  for (let i = 0; i < buttonKeywords.length; i++) {
    if (firstWord.indexOf(buttonKeywords[i]) !== -1 || lowerText.indexOf(buttonKeywords[i]) !== -1) {
      return `text-button-${toKebabCase(words.slice(0, 2).join(' '))}`;
    }
  }

  for (let i = 0; i < linkKeywords.length; i++) {
    if (firstWord.indexOf(linkKeywords[i]) !== -1 || lowerText.indexOf(linkKeywords[i]) !== -1) {
      return `text-link-${toKebabCase(words.slice(0, 2).join(' '))}`;
    }
  }

  for (let i = 0; i < errorKeywords.length; i++) {
    if (firstWord.indexOf(errorKeywords[i]) !== -1 || lowerText.indexOf(errorKeywords[i]) !== -1) {
      return `text-error-${toKebabCase(words.slice(0, 2).join(' '))}`;
    }
  }

  for (let i = 0; i < successKeywords.length; i++) {
    if (firstWord.indexOf(successKeywords[i]) !== -1 || lowerText.indexOf(successKeywords[i]) !== -1) {
      return `text-success-${toKebabCase(words.slice(0, 2).join(' '))}`;
    }
  }

  // Default: use first two words
  const defaultKebab = toKebabCase(words.slice(0, 2).join(' '));
  return defaultKebab ? `text-${defaultKebab}` : 'text-content';
}

/**
 * Generate a name for container-like nodes based on their children
 */
function generateContainerName(
  node: FrameNode | GroupNode | ComponentNode | InstanceNode
): string {
  const layerType = detectLayerType(node);
  const prefix = COMPONENT_PREFIXES[layerType];

  // Try to get context from children
  if ('children' in node && node.children.length > 0) {
    // Find text children for context
    let textChild: TextNode | undefined;
    for (let i = 0; i < node.children.length; i++) {
      if (node.children[i].type === 'TEXT') {
        textChild = node.children[i] as TextNode;
        break;
      }
    }

    if (textChild && textChild.characters) {
      const text = textChild.characters.trim();
      const words = text.split(/\s+/).slice(0, 2);
      if (words.length > 0 && words[0].length > 0) {
        return `${prefix}-${toKebabCase(words.join(' '))}`;
      }
    }

    // For buttons/inputs, try to identify the action
    if (layerType === 'button' || layerType === 'input') {
      let iconChild: SceneNode | undefined;
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === 'VECTOR' || child.name.toLowerCase().indexOf('icon') !== -1) {
          iconChild = child;
          break;
        }
      }

      if (iconChild) {
        const iconName = iconChild.name.toLowerCase().replace(/icon[-_\s]*/gi, '');
        if (iconName && !isGenericName(iconName)) {
          return `${prefix}-${toKebabCase(iconName)}`;
        }
      }
    }
  }

  return prefix;
}

// -----------------------------------------------------------------------------
// Rename Functions
// -----------------------------------------------------------------------------

/**
 * Rename a single layer
 * @param node - The node to rename
 * @param newName - The new name to apply
 * @returns True if rename was successful
 */
export function renameLayer(node: SceneNode, newName: string): boolean {
  if (!node || !newName || typeof newName !== 'string') {
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
    console.error('Failed to rename layer:', error);
    return false;
  }
}

/**
 * Batch rename multiple layers with a naming strategy
 * @param nodes - Array of nodes to rename
 * @param strategy - The naming strategy to apply
 * @param options - Additional options for naming
 * @returns Result of the batch rename operation
 */
export function batchRename(
  nodes: SceneNode[],
  strategy: NamingStrategy,
  options: {
    prefix?: string;
    parentName?: string;
    dryRun?: boolean;
  } = {}
): BatchRenameResult {
  const result: BatchRenameResult = {
    success: true,
    renamed: 0,
    skipped: 0,
    errors: [],
    previews: [],
  };

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    try {
      let newName: string;

      switch (strategy) {
        case NamingStrategy.SEMANTIC:
          newName = suggestLayerName(node);
          break;

        case NamingStrategy.BEM:
          newName = suggestBEMName(node, options.parentName);
          break;

        case NamingStrategy.PREFIX_BASED:
          const layerType = detectLayerType(node);
          const prefix = options.prefix || COMPONENT_PREFIXES[layerType];
          newName = `${prefix}-${toKebabCase(node.name)}`;
          break;

        case NamingStrategy.CAMEL_CASE:
          newName = toCamelCase(suggestLayerName(node));
          break;

        case NamingStrategy.KEBAB_CASE:
          newName = toKebabCase(suggestLayerName(node));
          break;

        case NamingStrategy.SNAKE_CASE:
          newName = toSnakeCase(suggestLayerName(node));
          break;

        default:
          newName = suggestLayerName(node);
      }

      const preview: RenamePreview = {
        nodeId: node.id,
        currentName: node.name,
        newName,
        layerType: detectLayerType(node),
        willChange: node.name !== newName,
      };

      result.previews.push(preview);

      if (!options.dryRun && preview.willChange) {
        const renamed = renameLayer(node, newName);
        if (renamed) {
          result.renamed++;
        } else {
          result.skipped++;
        }
      } else if (!preview.willChange) {
        result.skipped++;
      }
    } catch (error) {
      result.errors.push(`Failed to process node ${node.id}: ${String(error)}`);
      result.success = false;
    }
  }

  return result;
}

/**
 * Apply a naming convention to a node and its children recursively
 * @param node - The root node to apply naming to
 * @param convention - The naming convention to apply
 * @param options - Additional options
 * @returns Result of the operation
 */
export function applyNamingConvention(
  node: SceneNode,
  convention: NamingConvention,
  options: {
    maxDepth?: number;
    dryRun?: boolean;
    onlyGeneric?: boolean;
  } = {}
): BatchRenameResult {
  const maxDepth = options.maxDepth ?? 10;
  const nodesToRename: SceneNode[] = [];

  function collectNodes(currentNode: SceneNode, depth: number): void {
    if (depth > maxDepth) {
      return;
    }

    // Check if we should include this node
    const shouldInclude = options.onlyGeneric ? isGenericName(currentNode.name) : true;

    if (shouldInclude) {
      nodesToRename.push(currentNode);
    }

    // Traverse children
    if ('children' in currentNode) {
      for (let i = 0; i < currentNode.children.length; i++) {
        collectNodes(currentNode.children[i], depth + 1);
      }
    }
  }

  collectNodes(node, 0);

  return batchRename(nodesToRename, convention.strategy, {
    prefix: convention.prefix,
    parentName: node.name,
    dryRun: options.dryRun,
  });
}

// -----------------------------------------------------------------------------
// Preview Functions
// -----------------------------------------------------------------------------

/**
 * Preview what a rename would do without applying changes
 * @param node - The node to preview rename for
 * @param newName - The proposed new name
 * @returns Preview of the rename operation
 */
export function previewRename(node: SceneNode, newName: string): RenamePreview {
  return {
    nodeId: node.id,
    currentName: node.name,
    newName: newName.trim(),
    layerType: detectLayerType(node),
    willChange: node.name !== newName.trim(),
  };
}

/**
 * Preview batch rename results without applying changes
 * @param nodes - Array of nodes to preview
 * @param strategy - The naming strategy to preview
 * @param options - Additional options
 * @returns Preview of all rename operations
 */
export function previewBatchRename(
  nodes: SceneNode[],
  strategy: NamingStrategy,
  options: {
    prefix?: string;
    parentName?: string;
  } = {}
): RenamePreview[] {
  const result = batchRename(nodes, strategy, {
    ...options,
    dryRun: true,
  });

  return result.previews;
}

/**
 * Preview applying a naming convention to a node tree
 * @param node - The root node
 * @param convention - The naming convention to preview
 * @param options - Additional options
 * @returns Hierarchical preview of rename operations
 */
export function previewNamingConvention(
  node: SceneNode,
  convention: NamingConvention,
  options: {
    maxDepth?: number;
    onlyGeneric?: boolean;
  } = {}
): RenamePreview {
  const maxDepth = options.maxDepth ?? 10;

  function buildPreview(currentNode: SceneNode, depth: number, parentName?: string): RenamePreview {
    let newName: string;

    switch (convention.strategy) {
      case NamingStrategy.SEMANTIC:
        newName = suggestLayerName(currentNode);
        break;

      case NamingStrategy.BEM:
        newName = suggestBEMName(currentNode, parentName);
        break;

      case NamingStrategy.PREFIX_BASED:
        const layerType = detectLayerType(currentNode);
        const prefix = convention.prefix || COMPONENT_PREFIXES[layerType];
        newName = `${prefix}-${toKebabCase(currentNode.name)}`;
        break;

      default:
        newName = suggestLayerName(currentNode);
    }

    // Apply case conversion if specified
    if (convention.strategy === NamingStrategy.CAMEL_CASE) {
      newName = toCamelCase(newName);
    } else if (convention.strategy === NamingStrategy.SNAKE_CASE) {
      newName = toSnakeCase(newName);
    }

    // Apply max length if specified
    if (convention.maxLength && newName.length > convention.maxLength) {
      newName = newName.substring(0, convention.maxLength);
    }

    const shouldInclude = options.onlyGeneric ? isGenericName(currentNode.name) : true;

    const preview: RenamePreview = {
      nodeId: currentNode.id,
      currentName: currentNode.name,
      newName: shouldInclude ? newName : currentNode.name,
      layerType: detectLayerType(currentNode),
      willChange: shouldInclude && currentNode.name !== newName,
    };

    // Build children previews
    if ('children' in currentNode && depth < maxDepth) {
      preview.children = [];
      for (let i = 0; i < currentNode.children.length; i++) {
        preview.children.push(buildPreview(currentNode.children[i], depth + 1, newName));
      }
    }

    return preview;
  }

  return buildPreview(node, 0);
}

// -----------------------------------------------------------------------------
// Utility Functions
// -----------------------------------------------------------------------------

/**
 * Convert a string to kebab-case
 */
function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

/**
 * Convert a string to camelCase
 */
function toCamelCase(str: string): string {
  const kebab = toKebabCase(str);
  const parts = kebab.split('-');
  let result = '';

  for (let i = 0; i < parts.length; i++) {
    const word = parts[i];
    if (i === 0) {
      result += word;
    } else {
      result += word.charAt(0).toUpperCase() + word.slice(1);
    }
  }

  return result;
}

/**
 * Convert a string to snake_case
 */
function toSnakeCase(str: string): string {
  return toKebabCase(str).replace(/-/g, '_');
}

// -----------------------------------------------------------------------------
// Export Summary Functions
// -----------------------------------------------------------------------------

/**
 * Get a summary of naming issues in a node tree
 * @param node - The root node to analyze
 * @returns Summary statistics
 */
export function getNamingIssueSummary(node: SceneNode): {
  totalLayers: number;
  genericNames: number;
  numberedSuffixes: number;
  issues: NamingIssue[];
} {
  const issues = analyzeNamingIssues(node);

  let genericCount = 0;
  let numberedCount = 0;

  for (let i = 0; i < issues.length; i++) {
    if (issues[i].reason.indexOf('Generic') !== -1) {
      genericCount++;
    }
    if (issues[i].reason.indexOf('numbered suffix') !== -1) {
      numberedCount++;
    }
  }

  // Count total layers
  let totalLayers = 0;
  function countLayers(n: SceneNode): void {
    totalLayers++;
    if ('children' in n) {
      for (let i = 0; i < n.children.length; i++) {
        countLayers(n.children[i]);
      }
    }
  }
  countLayers(node);

  return {
    totalLayers,
    genericNames: genericCount,
    numberedSuffixes: numberedCount,
    issues,
  };
}
