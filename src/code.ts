/// <reference types="@figma/plugin-typings" />

import { handleUIMessage, initializePlugin } from './ui/message-handler';

// Plugin configuration
const PLUGIN_WINDOW_SIZE = { width: 380, height: 600, themeColors: true };

// Plugin initialization
try {
  figma.showUI(__html__, PLUGIN_WINDOW_SIZE);
  console.log('✅ FigmaLint v2.0 - UI shown successfully');
} catch (error) {
  console.log('ℹ️ UI might already be shown in inspect panel:', error);
}

// Set up message handler
figma.ui.onmessage = handleUIMessage;

// Initialize plugin
initializePlugin();

console.log('🚀 FigmaLint v2.0 initialized with modular architecture');
