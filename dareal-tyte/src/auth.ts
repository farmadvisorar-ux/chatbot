import type { Clerk as ClerkType } from '@clerk/clerk-js';

let clerk: ClerkType | null = null;
let loadPromise: Promise<ClerkType | null> | null = null;

function publishableKey(): string | undefined {
    return import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
}

export function isConfigured(): boolean {
    return Boolean(publishableKey());
}

/** Loads and initializes Clerk on first use. Resolves to null if sign-in isn't configured yet. */
export function loadClerk(): Promise<ClerkType | null> {
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
        const key = publishableKey();
        if (!key) return null;

        const { Clerk } = await import('@clerk/clerk-js');
        clerk = new Clerk(key);
        await clerk.load();
        return clerk;
    })();

    return loadPromise;
}

export function isSignedIn(): boolean {
    return Boolean(clerk?.user);
}

export function currentUserEmail(): string | null {
    return clerk?.user?.primaryEmailAddress?.emailAddress ?? null;
}

export async function getAuthToken(): Promise<string | null> {
    if (!clerk?.session) return null;
    return clerk.session.getToken();
}

export function openSignIn(): void {
    clerk?.openSignIn({});
}

export function openSignUp(): void {
    clerk?.openSignUp({});
}

export async function signOut(): Promise<void> {
    await clerk?.signOut();
}

export function onAuthChange(cb: () => void): void {
    clerk?.addListener(cb);
}
