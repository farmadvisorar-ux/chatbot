import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
    base: './',
    build: {
        rollupOptions: {
            maxParallelFileOps: 128,
            // The admin console is a second page rather than a route in the
            // main bundle, so operator code never ships to public visitors.
            input: {
                main: resolve(__dirname, 'index.html'),
                admin: resolve(__dirname, 'admin.html'),
                account: resolve(__dirname, 'account.html'),
                insights: resolve(__dirname, 'insights.html'),
            },
        },
    },
});
