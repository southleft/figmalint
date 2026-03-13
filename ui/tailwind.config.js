/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        fg: {
          DEFAULT: 'var(--figma-color-text, #333)',
          secondary: 'var(--figma-color-text-secondary, #666)',
          tertiary: 'var(--figma-color-text-tertiary, #999)',
          disabled: 'var(--figma-color-text-disabled, #b3b3b3)',
          onbrand: 'var(--figma-color-text-onbrand, #fff)',
          danger: 'var(--figma-color-text-danger, #f24822)',
          warning: 'var(--figma-color-text-warning-secondary, #b35e00)',
          success: 'var(--figma-color-text-success, #14ae5c)',
        },
        bg: {
          DEFAULT: 'var(--figma-color-bg, #fff)',
          secondary: 'var(--figma-color-bg-secondary, #f5f5f5)',
          tertiary: 'var(--figma-color-bg-tertiary, #e6e6e6)',
          brand: 'var(--figma-color-bg-brand, #0d99ff)',
          hover: 'var(--figma-color-bg-hover, rgba(0,0,0,0.06))',
          selected: 'var(--figma-color-bg-selected, #daebf7)',
          danger: 'var(--figma-color-bg-danger, #fce4e0)',
          warning: 'var(--figma-color-bg-warning, #fff3e0)',
          success: 'var(--figma-color-bg-success, #e4f7ec)',
        },
        border: {
          DEFAULT: 'var(--figma-color-border, #e6e6e6)',
          strong: 'var(--figma-color-border-strong, #c4c4c4)',
        },
      },
      fontSize: {
        '11': ['11px', '16px'],
        '12': ['12px', '16px'],
        '13': ['13px', '20px'],
      },
    },
  },
  plugins: [],
};
