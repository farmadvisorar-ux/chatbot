import type { Clerk as ClerkType } from '@clerk/clerk-js';
import { renderIcons } from './icons.js';

renderIcons();

let clerk: ClerkType | null = null;
let loadPromise: Promise<ClerkType | null> | null = null;

function publishableKey(): string | undefined {
    return import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
}

/**
 * Lazily loads and initializes Clerk on first use so its ~1MB SDK never
 * ships to landing-page visitors who never sign in.
 */
function loadClerk(): Promise<ClerkType | null> {
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
        const key = publishableKey();
        if (!key) return null;
        const { Clerk } = await import('@clerk/clerk-js');
        clerk = new Clerk(key);
        await clerk.load({ signInUrl: undefined, signUpUrl: undefined });
        clerk.addListener(renderHeaderControls);
        renderHeaderControls();
        return clerk;
    })();
    return loadPromise;
}

const mountPoints = (): HTMLElement[] =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-auth-controls]'));

function renderSignedOutControls(mountPoint: HTMLElement, onSignIn: () => void, onSignUp: () => void): void {
    mountPoint.innerHTML = '';
    const signInButton = document.createElement('button');
    signInButton.type = 'button';
    signInButton.className = 'text-button';
    signInButton.textContent = 'Sign in';
    signInButton.addEventListener('click', onSignIn);
    mountPoint.appendChild(signInButton);

    const signUpButton = document.createElement('button');
    signUpButton.type = 'button';
    signUpButton.className = 'mini-cta';
    signUpButton.textContent = 'Sign up';
    signUpButton.addEventListener('click', onSignUp);
    mountPoint.appendChild(signUpButton);
}

function renderHeaderControls(): void {
    for (const mountPoint of mountPoints()) {
        if (clerk?.user) {
            mountPoint.innerHTML = '';
            // On app pages the persistent nav already links Dashboard/Account,
            // so only the landing page needs them repeated here.
            if (!document.querySelector('.nav-links')) {
                const dashboardLink = document.createElement('a');
                dashboardLink.href = '/dashboard.html';
                dashboardLink.className = 'text-button';
                dashboardLink.textContent = 'Dashboard';
                mountPoint.appendChild(dashboardLink);
            }
            const userButtonSlot = document.createElement('div');
            mountPoint.appendChild(userButtonSlot);
            clerk.mountUserButton(userButtonSlot, { afterSignOutUrl: window.location.href });
            continue;
        }
        renderSignedOutControls(mountPoint, () => clerk?.openSignIn({}), () => clerk?.openSignUp({}));
    }
}

/** Renders header sign-in/sign-up controls without loading Clerk's SDK yet. */
export function initAuth(): void {
    const targets = mountPoints();
    if (!targets.length) return;
    if (!publishableKey()) {
        targets.forEach(target => { target.innerHTML = ''; });
        return;
    }
    targets.forEach(target => renderSignedOutControls(
        target,
        () => loadClerk().then(() => clerk?.openSignIn({})),
        () => loadClerk().then(() => clerk?.openSignUp({})),
    ));
}

export function isSignedIn(): boolean {
    return Boolean(clerk?.user);
}

/** Loads Clerk now and reports whether there's an existing session. */
export async function resolveSession(): Promise<boolean> {
    const activeClerk = await loadClerk();
    return Boolean(activeClerk?.user);
}

export function currentUserEmail(): string | null {
    return clerk?.user?.primaryEmailAddress?.emailAddress ?? null;
}

export async function getAuthToken(): Promise<string | null> {
    if (!clerk?.session) return null;
    return clerk.session.getToken();
}

/** Loads Clerk if needed and opens the sign-in modal unless already authenticated. */
export async function requireSignIn(): Promise<boolean> {
    const activeClerk = await loadClerk();
    if (!activeClerk) return false;
    if (activeClerk.user) return true;
    return new Promise(resolve => {
        const unsubscribe = activeClerk.addListener(({ user }) => {
            if (user) {
                unsubscribe();
                resolve(true);
            }
        });
        activeClerk.openSignIn({});
    });
}
