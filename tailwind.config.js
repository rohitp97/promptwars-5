/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#f7f4ee',
        card: '#ffffff',
        ink: '#1b2430',
        muted: '#4f5b6b',
        line: '#d9d3c6',
        brand: '#1f3a5f',
        brandSoft: '#e6edf6',
        verified: '#1d6b45',
        verifiedSoft: '#e3f3ea',
        approx: '#8a5a00',
        approxSoft: '#fdf0d5',
        playbook: '#4a3f8f',
        playbookSoft: '#ebe8f8',
        missing: '#5b6572',
        missingSoft: '#eceff3',
        danger: '#a12a2a',
        dangerSoft: '#fbe6e6',
        mark: '#ffe58a',
      },
      fontFamily: {
        // System fonts only: no third-party font requests, and Windows/Android ship Devanagari faces.
        sans: ['system-ui', '"Segoe UI"', '"Nirmala UI"', '"Noto Sans Devanagari"', 'Roboto', 'sans-serif'],
        serif: ['Georgia', '"Noto Serif Devanagari"', '"Nirmala UI"', 'serif'],
      },
      keyframes: {
        rise: {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: { rise: 'rise 0.25s ease-out' },
    },
  },
  plugins: [],
}
