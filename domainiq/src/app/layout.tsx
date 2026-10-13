import type { Metadata } from 'next';
import './globals.css';
import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';
import MarketTicker from '@/components/MarketTicker';

export const metadata: Metadata = {
    title: 'DomainIQ — Institutional-Grade Domain Valuation Engine',
    description:
        'Instant, transparent domain appraisals powered by 14.8M+ verified sales comps, multi-channel pricing matrices, and automated UDRP due diligence.',
    icons: {
        icon: [
            { url: '/favicon.svg', type: 'image/svg+xml' },
            { url: '/favicon.ico', sizes: 'any' },
        ],
        apple: [{ url: '/favicon.svg' }],
    },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" className="dark">
            <body className="flex min-h-screen flex-col font-sans bg-slate-950 text-slate-100 bg-tech-grid">
                <MarketTicker />
                <NavBar />
                <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:py-12">{children}</main>
                <Footer />
            </body>
        </html>
    );
}
