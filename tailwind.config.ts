import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#0284c7',
        'primary-container': '#e0f2fe',
        'on-primary': '#ffffff',
        'on-primary-container': '#0369a1',
        secondary: '#0369a1',
        'secondary-container': '#f0f9ff',
        'on-secondary': '#ffffff',
        surface: '#ffffff',
        'surface-container-lowest': '#ffffff',
        'surface-container-low': '#f8fafc',
        'surface-container': '#f0f9ff',
        'surface-container-high': '#e2e8f0',
        'surface-container-highest': '#cbd5e1',
        'on-surface': '#0f172a',
        'on-surface-variant': '#64748b',
        background: '#f0f7ff',
        outline: '#cbd5e1',
        'outline-variant': '#e2e8f0',
        tertiary: '#0284c7',
        'tertiary-container': '#e0f2fe',
        error: '#ef4444',
        'error-container': '#fee2e2',
      },
      fontFamily: {
        headline: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Noto Sans Thai"', 'Tahoma', 'sans-serif'],
        display: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Noto Sans Thai"', 'Tahoma', 'sans-serif'],
        body: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Noto Sans Thai"', 'Tahoma', 'sans-serif'],
        label: ['Consolas', '"Courier New"', 'monospace'],
        mono: ['Consolas', '"Courier New"', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '0.5rem',
        lg: '1rem',
        xl: '1.5rem',
        full: '9999px',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/container-queries'),
  ],
};

export default config;
