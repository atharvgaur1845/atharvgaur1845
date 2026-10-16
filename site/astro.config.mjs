import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://atharvgaur1845.github.io',
  base: '/',
  output: 'static',
  build: { inlineStylesheets: 'always' },
  trailingSlash: 'always',
  integrations: [react(), mdx()],
});
