import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // WoW Class Colors
        wow: {
          warrior: '#C79C6E',
          paladin: '#F58CBA',
          hunter: '#ABD473',
          rogue: '#FFF569',
          priest: '#FFFFFF',
          shaman: '#0070DE',
          mage: '#69CCF0',
          warlock: '#9482C9',
          druid: '#FF7D0A',
          deathknight: '#C41F3B',
        },
        // UI Colors
        background: '#1a1a2e',
        surface: '#16213e',
        primary: '#7c3aed',
        secondary: '#0f3460',
        accent: '#e94560',
      },
    },
  },
  plugins: [],
};

export default config;
