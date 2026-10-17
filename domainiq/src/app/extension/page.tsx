import Link from 'next/link';

export default function ExtensionPage() {
    return (
        <div className="mx-auto max-w-4xl space-y-10">
            <div className="text-center space-y-3">
                <span className="text-xs bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300 border border-brand-200 dark:border-brand-800 px-3 py-1 rounded-full font-semibold uppercase tracking-wider">
                    Browser Extension
                </span>
                <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight">
                    DomainIQ for Chrome &amp; Edge
                </h1>
                <p className="mt-2 text-slate-500 max-w-xl mx-auto text-base">
                    Evaluate domain names on GoDaddy Auctions, Namecheap, Sedo, Dan, or any website with a single click.
                </p>
            </div>

            {/* Feature Cards Grid */}
            <div className="grid gap-6 sm:grid-cols-3">
                <div className="card p-6 text-center">
                    <span className="text-3xl">⚡</span>
                    <h3 className="font-bold text-base mt-3 text-slate-900 dark:text-slate-100">Instant Tab Detection</h3>
                    <p className="mt-2 text-xs text-slate-500 leading-relaxed">
                        Opening the extension automatically detects the domain of the active tab you are viewing.
                    </p>
                </div>

                <div className="card p-6 text-center">
                    <span className="text-3xl">📊</span>
                    <h3 className="font-bold text-base mt-3 text-slate-900 dark:text-slate-100">Multi-Channel Matrix</h3>
                    <p className="mt-2 text-xs text-slate-500 leading-relaxed">
                        Inspect fair market value, wholesale floor, charm BIN, and lease-to-own financing in one popup.
                    </p>
                </div>

                <div className="card p-6 text-center">
                    <span className="text-3xl">⚖️</span>
                    <h3 className="font-bold text-base mt-3 text-slate-900 dark:text-slate-100">UDRP Legal Radar</h3>
                    <p className="mt-2 text-xs text-slate-500 leading-relaxed">
                        Flags potential trademark collisions and typosquatting directly in your browser toolbar before you bid.
                    </p>
                </div>
            </div>

            {/* Installation Instructions */}
            <div className="card p-8 space-y-6">
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                    How to Install in Chrome, Edge, or Brave (Developer Mode)
                </h2>

                <ol className="space-y-4 text-sm text-slate-600 dark:text-slate-300 list-decimal pl-5">
                    <li className="leading-relaxed">
                        Open your browser&apos;s extension manager by navigating to{' '}
                        <code className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-brand-600 font-mono">
                            chrome://extensions
                        </code>{' '}
                        (Chrome/Brave) or{' '}
                        <code className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-brand-600 font-mono">
                            edge://extensions
                        </code>{' '}
                        (Edge).
                    </li>
                    <li className="leading-relaxed">
                        Toggle on <strong>Developer mode</strong> in the top-right corner of the Extensions page.
                    </li>
                    <li className="leading-relaxed">
                        Click the <strong>&ldquo;Load unpacked&rdquo;</strong> button in the top-left toolbar.
                    </li>
                    <li className="leading-relaxed">
                        Select the <code className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded font-mono">extension/</code> directory from the DomainIQ project files.
                    </li>
                    <li className="leading-relaxed">
                        Pin the <strong>DomainIQ</strong> icon to your browser bar for instant 1-click valuations anywhere!
                    </li>
                </ol>

                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
                    <span className="text-xs text-slate-400">
                        Compatible with all Chromium-based browsers (Chrome, Edge, Brave, Opera, Arc).
                    </span>
                    <Link href="/" className="btn-primary !py-2 !px-4 text-xs font-semibold">
                        Try Web Valuator →
                    </Link>
                </div>
            </div>
        </div>
    );
}
