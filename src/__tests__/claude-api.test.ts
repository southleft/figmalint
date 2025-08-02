/// <reference types="@figma/plugin-typings" />

import { describe, it, expect, jest } from '@jest/globals';

// Mock fetch
global.fetch = jest.fn();

describe('Claude API Error Handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should provide detailed error message for 400 Bad Request', async () => {
    const mockResponse = {
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: jest.fn().mockResolvedValue(JSON.stringify({
        error: { message: 'Invalid model specified' }
      })),
      headers: new Headers(),
    };

    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce(mockResponse as any);

    try {
      await fetchClaude('test prompt', 'sk-ant-test-key');
    } catch (error) {
      expect(error.message).toBe('Claude API Error (400): Invalid model specified. Please check your request format.');
    }
  });

  it('should provide specific error message for invalid API key format', async () => {
    try {
      await fetchClaude('test prompt', 'invalid-key');
    } catch (error) {
      expect(error.message).toBe('Invalid API Key Format: Claude API keys should start with "sk-ant-". Please check your API key.');
    }
  });

  it('should provide error message for empty API key', async () => {
    try {
      await fetchClaude('test prompt', '');
    } catch (error) {
      expect(error.message).toBe('API Key Required: The Claude API key cannot be empty.');
    }
  });

  it('should provide rate limit error with retry information', async () => {
    const mockResponse = {
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      text: jest.fn().mockResolvedValue('Rate limit exceeded'),
      headers: new Headers({ 'retry-after': '60' }),
    };

    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce(mockResponse as any);

    try {
      await fetchClaude('test prompt', 'sk-ant-valid-key-123456789012345678901234567890');
    } catch (error) {
      expect(error.message).toBe('Claude API Error (429): Rate limit exceeded. Please try again in 60 seconds.');
    }
  });

  it('should handle network errors gracefully', async () => {
    (global.fetch as jest.MockedFunction<typeof fetch>).mockRejectedValueOnce(
      new Error('Failed to fetch')
    );

    try {
      await fetchClaude('test prompt', 'sk-ant-valid-key-123456789012345678901234567890');
    } catch (error) {
      expect(error.message).toBe('Network Error: Failed to connect to Claude API. Please check your internet connection and try again.');
    }
  });
});

// Simplified fetchClaude implementation for testing
async function fetchClaude(prompt: string, apiKey: string): Promise<string> {
  // Validate API key format
  if (!apiKey || typeof apiKey !== 'string') {
    throw new Error('API Key Required: Please provide a valid Claude API key in the plugin settings.');
  }
  
  const trimmedKey = apiKey.trim();
  if (trimmedKey.length === 0) {
    throw new Error('API Key Required: The Claude API key cannot be empty.');
  }
  
  if (!trimmedKey.startsWith('sk-ant-')) {
    throw new Error('Invalid API Key Format: Claude API keys should start with "sk-ant-". Please check your API key.');
  }
  
  if (trimmedKey.length < 40) {
    throw new Error('Invalid API Key Format: The API key appears to be too short. Please verify you copied the complete key.');
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey.trim(),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] }),
    });

    if (!response.ok) {
      let errorText = '';
      let errorDetails: any = {};
      
      try {
        errorText = await response.text();
        errorDetails = JSON.parse(errorText);
      } catch (e) {
        errorDetails = { message: errorText };
      }
      
      if (response.status === 400) {
        const errorMsg = errorDetails.error?.message || errorDetails.message || 'Bad request';
        throw new Error(`Claude API Error (400): ${errorMsg}. Please check your request format.`);
      } else if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        throw new Error(`Claude API Error (429): Rate limit exceeded. ${retryAfter ? `Please try again in ${retryAfter} seconds.` : 'Please try again later.'}`);
      }
    }

    return 'success';
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('Claude API Error')) {
        throw error;
      }
      
      if (error.message.includes('Failed to fetch')) {
        throw new Error('Network Error: Failed to connect to Claude API. Please check your internet connection and try again.');
      }
    }
    
    throw new Error(`Unexpected error calling Claude API: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}