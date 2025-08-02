/// <reference types="@figma/plugin-typings" />

import { describe, it, expect, jest } from '@jest/globals';

describe('Async Component Access', () => {
  it('should use getMainComponentAsync instead of mainComponent', async () => {
    const mockMainComponent = {
      type: 'COMPONENT',
      name: 'Button',
      parent: { type: 'COMPONENT_SET' },
    };

    const mockInstance = {
      type: 'INSTANCE',
      name: 'Button Instance',
      getMainComponentAsync: jest.fn().mockResolvedValue(mockMainComponent),
    };

    // Test the async helper function
    const result = await getMainComponentAsync(mockInstance as any);
    
    expect(mockInstance.getMainComponentAsync).toHaveBeenCalled();
    expect(result).toBe(mockMainComponent);
  });

  it('should handle null main component gracefully', async () => {
    const mockInstance = {
      type: 'INSTANCE',
      name: 'Detached Instance',
      getMainComponentAsync: jest.fn().mockResolvedValue(null),
    };

    const result = await getMainComponentAsync(mockInstance as any);
    
    expect(result).toBeNull();
  });

  it('should handle errors when accessing main component', async () => {
    const mockInstance = {
      type: 'INSTANCE',
      name: 'Broken Instance',
      getMainComponentAsync: jest.fn().mockRejectedValue(new Error('Access denied')),
    };

    const result = await getMainComponentAsync(mockInstance as any);
    
    expect(result).toBeNull();
  });

  it('should return component directly if node is already a component', async () => {
    const mockComponent = {
      type: 'COMPONENT',
      name: 'Button Component',
    };

    const result = await getMainComponentAsync(mockComponent as any);
    
    expect(result).toBe(mockComponent);
  });

  it('should return null for non-component nodes', async () => {
    const mockFrame = {
      type: 'FRAME',
      name: 'Regular Frame',
    };

    const result = await getMainComponentAsync(mockFrame as any);
    
    expect(result).toBeNull();
  });
});

// Helper function implementation for testing
async function getMainComponentAsync(node: SceneNode): Promise<ComponentNode | null> {
  if (node.type === 'INSTANCE') {
    const instance = node as InstanceNode;
    try {
      return await instance.getMainComponentAsync();
    } catch (error) {
      console.warn('Could not access main component:', error);
      return null;
    }
  } else if (node.type === 'COMPONENT') {
    return node as ComponentNode;
  }
  return null;
}