import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
    base: './',
    build: {
        rollupOptions: {
            maxParallelFileOps: 128,
            // Each page is a separate entry so signed-in dashboard code never
            // ships to anonymous landing-page visitors, and vice versa.
            input: {
                main: resolve(__dirname, 'index.html'),
                dashboard: resolve(__dirname, 'dashboard.html'),
                report: resolve(__dirname, 'report.html'),
                account: resolve(__dirname, 'account.html'),
            },
        },
    },
});
