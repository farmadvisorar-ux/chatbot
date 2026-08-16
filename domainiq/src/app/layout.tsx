import type { Metadata } from 'next';
import './globals.css';
import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
    title: 'DomainIQ — Free, transparent domain name valuations',
    description:
        'Get an instant, explainable estimate of any domain\'s resale value. Multi-factor scoring across TLD authority, linguistics, keyword demand and real comparable sales — free, no signup required.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body className="flex min-h-screen flex-col font-sans">
                <NavBar />
                <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">{children}</main>
                <Footer />
            </body>
        </html>
    );
}
