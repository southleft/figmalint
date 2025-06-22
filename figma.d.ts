// Figma Plugin API Type Definitions
// This provides type coverage for the plugin to compile without errors

declare global {
  const figma: {
    showUI: (html: string, options?: { width?: number; height?: number }) => void;
    notify: (message: string, options?: { timeout?: number; error?: boolean }) => void;
    currentPage: {
      selection: SceneNode[];
      findAll: (callback: (node: SceneNode) => boolean) => SceneNode[];
    };
    ui: {
      onmessage: ((callback: (message: any) => void) => void) | ((message: any) => void);
      postMessage: (message: any) => void;
    };
    on: (event: string, callback: () => void) => void;
    clientStorage: {
      getAsync: (key: string) => Promise<any>;
      setAsync: (key: string, value: any) => Promise<void>;
      deleteAsync: (key: string) => Promise<void>;
    };
    viewport: {
      scrollAndZoomIntoView: (nodes: SceneNode[]) => void;
    };
    createComponent: () => ComponentNode;
    createFrame: () => FrameNode;
    createText: () => TextNode;
    group: (nodes: SceneNode[], parent: BaseNode) => GroupNode;
    loadFontAsync: (fontName: { family: string; style: string }) => Promise<void>;
    getStyleById: (id: string) => { name: string } | null;
    variables: {
      getVariableById: (id: string) => { name: string } | null;
    };
    editorType?: string;
    mode?: string;
  };

  const __html__: string;

  // Color types
  interface RGB {
    r: number;
    g: number;
    b: number;
  }

  interface RGBA {
    r: number;
    g: number;
    b: number;
    a: number;
  }

  // Paint types
  interface Paint {
    type: string;
    visible?: boolean;
    opacity?: number;
    color?: RGB;
  }

  interface SolidPaint extends Paint {
    type: 'SOLID';
    color: RGB;
  }

  // Effect types
  interface Effect {
    type: string;
    visible: boolean;
    radius?: number;
    offset?: { x: number; y: number };
  }

  interface DropShadowEffect extends Effect {
    type: 'DROP_SHADOW';
    color: RGBA;
    offset: { x: number; y: number };
    radius: number;
    blendMode: string;
  }

  // Base node types
  interface BaseNode {
    id: string;
    parent: BaseNode | null;
    appendChild(child: SceneNode): void;
    remove(): void;
    clone(): SceneNode;
    setPluginData(key: string, value: string): void;
    getPluginData(key: string): string;
  }

  interface SceneNode extends BaseNode {
    name: string;
    type: string;
    visible: boolean;
    locked: boolean;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    fills?: Paint[];
    strokes?: Paint[];
    strokeWeight?: number;
    strokeAlign?: 'INSIDE' | 'OUTSIDE' | 'CENTER';
    dashPattern?: number[];
    effects?: Effect[];
    opacity?: number;
    cornerRadius?: number;
    children?: SceneNode[];
    parent: BaseNode | null;
    resize(width: number, height: number): void;
  }

  interface ContainerNode extends SceneNode {
    children: SceneNode[];
    appendChild(child: SceneNode): void;
  }

  // Base interface for frame-like nodes (Frame, Component, Instance, etc.)
  interface BaseFrameNode extends ContainerNode {
    layoutMode: 'NONE' | 'HORIZONTAL' | 'VERTICAL';
    layoutAlign: 'MIN' | 'CENTER' | 'MAX' | 'STRETCH';
    itemSpacing: number;
    paddingTop: number;
    paddingRight: number;
    paddingBottom: number;
    paddingLeft: number;
    constraints?: { horizontal: string; vertical: string };
  }

  interface FrameNode extends BaseFrameNode {
    type: 'FRAME';
  }

  interface GroupNode extends ContainerNode {
    type: 'GROUP';
  }

  interface TextNode extends SceneNode {
    type: 'TEXT';
    characters: string;
    fontSize: number | symbol;
    fontName: { family: string; style: string } | symbol;
    textAlignHorizontal: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED';
    textAlignVertical: 'TOP' | 'CENTER' | 'BOTTOM';
    lineHeight: { value: number; unit: 'PIXELS' | 'PERCENT' | 'AUTO' } | symbol;
    letterSpacing: { value: number; unit: 'PIXELS' | 'PERCENT' } | symbol;
  }

  interface ComponentNode extends BaseFrameNode {
    type: 'COMPONENT';
    description: string;
    documentationLinks: { uri: string }[];
    createInstance(): InstanceNode;
  }

  interface ComponentSetNode extends BaseFrameNode {
    type: 'COMPONENT_SET';
    variantGroupProperties: { [property: string]: { values: string[] } };
  }

  interface InstanceNode extends BaseFrameNode {
    type: 'INSTANCE';
    mainComponent: ComponentNode | null;
  }
}

export {};
