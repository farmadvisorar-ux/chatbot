import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
    base: './',
    build: {
        rollupOptions: {
            // The public inspection-summary page is a second entry point, kept
            // separate from the main bundle so the owner-only app code (leads,
            // pipeline, scheduling) never ships to a homeowner opening a text link.
            input: {
                main: resolve(__dirname, 'index.html'),
                share: resolve(__dirname, 'share.html'),
            },
        },
    },
});
