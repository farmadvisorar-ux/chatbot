import type { Config } from 'tailwindcss';

const config: Config = {
    content: ['./src/**/*.{ts,tsx}'],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                brand: {
                    50: '#eef4ff',
                    100: '#d9e6ff',
                    200: '#b3ccff',
                    300: '#82abff',
                    400: '#5583ff',
                    500: '#2f5bff',
                    600: '#1b3fe0',
                    700: '#162fad',
                    800: '#152a87',
                    900: '#15266b',
                },
            },
            fontFamily: {
                sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
            },
        },
    },
    plugins: [],
};

export default config;
