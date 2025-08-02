/// <reference types="@figma/plugin-typings" />

import { describe, it, expect, jest } from '@jest/globals';

// Mock Figma API
const mockFigma = {
  variables: {
    getVariableByIdAsync: jest.fn(),
  },
  getStyleByIdAsync: jest.fn(),
};

// Mock helper functions
jest.mock('../utils/figma-helpers', () => ({
  rgbToHex: (r: number, g: number, b: number) => {
    const toHex = (n: number): string => {
      const hex = Math.round(n * 255).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  },
  getVariableName: jest.fn(),
  getVariableValue: jest.fn(),
  getDebugContext: jest.fn(() => ({ path: 'test/path', description: 'test description' })),
}));

describe('Token Analyzer - Default Variant Frame Styles Filter', () => {
  it('should detect and filter default variant frame styles', () => {
    const mockNode = {
      type: 'COMPONENT',
      name: 'Button/Default',
      parent: { type: 'COMPONENT_SET' },
      cornerRadius: 5,
      strokeWeight: 1,
      strokes: [{
        type: 'SOLID',
        visible: true,
        color: { r: 0.592, g: 0.278, b: 1.0 } // #9747FF
      }],
      paddingLeft: 16,
      paddingRight: 16,
      paddingTop: 16,
      paddingBottom: 16,
    };

    // The hasDefaultVariantFrameStyles function should return true
    const hasDefaults = hasDefaultVariantFrameStyles(mockNode);
    expect(hasDefaults).toBe(true);
  });

  it('should not filter non-default variant styles', () => {
    const mockNode = {
      type: 'COMPONENT',
      name: 'Button/Default',
      parent: { type: 'COMPONENT_SET' },
      cornerRadius: 8, // Different from default 5
      strokeWeight: 1,
      strokes: [{
        type: 'SOLID',
        visible: true,
        color: { r: 0.541, g: 0.22, b: 0.961 }
      }],
      paddingLeft: 24, // Different from default 16
      paddingRight: 24,
      paddingTop: 24,
      paddingBottom: 24,
    };

    const hasDefaults = hasDefaultVariantFrameStyles(mockNode);
    expect(hasDefaults).toBe(false);
  });

  it('should not filter when not all default values are present', () => {
    const mockNode = {
      type: 'COMPONENT',
      name: 'Button/Default',
      parent: { type: 'COMPONENT_SET' },
      cornerRadius: 5,
      strokeWeight: 2, // Different from default 1
      strokes: [{
        type: 'SOLID',
        visible: true,
        color: { r: 0.592, g: 0.278, b: 1.0 }
      }],
      paddingLeft: 16,
      paddingRight: 16,
      paddingTop: 16,
      paddingBottom: 16,
    };

    const hasDefaults = hasDefaultVariantFrameStyles(mockNode);
    expect(hasDefaults).toBe(false);
  });
});

// Helper function implementation for testing
function hasDefaultVariantFrameStyles(node: any): boolean {
  if (!('strokes' in node) || !('cornerRadius' in node) || !('strokeWeight' in node)) {
    return false;
  }
  
  const isVariantFrame = node.parent && node.parent.type === 'COMPONENT_SET';
  if (!isVariantFrame) {
    return false;
  }
  
  const hasDefaultRadius = node.cornerRadius === 5;
  const hasDefaultStrokeWeight = node.strokeWeight === 1;
  
  const strokes = node.strokes;
  const hasDefaultStroke = strokes.length > 0 && strokes.some((stroke: any) => {
    if (stroke.type === 'SOLID' && stroke.visible !== false && stroke.color) {
      const r = Math.round(stroke.color.r * 255).toString(16).padStart(2, '0');
      const g = Math.round(stroke.color.g * 255).toString(16).padStart(2, '0');
      const b = Math.round(stroke.color.b * 255).toString(16).padStart(2, '0');
      const hex = `#${r}${g}${b}`.toUpperCase();
      return hex === '#9747FF';
    }
    return false;
  });
  
  const hasDefaultPadding = 'paddingLeft' in node && 'paddingRight' in node && 
                           'paddingTop' in node && 'paddingBottom' in node &&
                           node.paddingLeft === 16 && node.paddingRight === 16 && 
                           node.paddingTop === 16 && node.paddingBottom === 16;
  
  return hasDefaultRadius && hasDefaultStrokeWeight && hasDefaultStroke && hasDefaultPadding;
}