/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Figma design tokens (Align UI)
        'bg-white-0': '#ffffff',
        'bg-weak-50': '#f7f7f7',
        'bg-soft-100': '#f0f0f0',
        'text-strong-950': '#0a0a0a',
        'text-sub-600': '#525252',
        'text-soft-400': '#a3a3a3',
        'icon-soft-400': '#a3a3a3',
        'stroke-soft-200': '#e5e5e5',
        'primary-base': '#171717',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      letterSpacing: {
        'figma-tight': '-0.09px',
      },
      boxShadow: {
        // Multi-layer shadow from Figma (shadow/gray)
        'figma-card': [
          '0 10px 10px -5px rgba(23, 23, 23, 0.02)',
          '0 6px 6px -3px rgba(23, 23, 23, 0.04)',
          '0 3px 3px -1.5px rgba(23, 23, 23, 0.04)',
          '0 1px 1px -0.5px rgba(23, 23, 23, 0.04)',
          '0 0 0 1px rgba(23, 23, 23, 0.02)',
        ].join(', '),
        // Lifted variant for focus
        'figma-card-focus': [
          '0 16px 18px -6px rgba(23, 23, 23, 0.04)',
          '0 10px 10px -5px rgba(23, 23, 23, 0.06)',
          '0 6px 6px -3px rgba(23, 23, 23, 0.05)',
          '0 3px 3px -1.5px rgba(23, 23, 23, 0.04)',
          '0 1px 1px -0.5px rgba(23, 23, 23, 0.04)',
          '0 0 0 1px rgba(23, 23, 23, 0.06)',
        ].join(', '),
        'task-card': [
          '0 6px 6px -3px rgba(23, 23, 23, 0.03)',
          '0 3px 3px -1.5px rgba(23, 23, 23, 0.04)',
          '0 1px 1px -0.5px rgba(23, 23, 23, 0.04)',
          '0 0 0 1px rgba(23, 23, 23, 0.04)',
        ].join(', '),
      },
    },
  },
  plugins: [],
}
