/// <reference types="@figma/plugin-typings" />

/**
 * Code syntax for variables
 *
 * Figma's MCP server names a variable in generated code from its Web code
 * syntax when one is set, and otherwise from its Figma path — producing CSS
 * variables like `var(--bg\/neutral\/weak)` that don't exist in any codebase.
 * This fills in Web code syntax from each variable's path.
 *
 * Code syntax belongs to the variable, not to a component, so the default
 * scope is every local variable in the file that has none. Existing code
 * syntax is never changed, and library variables can only be edited in their
 * library file, so they're counted and skipped.
 */

export type CodeSyntaxScope = 'file' | 'component';

export interface CodeSyntaxOptions {
  nodeId: string;
  scope: CodeSyntaxScope;
  /** Optional prefix, e.g. "ds" → var(--ds-…) */
  prefix: string;
  /** Leave out the top-level group, e.g. "colors/bg/weak" → --bg-weak */
  dropTopGroup: boolean;
}

export interface CodeSyntaxPlan {
  scope: CodeSyntaxScope;
  /** Local variables without code syntax, per scope (for the scope picker) */
  fileMissing: number;
  componentMissing: number;
  /** Variables this run would set */
  targets: Array<{ id: string; name: string; web: string }>;
  /** Library variables without code syntax that can't be set from this file */
  libraryMissing: number;
  /** Variables in the file that already have Web code syntax */
  existingCount: number;
  existingExamples: Array<{ name: string; web: string }>;
  /** Targets whose name was lengthened to avoid a duplicate */
  disambiguated: number;
  /** Most common top-level group, shown next to the "leave out" option */
  topGroupExample: string;
}

const MAX_NODES = 4000;

const hasCodeSyntax = (variable: Variable) =>
  !!variable.codeSyntax && Object.values(variable.codeSyntax).some((value) => !!value);

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** "bg/neutral/weak" → "var(--bg-neutral-weak)", with optional prefix and group dropping */
export function webNameFor(path: string, prefix: string, dropTopGroup: boolean, collection = ''): string {
  let parts = path.split('/').map((part) => part.trim()).filter(Boolean);
  if (dropTopGroup && parts.length > 1) parts = parts.slice(1);
  const segments = [slug(prefix), slug(collection), ...parts.map(slug)].filter(Boolean);
  return `var(--${segments.join('-')})`;
}

/** Variables bound in a component, by the same rule as the AI handoff check: stop at instances */
async function componentVariables(nodeId: string): Promise<Variable[]> {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node || !('type' in node)) return [];
  const ids = new Set<string>();
  const collect = (value: unknown): void => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(collect);
    } else if (typeof value === 'object') {
      const alias = value as { type?: string; id?: string };
      if (alias.type === 'VARIABLE_ALIAS' && typeof alias.id === 'string') ids.add(alias.id);
      else Object.values(value as Record<string, unknown>).forEach(collect);
    }
  };
  let visited = 0;
  const walk = (current: BaseNode) => {
    if (visited++ > MAX_NODES) return;
    if ('boundVariables' in current) collect((current as SceneNode).boundVariables);
    if (current.type === 'INSTANCE' || !('children' in current)) return;
    (current as ChildrenMixin).children.forEach(walk);
  };
  walk(node);
  const variables = await Promise.all(
    [...ids].map((id) => figma.variables.getVariableByIdAsync(id).catch(() => null))
  );
  return variables.filter((variable): variable is Variable => !!variable);
}

export async function planCodeSyntax(options: CodeSyntaxOptions): Promise<CodeSyntaxPlan> {
  const local = await figma.variables.getLocalVariablesAsync();
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const collectionName = new Map(collections.map((c) => [c.id, c.name]));
  const inComponent = await componentVariables(options.nodeId);

  const fileTargets = local.filter((v) => !hasCodeSyntax(v));
  const componentTargets = inComponent.filter((v) => !v.remote && !hasCodeSyntax(v));
  const chosen = options.scope === 'file' ? fileTargets : componentTargets;

  // Every name must be unique, including against code syntax already set.
  // Collisions fall back step by step: the full path (undoing "leave out the
  // top group"), then the collection name, then a number as a last resort.
  const existing = local.filter((v) => v.codeSyntax && v.codeSyntax.WEB);
  const taken = new Set(existing.map((v) => v.codeSyntax.WEB as string));
  const collectionOf = (v: Variable) => collectionName.get(v.variableCollectionId) || '';
  const levels: Array<(v: Variable) => string> = [
    (v) => webNameFor(v.name, options.prefix, options.dropTopGroup),
    (v) => webNameFor(v.name, options.prefix, false),
    (v) => webNameFor(v.name, options.prefix, false, collectionOf(v)),
  ];
  const clashes = (names: string[]) => {
    const counts = new Map<string, number>();
    names.forEach((name) => counts.set(name, (counts.get(name) || 0) + 1));
    return new Set(names.filter((name) => (counts.get(name) || 0) > 1 || taken.has(name)));
  };
  const first = chosen.map(levels[0]);
  let names = first;
  for (let level = 1; level < levels.length; level++) {
    const clashing = clashes(names);
    if (clashing.size === 0) break;
    names = names.map((name, i) => (clashing.has(name) ? levels[level](chosen[i]) : name));
  }
  const used = new Set(taken);
  names = names.map((name) => {
    let unique = name;
    for (let n = 2; used.has(unique); n++) unique = name.replace(/\)$/, `-${n})`);
    used.add(unique);
    return unique;
  });
  const disambiguated = names.filter((name, i) => name !== first[i]).length;
  const targets = chosen.map((v, i) => ({ id: v.id, name: v.name, web: names[i] }));

  const topGroups = new Map<string, number>();
  fileTargets.forEach((v) => {
    const parts = v.name.split('/');
    if (parts.length > 1) topGroups.set(parts[0].trim(), (topGroups.get(parts[0].trim()) || 0) + 1);
  });
  const topGroupExample = [...topGroups.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';

  return {
    scope: options.scope,
    fileMissing: fileTargets.length,
    componentMissing: componentTargets.length,
    targets,
    libraryMissing: inComponent.filter((v) => v.remote && !hasCodeSyntax(v)).length,
    existingCount: existing.length,
    existingExamples: existing.slice(0, 2).map((v) => ({ name: v.name, web: v.codeSyntax.WEB as string })),
    disambiguated,
    topGroupExample,
  };
}

export async function applyCodeSyntax(options: CodeSyntaxOptions): Promise<{
  updated: number;
  failed: number;
  libraryMissing: number;
  /** The component's variables after the change, for the AI handoff row */
  componentTotal: number;
  componentMapped: number;
}> {
  const plan = await planCodeSyntax(options);
  let updated = 0;
  let failed = 0;
  for (const target of plan.targets) {
    try {
      const variable = await figma.variables.getVariableByIdAsync(target.id);
      if (!variable || hasCodeSyntax(variable)) continue;
      variable.setVariableCodeSyntax('WEB', target.web);
      updated++;
    } catch (error) {
      console.warn(`Could not set code syntax on ${target.name}:`, error);
      failed++;
    }
  }
  if (updated > 0) figma.commitUndo();

  const after = await componentVariables(options.nodeId);
  return {
    updated,
    failed,
    libraryMissing: plan.libraryMissing,
    componentTotal: after.length,
    componentMapped: after.filter(hasCodeSyntax).length,
  };
}
