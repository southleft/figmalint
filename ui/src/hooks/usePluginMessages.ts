import { useEffect, useCallback, useRef } from 'react';
import type { PluginEvent } from '../lib/messages';

type EventHandler = (event: PluginEvent) => void;

/**
 * Hook for listening to postMessage events from the Figma plugin main thread.
 */
export function usePluginMessages(handler: EventHandler): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      // Only accept messages from the Figma host (parent frame)
      if (event.source !== window.parent) return;

      const msg = event.data?.pluginMessage;
      if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;
      handlerRef.current(msg as PluginEvent);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
}

/**
 * Hook that returns a stable function to send messages to the plugin main thread.
 */
export function usePostToPlugin() {
  return useCallback((type: string, data?: unknown) => {
    parent.postMessage({ pluginMessage: { type, data } }, '*');
  }, []);
}
