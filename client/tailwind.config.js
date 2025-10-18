/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        neon: {
          cyan: '#00EAFF',
          pink: '#FF3EC9',
          violet: '#8A5CF6',
          magenta: '#FF4BD1',
        },
        night: '#0a0614',
        dusk: '#0e1a2b',
      },
      borderRadius: {
        'xl2': '1rem',
      },
      keyframes: {
        gradient: {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        glow: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(255,64,200,0.25), 0 0 36px 0 rgba(0,234,255,0.15)' },
          '50%': { boxShadow: '0 0 0 4px rgba(255,64,200,0.35), 0 0 72px 8px rgba(0,234,255,0.25)' },
        },
      },
      animation: {
        'gradient-slow': 'gradient 14s ease infinite',
        'float': 'float 6s ease-in-out infinite',
        'glow': 'glow 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
