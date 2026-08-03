const menuToggle = document.getElementById('menuToggle');
const navLinks = document.getElementById('navLinks');

menuToggle?.addEventListener('click', () => {
    const open = navLinks?.classList.toggle('open') ?? false;
    menuToggle.setAttribute('aria-expanded', String(open));
});

navLinks?.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
        navLinks.classList.remove('open');
        menuToggle?.setAttribute('aria-expanded', 'false');
    });
});

/* ---- Share ---- */

const SHARE_URL = 'https://darealtyte.com/';
const SHARE_TITLE = 'DAREALTYTE — bring dead domains back to life';
const SHARE_TEXT =
    "Pull any expired domain's original site out of the Internet Archive, clean it up, and ship it live in one click.";

const u = encodeURIComponent(SHARE_URL);
const t = encodeURIComponent(SHARE_TITLE);
const tx = encodeURIComponent(SHARE_TEXT);

const setHref = (id: string, href: string): void => {
    document.getElementById(id)?.setAttribute('href', href);
};

setHref('shareX', `https://twitter.com/intent/tweet?url=${u}&text=${t}`);
setHref('shareLinkedIn', `https://www.linkedin.com/sharing/share-offsite/?url=${u}`);
setHref('shareFacebook', `https://www.facebook.com/sharer/sharer.php?u=${u}`);
setHref('shareReddit', `https://www.reddit.com/submit?url=${u}&title=${t}`);
setHref('shareWhatsApp', `https://api.whatsapp.com/send?text=${t}%20${u}`);
setHref('shareEmail', `mailto:?subject=${t}&body=${tx}%0A%0A${u}`);

const copyBtn = document.getElementById('shareCopy');
const copied = document.getElementById('shareCopied');

/**
 * On mobile, the OS share sheet reaches apps no set of hardcoded links can
 * (iMessage, Signal, Instagram, whatever the user actually has installed),
 * so prefer it and fall back to clipboard on desktop.
 */
copyBtn?.addEventListener('click', async () => {
    if (navigator.share) {
        try {
            await navigator.share({ title: SHARE_TITLE, text: SHARE_TEXT, url: SHARE_URL });
            return;
        } catch {
            // Dismissing the sheet rejects; fall through to copying rather than
            // leaving the button feeling broken.
        }
    }
    try {
        await navigator.clipboard.writeText(SHARE_URL);
        if (copied) {
            copied.textContent = 'Copied';
            setTimeout(() => { copied.textContent = ''; }, 2000);
        }
    } catch {
        if (copied) {
            copied.textContent = 'Press Ctrl+C';
            setTimeout(() => { copied.textContent = ''; }, 2500);
        }
    }
});
