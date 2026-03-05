import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        movement: {
          50:  '#FFF9E6',
          100: '#FFF3CC',
          200: '#FFE799',
          300: '#FEDB66',
          400: '#FBCB4A',
          500: '#E5B530',
          600: '#C99B1F',
          700: '#A67D14',
          800: '#7A5C0E',
          900: '#4D3A09',
        },
        neutral: {
          50:  '#FAFAF8',
          100: '#F5F5F2',
          150: '#EDEDEA',
          200: '#E5E5E0',
          300: '#D4D4CE',
          400: '#A8A89E',
          500: '#787872',
          600: '#5C5C57',
          700: '#3D3D39',
          800: '#262624',
          900: '#141413',
          950: '#0A0A09',
        },
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgba(0,0,0,0.04), 0 1px 2px -1px rgba(0,0,0,0.03)',
        'card-hover': '0 4px 12px 0 rgba(0,0,0,0.06), 0 2px 4px -2px rgba(0,0,0,0.04)',
        'dropdown': '0 8px 24px 0 rgba(0,0,0,0.10), 0 2px 8px -2px rgba(0,0,0,0.05)',
      },
      letterSpacing: {
        'heading': '-0.025em',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
