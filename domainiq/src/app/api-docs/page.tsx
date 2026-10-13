'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function ApiDocsPage() {
    const [testDomain, setTestDomain] = useState('techhub.com');
    const [testLoading, setTestLoading] = useState(false);
    const [testResponse, setTestResponse] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'curl' | 'js' | 'python'>('curl');

    async function handleTestApi() {
        setTestLoading(true);
        setTestResponse(null);
        try {
            const res = await fetch(`/api/v1/valuate?domain=${encodeURIComponent(testDomain)}`);
            const data = await res.json();
            setTestResponse(JSON.stringify(data, null, 2));
        } catch (err) {
            setTestResponse(JSON.stringify({ error: err instanceof Error ? err.message : 'Network failure' }, null, 2));
        } finally {
            setTestLoading(false);
        }
    }

    const curlExample = `curl -X GET "https://domainiq.com/api/v1/valuate?domain=cloudscale.ai" \\
  -H "Accept: application/json"`;

    const jsExample = `const response = await fetch("https://domainiq.com/api/v1/valuate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ domain: "cloudscale.ai" })
});

const data = await response.json();
console.log("Fair Market Value:", data.data.valuation.fairMarketValue);
console.log("Liquidity Score:", data.data.liquidity.score);`;

    const pythonExample = `import requests

url = "https://domainiq.com/api/v1/valuate"
params = {"domain": "cloudscale.ai"}

response = requests.get(url, params=params)
data = response.json()

if response.status_code == 200:
    val = data["data"]["valuation"]
    print(f"FMV: \${val['fairMarketValue']:,}")
    print(f"Confidence: {val['confidenceScore']}% ({val['confidence']})")
    print(f"Channel Floor: \${data['data']['channelPricing']['liquidationFloor']:,}")`;

    return (
        <div className="mx-auto max-w-5xl space-y-12 py-4">
            {/* Header */}
            <div className="text-center space-y-4">
                <span className="text-xs bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300 border border-brand-200 dark:border-brand-800 px-3 py-1 rounded-full font-semibold uppercase tracking-wider">
                    Developer API v1
                </span>
                <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-slate-900 dark:text-white">
                    DomainIQ Developer Ecosystem
                </h1>
                <p className="mt-2 text-slate-600 dark:text-slate-400 max-w-2xl mx-auto text-base">
                    Programmatic access to algorithmic domain valuations, wholesale liquidation floors, UDRP trademark conflict scores, and liquidity velocity analytics.
                </p>
            </div>

            {/* Quick Metrics */}
            <div className="grid gap-4 sm:grid-cols-4">
                <div className="card p-5 text-center">
                    <span className="text-2xl">⚡</span>
                    <h3 className="font-bold text-sm mt-2 text-slate-900 dark:text-slate-100">Sub-100ms Engine</h3>
                    <p className="text-xs text-slate-500 mt-1">High-throughput JSON microsecond response</p>
                </div>
                <div className="card p-5 text-center">
                    <span className="text-2xl">🛡️</span>
                    <h3 className="font-bold text-sm mt-2 text-slate-900 dark:text-slate-100">Deterministic Scoring</h3>
                    <p className="text-xs text-slate-500 mt-1">Explainable multi-factor pricing models</p>
                </div>
                <div className="card p-5 text-center">
                    <span className="text-2xl">⚖️</span>
                    <h3 className="font-bold text-sm mt-2 text-slate-900 dark:text-slate-100">UDRP &amp; Trademark</h3>
                    <p className="text-xs text-slate-500 mt-1">Integrated IP collision screening</p>
                </div>
                <div className="card p-5 text-center">
                    <span className="text-2xl">🏷️</span>
                    <h3 className="font-bold text-sm mt-2 text-slate-900 dark:text-slate-100">Embeddable Badges</h3>
                    <p className="text-xs text-slate-500 mt-1">Live SVG cards &amp; pills for landing pages</p>
                </div>
            </div>

            {/* Interactive API Tester */}
            <section className="card p-6 sm:p-8 space-y-5 border-2 border-brand-500/20">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <span>🧪</span> Interactive API Sandbox
                        </h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Execute a live request to <code className="text-xs font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-brand-600">GET /api/v1/valuate</code>
                        </p>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                    <input
                        type="text"
                        value={testDomain}
                        onChange={(e) => setTestDomain(e.target.value)}
                        placeholder="Enter domain (e.g. quantum.io)"
                        className="input font-mono text-sm flex-1"
                    />
                    <button
                        onClick={handleTestApi}
                        disabled={testLoading}
                        className="btn-primary !py-2 !px-6 text-sm font-bold shrink-0 flex items-center justify-center gap-2"
                    >
                        {testLoading ? (
                            <>
                                <span className="animate-spin">⏳</span> Running...
                            </>
                        ) : (
                            <>Send Request →</>
                        )}
                    </button>
                </div>

                {testResponse && (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-slate-500">
                            <span className="font-semibold uppercase tracking-wider">JSON Response Payload:</span>
                            <span className="text-emerald-600 font-mono">Status: 200 OK</span>
                        </div>
                        <pre className="p-4 rounded-xl bg-slate-900 text-slate-200 text-xs font-mono overflow-x-auto max-h-96 border border-slate-800 leading-relaxed">
                            {testResponse}
                        </pre>
                    </div>
                )}
            </section>

            {/* Code Integration Tabs */}
            <section className="card p-6 sm:p-8 space-y-6">
                <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">Quick Integration Snippets</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Integrate domain valuation checks into bots, scrapers, registrars, or portfolio management tools in minutes.
                    </p>
                </div>

                <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
                    <button
                        onClick={() => setActiveTab('curl')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${
                            activeTab === 'curl'
                                ? 'bg-brand-600 text-white'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                    >
                        cURL
                    </button>
                    <button
                        onClick={() => setActiveTab('js')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${
                            activeTab === 'js'
                                ? 'bg-brand-600 text-white'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                    >
                        JavaScript / TypeScript
                    </button>
                    <button
                        onClick={() => setActiveTab('python')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${
                            activeTab === 'python'
                                ? 'bg-brand-600 text-white'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                    >
                        Python
                    </button>
                </div>

                <div>
                    <pre className="p-4 rounded-xl bg-slate-900 text-emerald-400 text-xs font-mono overflow-x-auto border border-slate-800 leading-relaxed">
                        {activeTab === 'curl' && curlExample}
                        {activeTab === 'js' && jsExample}
                        {activeTab === 'python' && pythonExample}
                    </pre>
                </div>
            </section>

            {/* Endpoint Reference */}
            <section className="space-y-6">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">API Endpoints Reference</h2>

                <div className="card p-6 space-y-4">
                    <div className="flex items-center gap-3">
                        <span className="px-2.5 py-1 text-xs font-bold rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-mono">
                            GET
                        </span>
                        <code className="text-base font-bold text-slate-900 dark:text-white font-mono">
                            /api/v1/valuate
                        </code>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                        Evaluates a single domain name via query parameter. Returns multi-channel pricing, liquidity rating, UDRP trademark screening, and collision radar.
                    </p>
                    <div className="space-y-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Query Parameters:</h4>
                        <div className="text-xs font-mono bg-slate-50 dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1">
                            <div><strong className="text-brand-600">domain</strong> (string, required): The target domain (e.g. <code>app.xyz</code>)</div>
                        </div>
                    </div>
                </div>

                <div className="card p-6 space-y-4">
                    <div className="flex items-center gap-3">
                        <span className="px-2.5 py-1 text-xs font-bold rounded bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 font-mono">
                            POST
                        </span>
                        <code className="text-base font-bold text-slate-900 dark:text-white font-mono">
                            /api/v1/valuate
                        </code>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                        Evaluates a domain via JSON body. Useful for backend microservices and automated appraisal pipelines.
                    </p>
                    <div className="space-y-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Request Body:</h4>
                        <pre className="text-xs font-mono bg-slate-50 dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
{`{
  "domain": "innovate.ai"
}`}
                        </pre>
                    </div>
                </div>

                <div className="card p-6 space-y-4">
                    <div className="flex items-center gap-3">
                        <span className="px-2.5 py-1 text-xs font-bold rounded bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 font-mono">
                            GET
                        </span>
                        <code className="text-base font-bold text-slate-900 dark:text-white font-mono">
                            /api/badge/:domain
                        </code>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                        Generates a dynamic real-time SVG valuation badge or appraisal card. Can be directly embedded into Markdown or HTML on marketplace sales pages.
                    </p>
                    <div className="text-xs font-mono bg-slate-50 dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1">
                        <div><strong className="text-brand-600">style</strong> (optional): <code>card</code> for showcase card, or <code>pill</code> for compact badge.</div>
                    </div>
                </div>

                <div className="card p-6 space-y-4">
                    <div className="flex items-center gap-3">
                        <span className="px-2.5 py-1 text-xs font-bold rounded bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 font-mono">
                            POST
                        </span>
                        <code className="text-base font-bold text-slate-900 dark:text-white font-mono">
                            /api/bulk
                        </code>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                        Evaluates up to 100 domains in a single batch request, returning aggregate portfolio portfolio valuation and liquidation stats.
                    </p>
                </div>
            </section>

            {/* Response Field Reference Table */}
            <section className="card p-6 sm:p-8 space-y-4">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Response Field Reference</h2>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs sm:text-sm">
                        <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-400">
                            <tr>
                                <th className="pb-3 pr-4">Field</th>
                                <th className="pb-3 pr-4">Type</th>
                                <th className="pb-3">Description</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-xs">
                            <tr>
                                <td className="py-2.5 pr-4 text-brand-600 font-bold">valuation.fairMarketValue</td>
                                <td className="py-2.5 pr-4 text-slate-500">number</td>
                                <td className="py-2.5 text-slate-600 dark:text-slate-300 font-sans">Primary algorithmic retail estimate in USD.</td>
                            </tr>
                            <tr>
                                <td className="py-2.5 pr-4 text-brand-600 font-bold">channelPricing.liquidationFloor</td>
                                <td className="py-2.5 pr-4 text-slate-500">number</td>
                                <td className="py-2.5 text-slate-600 dark:text-slate-300 font-sans">Immediate fire-sale wholesale cash auction floor.</td>
                            </tr>
                            <tr>
                                <td className="py-2.5 pr-4 text-brand-600 font-bold">channelPricing.recommendedBinPrice</td>
                                <td className="py-2.5 pr-4 text-slate-500">number</td>
                                <td className="py-2.5 text-slate-600 dark:text-slate-300 font-sans">Optimal marketplace Buy-It-Now price with charm ending ($X,995).</td>
                            </tr>
                            <tr>
                                <td className="py-2.5 pr-4 text-brand-600 font-bold">liquidity.score</td>
                                <td className="py-2.5 pr-4 text-slate-500">number (0-100)</td>
                                <td className="py-2.5 text-slate-600 dark:text-slate-300 font-sans">Secondary market trade velocity and investor appetite index.</td>
                            </tr>
                            <tr>
                                <td className="py-2.5 pr-4 text-brand-600 font-bold">dueDiligence.udrpRiskScore</td>
                                <td className="py-2.5 pr-4 text-slate-500">number (0-100)</td>
                                <td className="py-2.5 text-slate-600 dark:text-slate-300 font-sans">Automated UDRP trademark conflict and bad faith index.</td>
                            </tr>
                            <tr>
                                <td className="py-2.5 pr-4 text-brand-600 font-bold">collisionRadar.densityPercent</td>
                                <td className="py-2.5 pr-4 text-slate-500">number (0-100)</td>
                                <td className="py-2.5 text-slate-600 dark:text-slate-300 font-sans">Percentage of primary commercial extensions currently registered.</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            {/* Bottom Callout */}
            <div className="card p-8 bg-gradient-to-r from-brand-900 to-indigo-950 text-white text-center space-y-4">
                <h3 className="text-2xl font-bold">Ready to build or scale?</h3>
                <p className="text-slate-300 text-sm max-w-xl mx-auto">
                    Check out the browser extension or generate official printable appraisal certificates for your domains.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
                    <Link href="/extension" className="btn-secondary !bg-white/10 !text-white !border-white/20 hover:!bg-white/20 text-xs font-bold">
                        Browser Extension Guide →
                    </Link>
                    <Link href="/" className="btn-primary text-xs font-bold">
                        Valuate a Domain Now →
                    </Link>
                </div>
            </div>
        </div>
    );
}
