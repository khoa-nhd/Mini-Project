import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // QuickNotes Design System Colors (Flat Design)
        primary: {
          DEFAULT: '#0D9488',
          foreground: '#000000',
        },
        secondary: {
          DEFAULT: '#14B8A6',
          foreground: '#0F172A',
        },
        accent: {
          DEFAULT: '#EA580C',
          foreground: '#000000',
        },
        background: '#F0FDFA',
        foreground: '#134E4A',
        card: '#FFFFFF',
        'card-foreground': '#134E4A',
        muted: '#E8F1F4',
        'muted-foreground': '#475569',
        border: '#99F6E4',
        destructive: '#DC2626',
        'destructive-foreground': '#FFFFFF',
        ring: '#0D9488',
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
      },
      spacing: {
        'space-1': '4px',
        'space-2': '8px',
        'space-3': '12px',
        'space-4': '16px',
        'space-5': '20px',
        'space-6': '24px',
        'space-7': '28px',
        'space-8': '32px',
        'space-10': '40px',
        'space-12': '48px',
        'space-16': '64px',
        'space-20': '80px',
        'space-24': '96px',
      },
      transitionDuration: {
        'fast': '150ms',
        'normal': '200ms',
        'slow': '300ms',
      },
      transitionTimingFunction: {
        'ease-out': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
        'card-hover': '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
      },
      borderRadius: {
        'radius-sm': '4px',
        'radius-md': '8px',
        'radius-lg': '12px',
        'radius-xl': '16px',
        'radius-full': '9999px',
      },
    },
  },
  plugins: [],
}

export default config