/// <reference types="@figma/plugin-typings" />

/**
 * Export a node as a base64-encoded PNG screenshot.
 * Constraints the width to maxWidth (default 1024px) for efficient transfer.
 */
export async function exportScreenshot(
  node: SceneNode,
  maxWidth: number = 1024
): Promise<string> {
  // Guard against zero or negative width (e.g. collapsed frames)
  const width = Math.max(1, Math.min(maxWidth, Math.round(node.width)));

  const bytes = await (node as any).exportAsync({
    format: 'PNG',
    constraint: { type: 'WIDTH', value: width },
  });

  // Convert Uint8Array to base64
  return uint8ArrayToBase64(bytes);
}

/**
 * Convert Uint8Array to base64 string.
 * Works in Figma's QuickJS sandbox (no btoa available).
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  const len = bytes.length;

  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;

    result += chars[b0 >> 2];
    result += chars[((b0 & 3) << 4) | (b1 >> 4)];
    result += i + 1 < len ? chars[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    result += i + 2 < len ? chars[b2 & 63] : '=';
  }

  return result;
}
