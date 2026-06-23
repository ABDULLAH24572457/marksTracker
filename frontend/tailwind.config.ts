import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#18174A',
        secondary: '#67CDFF',
        accent: '#94B8AB',
        canvas: '#F8FAFC',
      },
      boxShadow: {
        panel: '0 12px 36px rgba(24, 23, 74, 0.08)',
      },
    },
  },
  plugins: [],
} satisfies Config;
