import type { Clerk as ClerkType } from '@clerk/clerk-js';

let clerk: ClerkType | null = null;
let loadPromise: Promise<ClerkType | null> | null = null;

function publishableKey(): string | undefined {
    return import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
}

/**
 * Lazily loads and initializes Clerk on first use. Clerk's SDK is large
 * (~1MB gzipped), so nothing imports it until a visitor actually tries to
 * sign in — most visitors to a launch directory never do. Resolves to null
 * if VITE_CLERK_PUBLISHABLE_KEY isn't set, so the rest of the site still
 * works before auth is configured.
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

/**
 * Every element marked data-auth-controls. There are two: one in the desktop
 * header and one in the mobile menu, because the header is display:none below
 * 980px — rendering only into the header left phone users with no way to sign
 * in at all.
 */
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
            const userButtonSlot = document.createElement('div');
            mountPoint.appendChild(userButtonSlot);
            clerk.mountUserButton(userButtonSlot, { afterSignOutUrl: window.location.href });
            continue;
        }
        renderSignedOutControls(mountPoint, () => clerk?.openSignIn({}), () => clerk?.openSignUp({}));
    }
}

/**
 * Renders the header sign-in/sign-up controls immediately without loading
 * Clerk's SDK. Hides itself if auth isn't configured on this deployment.
 */
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

export function currentUserEmail(): string | null {
    return clerk?.user?.primaryEmailAddress?.emailAddress ?? null;
}

export async function getAuthToken(): Promise<string | null> {
    if (!clerk?.session) return null;
    return clerk.session.getToken();
}

/**
 * Loads Clerk if needed and opens the sign-in modal unless the visitor is
 * already authenticated. Resolves once they're signed in.
 */
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
