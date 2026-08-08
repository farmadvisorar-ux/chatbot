/**
 * HTML assembly.
 *
 * Every string on this site that came from the supplier's feed passes through
 * `esc`. The feed is written by hand in a Shopify admin and already contains
 * `&`, `"` and `'` in ordinary product copy; it is not hostile, but it is not
 * trusted either, and a catalogue that renders whatever prose arrives is one
 * supplier typo away from broken markup and one bad day away from worse.
 *
 * `html` is a tagged template that escapes interpolations by default, so the
 * safe thing is what happens when you do nothing. Markup that is genuinely
 * ours and must not be escaped has to be wrapped in `raw()` — visible at the
 * call site, greppable, and impossible to do by accident.
 */

const ESCAPES: Record<string, string> = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
};

export function esc(value: unknown): string {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/**
 * Markup the caller asserts is already safe.
 *
 * Written with an explicit field rather than a constructor parameter
 * property: the tests and build scripts run TypeScript through Node's
 * strip-only mode, which erases types but cannot synthesise the assignment a
 * parameter property implies, and refuses the syntax outright.
 */
export class Raw {
    value: string;
    constructor(value: string) { this.value = value; }
    toString(): string { return this.value; }
}

export function raw(value: string): Raw {
    return new Raw(value);
}

/** Joins pieces of already-safe markup. */
export function join(parts: Array<Raw | string>, separator = ''): Raw {
    return raw(parts.map((p) => (p instanceof Raw ? p.value : esc(p))).join(separator));
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): Raw {
    let out = strings[0];
    for (let i = 0; i < values.length; i++) {
        const v = values[i];
        // An array is interpolated as a list of children — the common case for
        // a mapped set of cards — rather than as a comma-joined string.
        out += Array.isArray(v)
            ? v.map((x) => (x instanceof Raw ? x.value : esc(x))).join('')
            : v instanceof Raw ? v.value : esc(v);
        out += strings[i + 1];
    }
    return raw(out);
}

/**
 * A URL safe to put in `href`.
 *
 * Returns '#' for anything that is not plainly http(s) or site-relative. The
 * catalogue carries supplier-supplied image URLs and could one day carry a
 * supplier-supplied link, and `javascript:` in an href is the oldest way there
 * is to turn someone else's copy into someone else's script.
 */
export function safeUrl(url: unknown): string {
    const s = String(url ?? '').trim();
    if (/^https?:\/\//i.test(s)) return s;
    // Site-relative, but never protocol-relative: "//evil.example" starts
    // with a slash and looks local to a careless check, while actually
    // loading from another host under the page's own scheme.
    if (/^\/(?!\/)[^\s]*$/.test(s) || /^[#?][^\s]*$/.test(s)) return s;
    return '#';
}
