import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
    base: './',
    build: {
        rollupOptions: {
            // Admin and the post-checkout confirmation page are separate
            // pages rather than routes in the main bundle: operator code
            // never ships to shoppers, and the success page never ships the
            // storefront's cart logic.
            input: {
                main: resolve(__dirname, 'index.html'),
                success: resolve(__dirname, 'success.html'),
                admin: resolve(__dirname, 'admin.html'),
            },
        },
    },
});
