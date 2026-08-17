/** Inline 16px stroke icons. Kept as source strings so they inherit `currentColor` and need no icon font or network request. */
const wrap = (paths: string): string =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const icons = {
    grid: wrap('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'),
    shield: wrap('<path d="M12 3l7 3v6c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z"/>'),
    user: wrap('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/>'),
    globe: wrap('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18"/>'),
    check: wrap('<path d="M20 6L9 17l-5-5"/>'),
    alert: wrap('<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L2 18a2 2 0 001.7 3h16.6A2 2 0 0022 18L13.7 3.9a2 2 0 00-3.4 0z"/>'),
    clock: wrap('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    plus: wrap('<path d="M12 5v14M5 12h14"/>'),
    bolt: wrap('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'),
    chevron: wrap('<path d="M9 6l6 6-6 6"/>'),
    mail: wrap('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'),
    link: wrap('<path d="M10 13a5 5 0 007.5.5l2-2a5 5 0 00-7-7l-1 1"/><path d="M14 11a5 5 0 00-7.5-.5l-2 2a5 5 0 007 7l1-1"/>'),
};

export type IconName = keyof typeof icons;

/**
 * Prepends the icon named by each `data-nav-icon` attribute inside `root`.
 * Safe to call repeatedly — elements that already hold an <svg> are skipped,
 * so re-rendered panels don't accumulate duplicate icons.
 */
export function renderIcons(root: ParentNode = document): void {
    root.querySelectorAll<HTMLElement>('[data-nav-icon]').forEach(element => {
        const name = element.dataset.navIcon as IconName;
        if (!icons[name] || element.querySelector('svg')) return;
        element.insertAdjacentHTML('afterbegin', icons[name]);
    });
}
