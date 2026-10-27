/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brandGreen: {
          900: '#204110',
          700: '#375f25',
          500: '#749764',
          300: '#a0bd85',
          100: '#c8d9c2',
        },
        brandRed: {
          900: '#6b0015',
          800: '#850014',
          700: '#a50727',
          600: '#ae001a',
          500: '#e10531',
        },
      },
    },
  },
  plugins: [],
};
