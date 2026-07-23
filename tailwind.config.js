/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef6ff',
          100: '#d9eafe',
          200: '#bbd8fd',
          300: '#8fc0fb',
          400: '#5ea0f6',
          500: '#387eea',
          600: '#275fcb',
          700: '#214ca4',
          800: '#223f85',
          900: '#22376d',
        },
      },
      boxShadow: {
        soft: '0 20px 45px -25px rgba(15, 23, 42, 0.35)',
      },
    },
  },
  plugins: [],
}
