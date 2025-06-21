// Basic Figma Plugin API Type Definitions
// This provides minimal type coverage for the plugin to compile without errors

declare global {
  const figma: {
    showUI: (html: string, options?: { width?: number; height?: number }) => void;
    notify: (message: string, options?: { timeout?: number; error?: boolean }) => void;
    currentPage: {
      selection: SceneNode[];
    };
    ui: {
      onmessage: (callback: (message: any) => void) => void;
      postMessage: (message: any) => void;
    };
    on: (event: string, callback: () => void) => void;
    clientStorage: {
      getAsync: (key: string) => Promise<any>;
      setAsync: (key: string, value: any) => Promise<void>;
    };
  };

  const __html__: string;

  interface SceneNode {
    id: string;
    name: string;
    type: string;
    visible: boolean;
    locked: boolean;
    width?: number;
    height?: number;
    fills?: any[];
    children?: SceneNode[];
  }

  interface TextNode extends SceneNode {
    characters: string;
    fontSize: number | symbol;
    fontName: { family: string; style: string } | symbol;
  }

  interface ComponentNode extends SceneNode {
    description: string;
  }

  interface InstanceNode extends SceneNode {
    mainComponent: ComponentNode | null;
  }
}

export {};
