/** @type {import('tailwindcss').Config} */
/**
 * 品牌色取自 logo-1 图形（天蓝渐变）：
 * - brand：主色 / 按钮 / 导航选中
 * - accent：点缀（高光、徽章）
 * - secondary：辅助（次要按钮边、说明文字偏色）
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef9fd',
          100: '#d5f1fb',
          200: '#aee3f7',
          300: '#7dd0f0',
          400: '#40b0e0',
          500: '#2090d0',
          600: '#1a7ab8',
          700: '#156494',
          800: '#145478',
          900: '#164664',
        },
        accent: {
          50: '#f0fbfd',
          100: '#d9f4fb',
          200: '#b0e8f7',
          300: '#80d8f2',
          400: '#5bc8f0',
          500: '#3ab8e8',
          600: '#2a9ec9',
          700: '#247fa3',
        },
        secondary: {
          50: '#f4f8fb',
          100: '#e6eef5',
          200: '#cddce9',
          300: '#a8c0d4',
          400: '#7a9bb5',
          500: '#5b7f9c',
          600: '#486680',
          700: '#3c5369',
          800: '#344657',
          900: '#2e3c4a',
        },
      },
      boxShadow: {
        soft: '0 20px 45px -25px rgba(22, 70, 100, 0.35)',
      },
    },
  },
  plugins: [],
}
