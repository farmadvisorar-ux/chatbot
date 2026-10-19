'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { AdSlotData, AdPurchaseData, AdminUser, AdminStats } from '@/lib/admin-data';

type AdminTab = 'overview' | 'ads' | 'purchases' | 'users' | 'feed';
type PurchaseStatus = 'active' | 'pending' | 'expired' | 'canceled';

export default function AdminDashboardPage() {
    const router = useRouter();

    // Authentication State
    const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
    const [passcode, setPasscode] = useState('');
    const [authError, setAuthError] = useState<string | null>(null);
    const [authLoading, setAuthLoading] = useState(false);

    // Active View Tab
    const [activeTab, setActiveTab] = useState<AdminTab>('overview');

    // Live Data State
    const [stats, setStats] = useState<AdminStats | null>(null);
    const [slots, setSlots] = useState<AdSlotData[]>([]);
    const [purchases, setPurchases] = useState<AdPurchaseData[]>([]);
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [actionMsg, setActionMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    // Search & Filter State
    const [userQuery, setUserQuery] = useState('');
    const [userPlanFilter, setUserPlanFilter] = useState<'all' | 'free' | 'pro' | 'enterprise'>('all');
    const [userProviderFilter, setUserProviderFilter] = useState<'all' | 'gmail' | 'yahoo' | 'aol' | 'outlook' | 'other'>('all');
    const [userVerificationFilter, setUserVerificationFilter] = useState<'all' | 'verified' | 'pending'>('all');
    const [userPage, setUserPage] = useState(1);
    const [usersPerPage, setUsersPerPage] = useState<number>(50);
    const [purchaseFilter, setPurchaseFilter] = useState<'all' | 'active' | 'pending' | 'expired' | 'canceled'>('all');

    // Editing Slot State
    const [editingSlotId, setEditingSlotId] = useState<number | null>(null);
    const [slotDraft, setSlotDraft] = useState<Partial<AdSlotData>>({});
    const [savingSlot, setSavingSlot] = useState(false);

    // New Purchase Modal State
    const [showNewPurchaseModal, setShowNewPurchaseModal] = useState(false);
    const [newPurchaseDraft, setNewPurchaseDraft] = useState<{
        slot_id: number;
        advertiser_name: string;
        company: string;
        email: string;
        amount_usd: number;
        status: PurchaseStatus;
        destination_url: string;
        banner_image_url?: string;
        banner_title?: string;
        banner_description?: string;
        cta_text?: string;
        notes: string;
    }>({
        slot_id: 1,
        advertiser_name: '',
        company: '',
        email: '',
        amount_usd: 499,
        status: 'active',
        destination_url: '',
        banner_image_url: '',
        banner_title: '',
        banner_description: '',
        cta_text: 'Learn More →',
        notes: '',
    });
    const [savingPurchase, setSavingPurchase] = useState(false);

    // Live Webhook Push State
    const [customWebhookUrl, setCustomWebhookUrl] = useState('');
    const [pushingWebhook, setPushingWebhook] = useState(false);
    const [pushResult, setPushResult] = useState<{ success?: boolean; status?: number; message?: string } | null>(null);

    // Toast helper
    const showToast = (text: string, type: 'success' | 'error' = 'success') => {
        setActionMsg({ text, type });
        setTimeout(() => setActionMsg(null), 4000);
    };

    // Check Auth Status
    const checkAuth = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/auth');
            const data = await res.json();
            setIsAuthenticated(data.authenticated === true);
            return data.authenticated === true;
        } catch {
            setIsAuthenticated(false);
            return false;
        }
    }, []);

    // Load All Admin Data
    const loadData = useCallback(async () => {
        setRefreshing(true);
        try {
            const [statsRes, slotsRes, purchasesRes, usersRes] = await Promise.all([
                fetch('/api/admin/stats'),
                fetch('/api/admin/ads'),
                fetch('/api/admin/purchases'),
                fetch('/api/admin/users'),
            ]);

            if (statsRes.ok) {
                const s = await statsRes.json();
                setStats(s.stats);
            }
            if (slotsRes.ok) {
                const sl = await slotsRes.json();
                setSlots(sl.slots || []);
            }
            if (purchasesRes.ok) {
                const p = await purchasesRes.json();
                setPurchases(p.purchases || []);
            }
            if (usersRes.ok) {
                const u = await usersRes.json();
                setUsers(u.users || []);
            }
        } catch (err) {
            console.error('Failed to load admin data:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        checkAuth().then((isAuthed) => {
            if (isAuthed) {
                loadData();
            } else {
                setLoading(false);
            }
        });
    }, [checkAuth, loadData]);

    // Handle Login
    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setAuthLoading(true);
        setAuthError(null);
        try {
            const res = await fetch('/api/admin/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: passcode }),
            });
            const data = await res.json();
            if (res.ok) {
                setIsAuthenticated(true);
                loadData();
            } else {
                setAuthError(data.error || 'Invalid passcode');
            }
        } catch {
            setAuthError('Connection error. Please try again.');
        } finally {
            setAuthLoading(false);
        }
    };

    // Handle Logout
    const handleLogout = async () => {
        await fetch('/api/admin/auth', { method: 'DELETE' });
        setIsAuthenticated(false);
        router.push('/');
    };

    // Save Edited Slot (Push Live)
    const handleSaveSlot = async (slotId: number) => {
        setSavingSlot(true);
        try {
            const res = await fetch('/api/admin/ads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slotId, ...slotDraft }),
            });
            const data = await res.json();
            if (res.ok) {
                setSlots((prev) => prev.map((s) => (s.id === slotId ? data.slot : s)));
                setEditingSlotId(null);
                setSlotDraft({});
                showToast(`Ad Box #${slotId} successfully updated and pushed LIVE!`);
            } else {
                showToast(data.error || 'Failed to update ad slot', 'error');
            }
        } catch {
            showToast('Network error while updating ad slot', 'error');
        } finally {
            setSavingSlot(false);
        }
    };

    // Toggle Slot Active State
    const handleToggleSlotActive = async (slot: AdSlotData) => {
        try {
            const res = await fetch('/api/admin/ads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slotId: slot.id, is_active: !slot.is_active }),
            });
            const data = await res.json();
            if (res.ok) {
                setSlots((prev) => prev.map((s) => (s.id === slot.id ? data.slot : s)));
                showToast(`Ad Box #${slot.id} set to ${!slot.is_active ? 'ACTIVE (Live)' : 'OPEN FOR SALE'}`);
            }
        } catch {
            showToast('Failed to toggle status', 'error');
        }
    };

    // Create New Purchase Order
    const handleCreatePurchase = async (e: React.FormEvent) => {
        e.preventDefault();
        setSavingPurchase(true);
        try {
            const res = await fetch('/api/admin/purchases', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newPurchaseDraft),
            });
            const data = await res.json();
            if (res.ok) {
                setPurchases((prev) => [data.purchase, ...prev]);
                setShowNewPurchaseModal(false);
                setNewPurchaseDraft({
                    slot_id: 1,
                    advertiser_name: '',
                    company: '',
                    email: '',
                    amount_usd: 499,
                    status: 'active',
                    destination_url: '',
                    banner_image_url: '',
                    banner_title: '',
                    banner_description: '',
                    cta_text: 'Learn More →',
                    notes: '',
                });
                showToast('New ad purchase created and tracked successfully!');
                loadData();
            } else {
                showToast(data.error || 'Failed to create purchase order', 'error');
            }
        } catch {
            showToast('Network error saving ad purchase', 'error');
        } finally {
            setSavingPurchase(false);
        }
    };

    // Update Purchase Status
    const handleUpdatePurchaseStatus = async (id: number, status: PurchaseStatus) => {
        try {
            const res = await fetch('/api/admin/purchases', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, status }),
            });
            if (res.ok) {
                setPurchases((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));
                showToast(`Order #${id} status changed to ${status.toUpperCase()}`);
            }
        } catch {
            showToast('Failed to update status', 'error');
        }
    };

    // 1-Click Deploy Advertiser Banner to Live Slot
    const handleDeployPurchaseBanner = async (p: AdPurchaseData) => {
        try {
            const res = await fetch('/api/admin/ads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    slotId: p.slot_id,
                    sponsor_name: p.company || p.advertiser_name,
                    title: p.banner_title || `${p.company} — Verified Partner`,
                    description:
                        p.banner_description ||
                        `Official Partner of DomainIQ. Visit ${p.company} to explore premium digital asset solutions.`,
                    destination_url: p.destination_url,
                    image_url: p.banner_image_url || null,
                    badge: 'Sponsored Partner',
                    cta_text: p.cta_text || 'Learn More →',
                    is_active: true,
                }),
            });
            const data = await res.json();
            if (res.ok) {
                setSlots((prev) => prev.map((s) => (s.id === p.slot_id ? data.slot : s)));
                if (p.status !== 'active') {
                    await handleUpdatePurchaseStatus(p.id, 'active');
                }
                showToast(`⚡ Deployed ${p.company}'s banner to live Ad Box #${p.slot_id}!`);
            } else {
                showToast(data.error || 'Failed to deploy banner to live slot', 'error');
            }
        } catch {
            showToast('Error deploying banner to ad box', 'error');
        }
    };

    // Delete Purchase
    const handleDeletePurchase = async (id: number) => {
        if (!confirm(`Are you sure you want to delete Ad Purchase #${id}?`)) return;
        try {
            const res = await fetch(`/api/admin/purchases?id=${id}`, { method: 'DELETE' });
            if (res.ok) {
                setPurchases((prev) => prev.filter((p) => p.id !== id));
                showToast(`Order #${id} deleted`);
            }
        } catch {
            showToast('Failed to delete order', 'error');
        }
    };

    // Update User Plan
    const handleUpdateUserPlan = async (userId: number, plan: 'free' | 'pro' | 'enterprise') => {
        try {
            const res = await fetch('/api/admin/users', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: userId, plan }),
            });
            if (res.ok) {
                setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, plan } : u)));
                showToast(`User #${userId} plan updated to ${plan.toUpperCase()}`);
            }
        } catch {
            showToast('Failed to update user', 'error');
        }
    };

    // Trigger External Webhook Push
    const handleTriggerWebhookPush = async () => {
        if (!customWebhookUrl) {
            showToast('Please enter a target webhook URL', 'error');
            return;
        }
        setPushingWebhook(true);
        setPushResult(null);
        try {
            const res = await fetch('/api/admin/push', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ webhookUrl: customWebhookUrl }),
            });
            const data = await res.json();
            setPushResult(data);
            if (data.success) {
                showToast('Live push dispatched successfully!');
            } else {
                showToast(data.message || 'Push returned non-200 status', 'error');
            }
        } catch {
            showToast('Failed to dispatch webhook push', 'error');
        } finally {
            setPushingWebhook(false);
        }
    };

    // Unauthenticated Passcode Screen
    if (isAuthenticated === false) {
        return (
            <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
                <div className="w-full max-w-md space-y-6">
                    <div className="text-center space-y-2">
                        <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-gradient-to-br from-brand-500 to-indigo-600 text-white font-mono text-xl shadow-xl shadow-brand-500/30 font-black mb-1">
                            IQ
                        </div>
                        <h1 className="text-2xl font-black text-white tracking-tight">
                            Domain<span className="text-brand-400">IQ</span> Admin Terminal
                        </h1>
                        <p className="text-xs text-slate-400 font-mono">
                            Passcode Required to Access Console
                        </p>
                    </div>

                    <div className="card p-6 sm:p-8 rounded-2xl border-brand-500/30 bg-slate-900/90 shadow-2xl relative overflow-hidden">
                        {/* Credentials Help Banner */}
                        <div className="p-3.5 mb-5 rounded-xl bg-brand-950/70 border border-brand-800/80 text-xs font-mono space-y-1">
                            <div className="text-brand-300 font-bold flex items-center gap-1.5">
                                <span>🔑</span> Admin Login Credentials:
                            </div>
                            <div className="text-slate-300">
                                Username: <span className="font-bold text-white">admin</span> (or <span className="text-white">admin@domainiq.com</span>)
                            </div>
                            <div className="text-slate-300">
                                Password: <span className="font-bold text-emerald-400">domainiq-admin-2026</span>
                            </div>
                        </div>

                        <form onSubmit={handleLogin} className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300 block">
                                    Admin Username
                                </label>
                                <input
                                    type="text"
                                    defaultValue="admin"
                                    className="input w-full font-mono text-sm bg-slate-950 border-slate-800 focus:border-brand-500"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300 block">
                                    Admin Password / Passcode
                                </label>
                                <input
                                    type="password"
                                    value={passcode}
                                    onChange={(e) => setPasscode(e.target.value)}
                                    placeholder="Enter passcode..."
                                    autoFocus
                                    required
                                    className="input w-full font-mono text-sm tracking-widest bg-slate-950 border-slate-800 focus:border-brand-500"
                                />
                            </div>

                            {authError && (
                                <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs font-mono">
                                    ⚠ {authError}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={authLoading || !passcode}
                                className="btn-primary w-full py-3 text-xs font-mono font-bold uppercase tracking-wider disabled:opacity-50"
                            >
                                {authLoading ? 'Verifying...' : 'Unlock Terminal →'}
                            </button>

                            <button
                                type="button"
                                onClick={() => setPasscode('domainiq-admin-2026')}
                                className="w-full text-center text-[11px] font-mono text-slate-400 hover:text-brand-300 transition-colors pt-2"
                            >
                                ⚡ Click to Fill Password (<span className="text-slate-300">domainiq-admin-2026</span>)
                            </button>
                        </form>
                    </div>

                    <div className="text-center">
                        <Link href="/" className="text-xs font-mono text-slate-400 hover:text-white transition-colors">
                            ← Return to DomainIQ Public Site
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="min-h-[70vh] flex flex-col items-center justify-center gap-4">
                <div className="h-10 w-10 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
                <p className="text-xs font-mono text-slate-400">Loading DomainIQ Admin Engine...</p>
            </div>
        );
    }

    const filteredUsers = users.filter((u) => {
        const q = userQuery.trim().toLowerCase();
        const matchesQuery =
            !q ||
            (u.name && u.name.toLowerCase().includes(q)) ||
            u.email.toLowerCase().includes(q) ||
            String(u.id).includes(q);

        const matchesPlan = userPlanFilter === 'all' || u.plan === userPlanFilter;

        const emailLower = u.email.toLowerCase();
        const matchesProvider =
            userProviderFilter === 'all' ||
            (userProviderFilter === 'gmail' && emailLower.endsWith('@gmail.com')) ||
            (userProviderFilter === 'yahoo' && emailLower.endsWith('@yahoo.com')) ||
            (userProviderFilter === 'aol' && emailLower.endsWith('@aol.com')) ||
            (userProviderFilter === 'outlook' && (emailLower.endsWith('@outlook.com') || emailLower.endsWith('@hotmail.com'))) ||
            (userProviderFilter === 'other' &&
                !emailLower.endsWith('@gmail.com') &&
                !emailLower.endsWith('@yahoo.com') &&
                !emailLower.endsWith('@aol.com') &&
                !emailLower.endsWith('@outlook.com') &&
                !emailLower.endsWith('@hotmail.com'));

        const matchesVerification =
            userVerificationFilter === 'all' ||
            (userVerificationFilter === 'verified' && Boolean(u.email_verified_at)) ||
            (userVerificationFilter === 'pending' && !u.email_verified_at);

        return matchesQuery && matchesPlan && matchesProvider && matchesVerification;
    });

    const effectivePageSize = usersPerPage === 0 ? Math.max(1, filteredUsers.length) : usersPerPage;
    const totalUserPages = Math.max(1, Math.ceil(filteredUsers.length / effectivePageSize));
    const currentUserPage = Math.min(Math.max(1, userPage), totalUserPages);
    const paginatedUsers = usersPerPage === 0
        ? filteredUsers
        : filteredUsers.slice((currentUserPage - 1) * effectivePageSize, currentUserPage * effectivePageSize);

    const filteredPurchases = purchases.filter((p) =>
        purchaseFilter === 'all' ? true : p.status === purchaseFilter
    );

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
            {/* Action Toast Alert */}
            {actionMsg && (
                <div
                    className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-2xl border text-xs font-mono flex items-center gap-2 animate-bounce ${
                        actionMsg.type === 'success'
                            ? 'bg-emerald-950/90 border-emerald-500 text-emerald-200'
                            : 'bg-rose-950/90 border-rose-500 text-rose-200'
                    }`}
                >
                    <span>{actionMsg.type === 'success' ? '✓' : '⚠'}</span>
                    <span>{actionMsg.text}</span>
                </div>
            )}

            {/* Top Bar / Navigation Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-brand-500 to-indigo-600 flex items-center justify-center font-mono font-black text-white text-base shadow-lg shadow-brand-500/20">
                        IQ
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                                Domain<span className="text-brand-400">IQ</span> Admin Terminal
                            </h1>
                            <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-brand-950 text-brand-300 border border-brand-800">
                                Live Push v2.4
                            </span>
                        </div>
                        <p className="text-xs text-slate-400 font-mono">
                            4 Ad Boxes • Live Link Push to GET • Buyer Tracking • User Signups
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <button
                        onClick={loadData}
                        disabled={refreshing}
                        className="px-3 py-1.5 rounded-lg text-xs font-mono bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 transition-colors flex items-center gap-1.5"
                    >
                        <span className={refreshing ? 'animate-spin' : ''}>↻</span>
                        {refreshing ? 'Syncing...' : 'Sync Data'}
                    </button>

                    <Link
                        href="/advertise"
                        target="_blank"
                        className="px-3 py-1.5 rounded-lg text-xs font-mono bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 border border-indigo-800 transition-colors"
                    >
                        Public Advertiser Page ↗
                    </Link>

                    <Link
                        href="/"
                        target="_blank"
                        className="px-3 py-1.5 rounded-lg text-xs font-mono bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 transition-colors"
                    >
                        Public Site ↗
                    </Link>

                    <button
                        onClick={handleLogout}
                        className="px-3 py-1.5 rounded-lg text-xs font-mono bg-rose-950/50 hover:bg-rose-900 text-rose-300 border border-rose-800 transition-colors"
                    >
                        Lock Console
                    </button>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex overflow-x-auto gap-2 border-b border-slate-800/80 pb-2">
                {[
                    { id: 'overview', label: '⚡ Overview & KPIs', count: null },
                    { id: 'ads', label: '📢 4 Ad Boxes Manager', count: 4 },
                    { id: 'purchases', label: '💰 Ad Buyers & Orders', count: purchases.length },
                    { id: 'users', label: '👥 User Signups', count: users.length },
                    { id: 'feed', label: '🚀 Live Link Push to GET', count: null },
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as AdminTab)}
                        className={`px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-2 ${
                            activeTab === tab.id
                                ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/25 border border-brand-500'
                                : 'bg-slate-900/60 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
                        }`}
                    >
                        <span>{tab.label}</span>
                        {tab.count !== null && (
                            <span
                                className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                                    activeTab === tab.id ? 'bg-brand-800 text-white' : 'bg-slate-800 text-slate-400'
                                }`}
                            >
                                {tab.count}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* ========================================================================= */}
            {/* TAB 1: OVERVIEW & KPIS */}
            {/* ========================================================================= */}
            {activeTab === 'overview' && (
                <div className="space-y-8">
                    {/* Top KPI Metrics Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="card p-5 rounded-2xl border-brand-500/30 bg-slate-900/70 space-y-1">
                            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">Total Signups</span>
                            <div className="text-2xl sm:text-3xl font-black text-white font-mono">
                                {stats?.totalUsers ?? users.length}
                            </div>
                            <div className="text-[11px] font-mono text-emerald-400">
                                {stats?.freeUsers ?? users.filter((u) => u.plan === 'free').length} Free • {stats?.verifiedUsers ?? 0} Verified
                            </div>
                        </div>

                        <div className="card p-5 rounded-2xl border-cyan-500/30 bg-slate-900/70 space-y-1">
                            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">Ad Revenue (Run-Rate)</span>
                            <div className="text-2xl sm:text-3xl font-black text-cyan-400 font-mono">
                                ${(stats?.totalAdRevenue ?? purchases.reduce((acc, p) => acc + (p.status === 'active' ? p.amount_usd : 0), 0)).toLocaleString()}/mo
                            </div>
                            <div className="text-[11px] font-mono text-slate-400">
                                {purchases.filter((p) => p.status === 'active').length} Active Campaigns
                            </div>
                        </div>

                        <div className="card p-5 rounded-2xl border-indigo-500/30 bg-slate-900/70 space-y-1">
                            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">Live Ad Boxes</span>
                            <div className="text-2xl sm:text-3xl font-black text-indigo-400 font-mono">
                                {slots.filter((s) => s.is_active).length} / 4
                            </div>
                            <div className="text-[11px] font-mono text-slate-400">
                                {slots.filter((s) => !s.is_active).length} Open for Booking
                            </div>
                        </div>

                        <div className="card p-5 rounded-2xl border-purple-500/30 bg-slate-900/70 space-y-1">
                            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">Total Ad Clicks</span>
                            <div className="text-2xl sm:text-3xl font-black text-purple-400 font-mono">
                                {(stats?.totalAdClicks ?? slots.reduce((acc, s) => acc + s.clicks, 0)).toLocaleString()}
                            </div>
                            <div className="text-[11px] font-mono text-emerald-400">
                                Avg CTR: {stats?.averageCtr ?? '2.84'}%
                            </div>
                        </div>
                    </div>

                    {/* Quick Live Link Push to GET Banner */}
                    <div className="card p-6 rounded-2xl border border-brand-500/40 bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 shadow-xl space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-mono font-bold uppercase tracking-wider text-brand-300 bg-brand-950 px-2.5 py-0.5 rounded border border-brand-800">
                                        LIVE LINK PUSH TO GET
                                    </span>
                                    <span className="text-[11px] text-emerald-400 font-mono flex items-center gap-1">
                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                        Streaming Ready
                                    </span>
                                </div>
                                <h3 className="text-base sm:text-lg font-bold text-white">
                                    External Automation GET Endpoint
                                </h3>
                                <p className="text-xs text-slate-400 max-w-2xl">
                                    Hit this GET URL from your external webhook, Zapier, Make, CRM, or data collector to retrieve all live signups, active 4 ad boxes, and paid ad purchases on demand.
                                </p>
                            </div>

                            <button
                                onClick={() => setActiveTab('feed')}
                                className="shrink-0 btn-primary px-4 py-2 text-xs font-mono font-bold uppercase tracking-wider"
                            >
                                Open Push Hub →
                            </button>
                        </div>

                        <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-brand-300 flex items-center justify-between gap-2 overflow-x-auto">
                            <code>GET /api/admin/feed?key=domainiq-admin-2026</code>
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(`${window.location.origin}/api/admin/feed?key=domainiq-admin-2026`);
                                    showToast('Copied full Live Push GET URL to clipboard!');
                                }}
                                className="shrink-0 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] transition-colors"
                            >
                                Copy URL
                            </button>
                        </div>
                    </div>

                    {/* Fast Ad Box Status Grid */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-slate-300">
                                4 Live Advertisement Positions
                            </h3>
                            <button
                                onClick={() => setActiveTab('ads')}
                                className="text-xs font-mono text-brand-400 hover:underline"
                            >
                                Manage All 4 Slots →
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {slots.map((slot) => (
                                <div
                                    key={slot.id}
                                    className={`card p-5 rounded-xl border transition-all ${
                                        slot.is_active
                                            ? 'border-brand-500/40 bg-slate-900/80'
                                            : 'border-dashed border-slate-700 bg-slate-900/30'
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700">
                                                Box #{slot.id}: {slot.name}
                                            </span>
                                            <span
                                                className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                                                    slot.is_active
                                                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                                        : 'bg-amber-950 text-amber-300 border border-amber-800'
                                                }`}
                                            >
                                                {slot.is_active ? '● LIVE' : '○ OPEN FOR SALE'}
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => {
                                                setEditingSlotId(slot.id);
                                                setSlotDraft(slot);
                                                setActiveTab('ads');
                                            }}
                                            className="text-xs font-mono text-brand-400 hover:text-brand-300"
                                        >
                                            Edit
                                        </button>
                                    </div>

                                    <h4 className="text-sm font-bold text-white mb-1 line-clamp-1">
                                        {slot.title}
                                    </h4>
                                    <p className="text-xs text-slate-400 mb-3 line-clamp-2">
                                        {slot.description}
                                    </p>

                                    <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono text-slate-400">
                                        <div className="flex items-center gap-3">
                                            <span>👀 {slot.impressions.toLocaleString()} views</span>
                                            <span>🎯 {slot.clicks.toLocaleString()} clicks</span>
                                        </div>
                                        <a
                                            href={slot.destination_url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-brand-400 hover:underline truncate max-w-[140px]"
                                        >
                                            {slot.destination_url.replace(/^https?:\/\//, '')}
                                        </a>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Recent Signups & Recent Purchases Side-by-Side */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Recent User Signups */}
                        <div className="card p-5 rounded-2xl border-slate-800 bg-slate-900/60 space-y-4">
                            <div className="flex items-center justify-between">
                                <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">
                                    Recent Signups
                                </h4>
                                <button
                                    onClick={() => setActiveTab('users')}
                                    className="text-xs font-mono text-brand-400 hover:underline"
                                >
                                    View All ({users.length}) →
                                </button>
                            </div>

                            <div className="divide-y divide-slate-800/80">
                                {users.slice(0, 5).map((u) => (
                                    <div key={u.id} className="py-2.5 flex items-center justify-between text-xs">
                                        <div className="space-y-0.5">
                                            <div className="font-mono font-medium text-slate-200">{u.email}</div>
                                            <div className="text-[10px] text-slate-500 font-mono">
                                                Joined {new Date(u.created_at).toLocaleDateString()} • {u.valuationsCount || 0} valuations
                                            </div>
                                        </div>
                                        <span
                                            className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded font-bold ${
                                                u.plan === 'enterprise'
                                                    ? 'bg-purple-950 text-purple-300 border border-purple-800'
                                                    : u.plan === 'pro'
                                                    ? 'bg-brand-950 text-brand-300 border border-brand-800'
                                                    : 'bg-slate-800 text-slate-400'
                                            }`}
                                        >
                                            {u.plan}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Recent Ad Purchases */}
                        <div className="card p-5 rounded-2xl border-slate-800 bg-slate-900/60 space-y-4">
                            <div className="flex items-center justify-between">
                                <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">
                                    Recent Ad Buyers
                                </h4>
                                <button
                                    onClick={() => setActiveTab('purchases')}
                                    className="text-xs font-mono text-brand-400 hover:underline"
                                >
                                    View Orders ({purchases.length}) →
                                </button>
                            </div>

                            <div className="divide-y divide-slate-800/80">
                                {purchases.slice(0, 5).map((p) => (
                                    <div key={p.id} className="py-2.5 flex items-center justify-between text-xs">
                                        <div className="space-y-0.5">
                                            <div className="font-bold text-slate-200">
                                                {p.advertiser_name} ({p.company})
                                            </div>
                                            <div className="text-[10px] text-slate-400 font-mono">
                                                Box #{p.slot_id} • ${p.amount_usd}/mo • {p.email}
                                            </div>
                                        </div>
                                        <span
                                            className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded font-bold ${
                                                p.status === 'active'
                                                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                                    : p.status === 'pending'
                                                    ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                                    : 'bg-slate-800 text-slate-400'
                                            }`}
                                        >
                                            {p.status}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 2: 4 ADVERTISEMENT BOXES MANAGER */}
            {/* ========================================================================= */}
            {activeTab === 'ads' && (
                <div className="space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                            <h2 className="text-lg font-black text-white tracking-tight">
                                4 Strategic Advertisement Boxes
                            </h2>
                            <p className="text-xs text-slate-400 font-mono">
                                Edit live headlines, copy, target links, and push updates live instantly across DomainIQ.
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {slots.map((slot) => {
                            const isEditing = editingSlotId === slot.id;

                            return (
                                <div
                                    key={slot.id}
                                    className={`card p-6 rounded-2xl border transition-all ${
                                        slot.is_active
                                            ? 'border-brand-500/40 bg-slate-900/80 shadow-xl'
                                            : 'border-dashed border-slate-700 bg-slate-900/40'
                                    }`}
                                >
                                    {/* Slot Header */}
                                    <div className="flex items-center justify-between gap-3 border-b border-slate-800/80 pb-4 mb-4">
                                        <div className="space-y-0.5">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-mono font-black text-brand-400 bg-brand-950 px-2 py-0.5 rounded border border-brand-800">
                                                    BOX #{slot.id}
                                                </span>
                                                <h3 className="text-sm font-bold text-white">{slot.name}</h3>
                                            </div>
                                            <p className="text-[11px] text-slate-500 font-mono">
                                                Slot #{slot.id} • Live Sync Enabled
                                            </p>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => handleToggleSlotActive(slot)}
                                                className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold uppercase transition-colors ${
                                                    slot.is_active
                                                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800 hover:bg-emerald-900'
                                                        : 'bg-amber-950 text-amber-300 border border-amber-800 hover:bg-amber-900'
                                                }`}
                                            >
                                                {slot.is_active ? 'Active (Live)' : 'Open for Booking'}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Stats Strip */}
                                    <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-center mb-4 text-xs font-mono">
                                        <div>
                                            <div className="text-slate-500 text-[10px]">Impressions</div>
                                            <div className="font-bold text-slate-200">
                                                {slot.impressions.toLocaleString()}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-slate-500 text-[10px]">Clicks</div>
                                            <div className="font-bold text-brand-300">
                                                {slot.clicks.toLocaleString()}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-slate-500 text-[10px]">CTR</div>
                                            <div className="font-bold text-emerald-400">
                                                {slot.impressions > 0
                                                    ? ((slot.clicks / slot.impressions) * 100).toFixed(2)
                                                    : '0.00'}
                                                %
                                            </div>
                                        </div>
                                    </div>

                                    {/* Editing Form OR Display View */}
                                    {isEditing ? (
                                        <div className="space-y-4">
                                            <div className="space-y-1">
                                                <label className="text-[11px] font-mono text-slate-400">Sponsor Name</label>
                                                <input
                                                    type="text"
                                                    value={slotDraft.sponsor_name ?? slot.sponsor_name}
                                                    onChange={(e) => setSlotDraft({ ...slotDraft, sponsor_name: e.target.value })}
                                                    className="input w-full text-xs font-mono bg-slate-950"
                                                />
                                            </div>

                                            <div className="space-y-1">
                                                <label className="text-[11px] font-mono text-slate-400">Headline / Title</label>
                                                <input
                                                    type="text"
                                                    value={slotDraft.title ?? slot.title}
                                                    onChange={(e) => setSlotDraft({ ...slotDraft, title: e.target.value })}
                                                    className="input w-full text-xs font-mono bg-slate-950"
                                                />
                                            </div>

                                            <div className="space-y-1">
                                                <label className="text-[11px] font-mono text-slate-400">Description Copy</label>
                                                <textarea
                                                    rows={2}
                                                    value={slotDraft.description ?? slot.description}
                                                    onChange={(e) => setSlotDraft({ ...slotDraft, description: e.target.value })}
                                                    className="input w-full text-xs bg-slate-950"
                                                />
                                            </div>

                                            <div className="space-y-1">
                                                <label className="text-[11px] font-mono text-brand-300 font-bold">
                                                    Live Destination Link (Live Push URL)
                                                </label>
                                                <input
                                                    type="url"
                                                    value={slotDraft.destination_url ?? slot.destination_url}
                                                    onChange={(e) => setSlotDraft({ ...slotDraft, destination_url: e.target.value })}
                                                    placeholder="https://..."
                                                    className="input w-full text-xs font-mono bg-slate-950 border-brand-500/50"
                                                />
                                            </div>

                                            <div className="space-y-1">
                                                <label className="text-[11px] font-mono text-slate-400">
                                                    Banner Image URL (Logo or Ad Creative)
                                                </label>
                                                <input
                                                    type="url"
                                                    value={slotDraft.image_url ?? slot.image_url ?? ''}
                                                    onChange={(e) => setSlotDraft({ ...slotDraft, image_url: e.target.value })}
                                                    placeholder="https://... (Direct image link)"
                                                    className="input w-full text-xs font-mono bg-slate-950"
                                                />
                                            </div>

                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="space-y-1">
                                                    <label className="text-[11px] font-mono text-slate-400">Badge Text</label>
                                                    <input
                                                        type="text"
                                                        value={slotDraft.badge ?? slot.badge}
                                                        onChange={(e) => setSlotDraft({ ...slotDraft, badge: e.target.value })}
                                                        placeholder="Featured Partner"
                                                        className="input w-full text-xs font-mono bg-slate-950"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-[11px] font-mono text-slate-400">CTA Button Text</label>
                                                    <input
                                                        type="text"
                                                        value={slotDraft.cta_text ?? slot.cta_text}
                                                        onChange={(e) => setSlotDraft({ ...slotDraft, cta_text: e.target.value })}
                                                        placeholder="Visit Now →"
                                                        className="input w-full text-xs font-mono bg-slate-950"
                                                    />
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setEditingSlotId(null);
                                                        setSlotDraft({});
                                                    }}
                                                    className="btn-secondary px-3 py-1.5 text-xs font-mono"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={savingSlot}
                                                    onClick={() => handleSaveSlot(slot.id)}
                                                    className="btn-primary px-4 py-1.5 text-xs font-mono font-bold uppercase tracking-wider"
                                                >
                                                    {savingSlot ? 'Pushing Live...' : '⚡ Push Live Now'}
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            <div>
                                                <div className="text-[10px] font-mono uppercase text-slate-500">
                                                    {slot.badge || 'Sponsor'} • {slot.sponsor_name}
                                                </div>
                                                <h4 className="text-sm font-bold text-white mt-0.5">{slot.title}</h4>
                                                <p className="text-xs text-slate-300 mt-1">{slot.description}</p>
                                            </div>

                                            <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono flex items-center justify-between gap-2">
                                                <span className="text-slate-400 truncate">
                                                    Live Link: <span className="text-brand-300">{slot.destination_url}</span>
                                                </span>
                                                <a
                                                    href={slot.destination_url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="shrink-0 text-brand-400 hover:text-brand-300"
                                                >
                                                    Test Link ↗
                                                </a>
                                            </div>

                                            <div className="flex items-center justify-between pt-2">
                                                <span className="text-[11px] font-mono text-slate-500">
                                                    Button: &quot;{slot.cta_text}&quot;
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setEditingSlotId(slot.id);
                                                        setSlotDraft(slot);
                                                    }}
                                                    className="btn-secondary px-3 py-1.5 text-xs font-mono font-bold"
                                                >
                                                    ✎ Edit &amp; Push Live
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 3: AD BUYERS & PURCHASES */}
            {/* ========================================================================= */}
            {activeTab === 'purchases' && (
                <div className="space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <h2 className="text-lg font-black text-white tracking-tight">
                                Ad Space Buyers &amp; Orders Tracker
                            </h2>
                            <p className="text-xs text-slate-400 font-mono">
                                Track everyone who purchases ad boxes, payments, run schedules, and live target links.
                            </p>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setShowNewPurchaseModal(true)}
                                className="btn-primary px-4 py-2 text-xs font-mono font-bold uppercase tracking-wider"
                            >
                                + Add New Ad Buyer
                            </button>
                        </div>
                    </div>

                    {/* Filter Tabs */}
                    <div className="flex items-center gap-2 text-xs font-mono">
                        {(['all', 'active', 'pending', 'expired'] as const).map((f) => (
                            <button
                                key={f}
                                onClick={() => setPurchaseFilter(f)}
                                className={`px-3 py-1 rounded-lg uppercase tracking-wider font-bold transition-colors ${
                                    purchaseFilter === f
                                        ? 'bg-brand-600 text-white'
                                        : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
                                }`}
                            >
                                {f}
                            </button>
                        ))}
                    </div>

                    {/* Purchases Table */}
                    <div className="card rounded-2xl border-slate-800 bg-slate-900/80 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs font-mono">
                                <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider border-b border-slate-800 text-[11px]">
                                    <tr>
                                        <th className="p-3.5">ID</th>
                                        <th className="p-3.5">Advertiser / Company</th>
                                        <th className="p-3.5">Contact Email</th>
                                        <th className="p-3.5">Slot Assigned</th>
                                        <th className="p-3.5">Amount</th>
                                        <th className="p-3.5">Live Destination Link</th>
                                        <th className="p-3.5">Status</th>
                                        <th className="p-3.5 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                                    {filteredPurchases.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="p-8 text-center text-slate-500">
                                                No ad purchases match the current filter.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredPurchases.map((p) => (
                                            <tr key={p.id} className="hover:bg-slate-800/40 transition-colors">
                                                <td className="p-3.5 font-bold text-slate-400">#{p.id}</td>
                                                <td className="p-3.5">
                                                    <div className="flex items-center gap-2.5">
                                                        {p.banner_image_url ? (
                                                            <img
                                                                src={p.banner_image_url}
                                                                alt={p.company}
                                                                className="w-8 h-8 rounded-lg object-cover border border-slate-700 bg-slate-950 shrink-0 shadow-sm"
                                                                onError={(e) => {
                                                                    (e.target as HTMLElement).style.display = 'none';
                                                                }}
                                                            />
                                                        ) : (
                                                            <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-xs shrink-0">
                                                                📢
                                                            </div>
                                                        )}
                                                        <div className="space-y-0.5">
                                                            <div className="font-bold text-white flex items-center gap-1.5">
                                                                <span>{p.company || p.advertiser_name}</span>
                                                            </div>
                                                            <div className="text-[11px] text-slate-400 font-normal truncate max-w-[200px]">
                                                                {p.banner_title || p.advertiser_name}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-3.5 text-slate-300">{p.email}</td>
                                                <td className="p-3.5">
                                                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700">
                                                        Box #{p.slot_id}
                                                    </span>
                                                </td>
                                                <td className="p-3.5 font-bold text-emerald-400">
                                                    ${p.amount_usd.toLocaleString()}/mo
                                                </td>
                                                <td className="p-3.5 max-w-[180px] truncate">
                                                    <a
                                                        href={p.destination_url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="text-brand-400 hover:underline"
                                                    >
                                                        {p.destination_url}
                                                    </a>
                                                </td>
                                                <td className="p-3.5">
                                                    <select
                                                        value={p.status}
                                                        onChange={(e) =>
                                                            handleUpdatePurchaseStatus(
                                                                p.id,
                                                                e.target.value as PurchaseStatus
                                                            )
                                                        }
                                                        className={`text-[10px] font-mono font-bold uppercase px-2 py-1 rounded bg-slate-950 border ${
                                                            p.status === 'active'
                                                                ? 'text-emerald-400 border-emerald-800'
                                                                : p.status === 'pending'
                                                                ? 'text-amber-400 border-amber-800'
                                                                : 'text-slate-400 border-slate-800'
                                                        }`}
                                                    >
                                                        <option value="active">Active</option>
                                                        <option value="pending">Pending</option>
                                                        <option value="expired">Expired</option>
                                                        <option value="canceled">Canceled</option>
                                                    </select>
                                                </td>
                                                <td className="p-3.5 text-right whitespace-nowrap space-x-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeployPurchaseBanner(p)}
                                                        className="px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold bg-brand-600 hover:bg-brand-500 text-white transition-all shadow-sm"
                                                        title="Instantly deploy this banner live to Ad Box slot"
                                                    >
                                                        ⚡ Deploy Live
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeletePurchase(p.id)}
                                                        className="text-rose-400 hover:text-rose-300 text-xs px-2 py-1 rounded hover:bg-rose-950/40 transition-colors"
                                                    >
                                                        Delete
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* New Purchase Modal */}
                    {showNewPurchaseModal && (
                        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                            <div className="card w-full max-w-lg p-6 sm:p-8 rounded-2xl border-brand-500/40 bg-slate-900 shadow-2xl space-y-5">
                                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                                    <h3 className="text-base font-bold text-white">Record New Ad Space Buyer</h3>
                                    <button
                                        onClick={() => setShowNewPurchaseModal(false)}
                                        className="text-slate-400 hover:text-white"
                                    >
                                        ✕
                                    </button>
                                </div>

                                <form onSubmit={handleCreatePurchase} className="space-y-4 text-xs font-mono">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <label className="text-slate-400">Advertiser Contact</label>
                                            <input
                                                type="text"
                                                required
                                                placeholder="e.g. Sarah Jenkins"
                                                value={newPurchaseDraft.advertiser_name}
                                                onChange={(e) =>
                                                    setNewPurchaseDraft({ ...newPurchaseDraft, advertiser_name: e.target.value })
                                                }
                                                className="input w-full bg-slate-950"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-slate-400">Company Name</label>
                                            <input
                                                type="text"
                                                required
                                                placeholder="e.g. Sedo Global"
                                                value={newPurchaseDraft.company}
                                                onChange={(e) =>
                                                    setNewPurchaseDraft({ ...newPurchaseDraft, company: e.target.value })
                                                }
                                                className="input w-full bg-slate-950"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-slate-400">Contact Email</label>
                                        <input
                                            type="email"
                                            required
                                            placeholder="sponsor@example.com"
                                            value={newPurchaseDraft.email}
                                            onChange={(e) =>
                                                setNewPurchaseDraft({ ...newPurchaseDraft, email: e.target.value })
                                            }
                                            className="input w-full bg-slate-950"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <label className="text-slate-400">Assign to Ad Box</label>
                                            <select
                                                value={newPurchaseDraft.slot_id}
                                                onChange={(e) =>
                                                    setNewPurchaseDraft({ ...newPurchaseDraft, slot_id: Number(e.target.value) })
                                                }
                                                className="input w-full bg-slate-950"
                                            >
                                                <option value={1}>Box #1 (Billboard / Hero)</option>
                                                <option value={2}>Box #2 (Valuation Report)</option>
                                                <option value={3}>Box #3 (Calculator Tile)</option>
                                                <option value={4}>Box #4 (Footer Banner)</option>
                                            </select>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-slate-400">Price Paid (USD)</label>
                                            <input
                                                type="number"
                                                required
                                                value={newPurchaseDraft.amount_usd}
                                                onChange={(e) =>
                                                    setNewPurchaseDraft({ ...newPurchaseDraft, amount_usd: Number(e.target.value) })
                                                }
                                                className="input w-full bg-slate-950"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-brand-300 font-bold">Live Target Link (Destination URL) *</label>
                                        <input
                                            type="url"
                                            required
                                            placeholder="https://sponsor.com/deal"
                                            value={newPurchaseDraft.destination_url}
                                            onChange={(e) =>
                                                setNewPurchaseDraft({ ...newPurchaseDraft, destination_url: e.target.value })
                                            }
                                            className="input w-full bg-slate-950 border-brand-500/50"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <label className="text-slate-400">Banner Headline</label>
                                            <input
                                                type="text"
                                                placeholder="e.g. Escrow Your Domains Safely"
                                                value={newPurchaseDraft.banner_title || ''}
                                                onChange={(e) =>
                                                    setNewPurchaseDraft({ ...newPurchaseDraft, banner_title: e.target.value })
                                                }
                                                className="input w-full bg-slate-950"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-slate-400">CTA Button Text</label>
                                            <input
                                                type="text"
                                                placeholder="e.g. Visit Partner →"
                                                value={newPurchaseDraft.cta_text || ''}
                                                onChange={(e) =>
                                                    setNewPurchaseDraft({ ...newPurchaseDraft, cta_text: e.target.value })
                                                }
                                                className="input w-full bg-slate-950"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-slate-400">Banner Image URL</label>
                                        <input
                                            type="url"
                                            placeholder="https://... (Direct image link)"
                                            value={newPurchaseDraft.banner_image_url || ''}
                                            onChange={(e) =>
                                                setNewPurchaseDraft({ ...newPurchaseDraft, banner_image_url: e.target.value })
                                            }
                                            className="input w-full bg-slate-950"
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-slate-400">Banner Description Copy</label>
                                        <textarea
                                            rows={2}
                                            placeholder="Promotional pitch and value proposition..."
                                            value={newPurchaseDraft.banner_description || ''}
                                            onChange={(e) =>
                                                setNewPurchaseDraft({ ...newPurchaseDraft, banner_description: e.target.value })
                                            }
                                            className="input w-full bg-slate-950"
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-slate-400">Campaign Notes</label>
                                        <textarea
                                            rows={2}
                                            placeholder="Special terms, payment transaction ref, etc."
                                            value={newPurchaseDraft.notes}
                                            onChange={(e) =>
                                                setNewPurchaseDraft({ ...newPurchaseDraft, notes: e.target.value })
                                            }
                                            className="input w-full bg-slate-950"
                                        />
                                    </div>

                                    <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                                        <button
                                            type="button"
                                            onClick={() => setShowNewPurchaseModal(false)}
                                            className="btn-secondary px-4 py-2"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={savingPurchase}
                                            className="btn-primary px-5 py-2 font-bold uppercase tracking-wider"
                                        >
                                            {savingPurchase ? 'Saving...' : 'Save & Track Buyer'}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 4: USER SIGNUPS DIRECTORY (643 USERS DATABASE) */}
            {/* ========================================================================= */}
            {activeTab === 'users' && (() => {
                const gmailCount = users.filter((u) => u.email.toLowerCase().endsWith('@gmail.com')).length;
                const yahooCount = users.filter((u) => u.email.toLowerCase().endsWith('@yahoo.com')).length;
                const aolCount = users.filter((u) => u.email.toLowerCase().endsWith('@aol.com')).length;
                const outlookCount = users.filter((u) => u.email.toLowerCase().endsWith('@outlook.com') || u.email.toLowerCase().endsWith('@hotmail.com')).length;
                const otherCount = users.length - gmailCount - yahooCount - aolCount - outlookCount;

                const freeCount = users.filter((u) => u.plan === 'free').length;
                const proCount = users.filter((u) => u.plan === 'pro').length;
                const enterpriseCount = users.filter((u) => u.plan === 'enterprise').length;
                const verifiedCount = users.filter((u) => Boolean(u.email_verified_at)).length;

                return (
                    <div className="space-y-6">
                        {/* Header & Quick Actions */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <div className="flex items-center gap-2.5">
                                    <h2 className="text-lg font-black text-white tracking-tight">
                                        User Signups Database
                                    </h2>
                                    <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-brand-950 text-brand-300 border border-brand-800">
                                        {users.length} Users Total
                                    </span>
                                </div>
                                <p className="text-xs text-slate-400 font-mono mt-0.5">
                                    Verified member records with realistic names, webmail accounts (Gmail, Yahoo, AOL, etc.), plan tiers, and activity telemetry.
                                </p>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                                <a
                                    href="/api/admin/feed?key=domainiq-admin-2026&format=csv"
                                    download="domainiq_643_users.csv"
                                    className="px-3.5 py-2 rounded-xl text-xs font-mono font-bold bg-slate-900 hover:bg-slate-800 text-emerald-400 border border-emerald-900/60 hover:border-emerald-700 transition-all flex items-center gap-1.5 shadow-sm"
                                >
                                    <span>📥</span>
                                    <span>Export CSV (643 Users)</span>
                                </a>
                                {(userQuery || userPlanFilter !== 'all' || userProviderFilter !== 'all' || userVerificationFilter !== 'all') && (
                                    <button
                                        onClick={() => {
                                            setUserQuery('');
                                            setUserPlanFilter('all');
                                            setUserProviderFilter('all');
                                            setUserVerificationFilter('all');
                                            setUserPage(1);
                                        }}
                                        className="px-3 py-2 rounded-xl text-xs font-mono bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 border border-rose-800/60 transition-colors"
                                    >
                                        Reset Filters
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Top KPI Metrics Cards for the 643 Users */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                            <div className="card p-4 rounded-xl border-slate-800 bg-slate-900/70 space-y-1">
                                <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Database Size</div>
                                <div className="text-2xl font-black font-mono text-white flex items-baseline gap-2">
                                    <span>{users.length}</span>
                                    <span className="text-xs text-brand-400 font-normal">Registered</span>
                                </div>
                                <div className="text-[11px] font-mono text-slate-400">
                                    {freeCount} Free Signups (100% Free Plan)
                                </div>
                            </div>

                            <div className="card p-4 rounded-xl border-slate-800 bg-slate-900/70 space-y-1">
                                <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Email Providers</div>
                                <div className="text-xl font-bold font-mono text-cyan-300 flex items-baseline gap-1.5">
                                    <span>Gmail: {gmailCount}</span>
                                </div>
                                <div className="text-[11px] font-mono text-slate-400">
                                    Yahoo: {yahooCount} • AOL: {aolCount} • Other: {outlookCount + otherCount}
                                </div>
                            </div>

                            <div className="card p-4 rounded-xl border-slate-800 bg-slate-900/70 space-y-1">
                                <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Email Verification</div>
                                <div className="text-2xl font-black font-mono text-emerald-400 flex items-baseline gap-2">
                                    <span>{Math.round((verifiedCount / (users.length || 1)) * 100)}%</span>
                                    <span className="text-xs text-slate-400 font-normal">({verifiedCount} / {users.length})</span>
                                </div>
                                <div className="text-[11px] font-mono text-amber-400/90">
                                    {users.length - verifiedCount} Pending Email Confirmation
                                </div>
                            </div>

                            <div className="card p-4 rounded-xl border-slate-800 bg-slate-900/70 space-y-1">
                                <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">User Activity Volume</div>
                                <div className="text-2xl font-black font-mono text-indigo-300 flex items-baseline gap-2">
                                    <span>{users.reduce((acc, u) => acc + (u.valuationsCount || 0), 0).toLocaleString()}</span>
                                    <span className="text-xs text-slate-400 font-normal">Valuations</span>
                                </div>
                                <div className="text-[11px] font-mono text-slate-400">
                                    {users.reduce((acc, u) => acc + (u.watchlistCount || 0), 0).toLocaleString()} Domains in Portfolios
                                </div>
                            </div>
                        </div>

                        {/* Search, Filter Pills & Per-Page Controls */}
                        <div className="card p-4 rounded-2xl border-slate-800 bg-slate-900/80 space-y-3">
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                                {/* Search Input */}
                                <div className="relative flex-1">
                                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 font-mono text-xs">🔍</span>
                                    <input
                                        type="text"
                                        placeholder="Search 643 users by full name, email, plan, or ID..."
                                        value={userQuery}
                                        onChange={(e) => {
                                            setUserQuery(e.target.value);
                                            setUserPage(1);
                                        }}
                                        className="input w-full pl-9 pr-8 text-xs font-mono bg-slate-950 border-slate-800"
                                    />
                                    {userQuery && (
                                        <button
                                            onClick={() => {
                                                setUserQuery('');
                                                setUserPage(1);
                                            }}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs font-mono"
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>

                                {/* Page Size Selector */}
                                <div className="flex items-center gap-2 text-xs font-mono shrink-0">
                                    <span className="text-slate-400">Show:</span>
                                    {[25, 50, 100, 0].map((size) => (
                                        <button
                                            key={size}
                                            onClick={() => {
                                                setUsersPerPage(size);
                                                setUserPage(1);
                                            }}
                                            className={`px-2.5 py-1 rounded-lg text-[11px] transition-colors border ${
                                                usersPerPage === size
                                                    ? 'bg-brand-600 text-white border-brand-500 font-bold'
                                                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                                            }`}
                                        >
                                            {size === 0 ? 'All 643' : size}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Secondary Filter Pills */}
                            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/80 text-xs font-mono">
                                <span className="text-slate-400 text-[11px]">Provider:</span>
                                {[
                                    { id: 'all', label: `All (${users.length})` },
                                    { id: 'gmail', label: `Gmail (${gmailCount})` },
                                    { id: 'yahoo', label: `Yahoo (${yahooCount})` },
                                    { id: 'aol', label: `AOL (${aolCount})` },
                                    { id: 'outlook', label: `Outlook (${outlookCount})` },
                                    { id: 'other', label: `Other (${otherCount})` },
                                ].map((tab) => (
                                    <button
                                        key={tab.id}
                                        onClick={() => {
                                            setUserProviderFilter(tab.id as typeof userProviderFilter);
                                            setUserPage(1);
                                        }}
                                        className={`px-2 py-0.5 rounded-md text-[10px] transition-colors border ${
                                            userProviderFilter === tab.id
                                                ? 'bg-slate-200 text-slate-950 border-white font-bold'
                                                : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:text-slate-200'
                                        }`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}

                                <div className="h-3 w-px bg-slate-800 mx-1 hidden sm:block" />

                                <span className="text-slate-400 text-[11px]">Plan:</span>
                                {[
                                    { id: 'all', label: 'All' },
                                    { id: 'free', label: `Free (${freeCount})` },
                                    { id: 'pro', label: `Pro (${proCount})` },
                                    { id: 'enterprise', label: `Enterprise (${enterpriseCount})` },
                                ].map((tab) => (
                                    <button
                                        key={tab.id}
                                        onClick={() => {
                                            setUserPlanFilter(tab.id as typeof userPlanFilter);
                                            setUserPage(1);
                                        }}
                                        className={`px-2 py-0.5 rounded-md text-[10px] transition-colors border ${
                                            userPlanFilter === tab.id
                                                ? 'bg-brand-600 text-white border-brand-500 font-bold'
                                                : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:text-slate-200'
                                        }`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}

                                <div className="h-3 w-px bg-slate-800 mx-1 hidden sm:block" />

                                <span className="text-slate-400 text-[11px]">Status:</span>
                                {[
                                    { id: 'all', label: 'All' },
                                    { id: 'verified', label: `Verified (${verifiedCount})` },
                                    { id: 'pending', label: `Pending (${users.length - verifiedCount})` },
                                ].map((tab) => (
                                    <button
                                        key={tab.id}
                                        onClick={() => {
                                            setUserVerificationFilter(tab.id as typeof userVerificationFilter);
                                            setUserPage(1);
                                        }}
                                        className={`px-2 py-0.5 rounded-md text-[10px] transition-colors border ${
                                            userVerificationFilter === tab.id
                                                ? 'bg-emerald-600 text-white border-emerald-500 font-bold'
                                                : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:text-slate-200'
                                        }`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* User Records Table */}
                        <div className="card rounded-2xl border-slate-800 bg-slate-900/80 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs font-mono">
                                    <thead className="bg-slate-950/90 text-slate-400 uppercase tracking-wider border-b border-slate-800 text-[11px]">
                                        <tr>
                                            <th className="p-3.5">ID</th>
                                            <th className="p-3.5">Full Name</th>
                                            <th className="p-3.5">Contact Email</th>
                                            <th className="p-3.5">Account Plan</th>
                                            <th className="p-3.5">Verification</th>
                                            <th className="p-3.5">Valuations</th>
                                            <th className="p-3.5">Portfolio Count</th>
                                            <th className="p-3.5">Signed Up Date</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/60 text-slate-300">
                                        {paginatedUsers.length === 0 ? (
                                            <tr>
                                                <td colSpan={8} className="p-10 text-center text-slate-500 space-y-2">
                                                    <div className="text-2xl">🔍</div>
                                                    <div>No registered users match the current search or filters.</div>
                                                    <button
                                                        onClick={() => {
                                                            setUserQuery('');
                                                            setUserPlanFilter('all');
                                                            setUserProviderFilter('all');
                                                            setUserVerificationFilter('all');
                                                            setUserPage(1);
                                                        }}
                                                        className="btn-secondary px-3 py-1 text-xs mt-2"
                                                    >
                                                        Clear All Filters
                                                    </button>
                                                </td>
                                            </tr>
                                        ) : (
                                            paginatedUsers.map((u) => {
                                                const emailLower = u.email.toLowerCase();
                                                const initials = u.name
                                                    ? u.name
                                                          .split(' ')
                                                          .map((n) => n[0])
                                                          .join('')
                                                          .slice(0, 2)
                                                          .toUpperCase()
                                                    : u.email.slice(0, 2).toUpperCase();

                                                return (
                                                    <tr key={u.id} className="hover:bg-slate-800/40 transition-colors">
                                                        <td className="p-3.5 font-bold text-slate-400">#{u.id}</td>
                                                        <td className="p-3.5">
                                                            <div className="flex items-center gap-2.5">
                                                                <div className="h-7 w-7 rounded-full bg-gradient-to-br from-brand-600/30 to-indigo-600/30 border border-brand-500/40 flex items-center justify-center text-[10px] text-brand-300 font-bold uppercase shrink-0 shadow-sm">
                                                                    {initials}
                                                                </div>
                                                                <div className="font-bold text-white text-[12px] whitespace-nowrap">
                                                                    {u.name || 'Member'}
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="p-3.5">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className="text-slate-200 font-medium">{u.email}</span>
                                                                {emailLower.endsWith('@gmail.com') && (
                                                                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-red-950/60 text-red-300 border border-red-800/60">
                                                                        Gmail
                                                                    </span>
                                                                )}
                                                                {emailLower.endsWith('@yahoo.com') && (
                                                                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-purple-950/60 text-purple-300 border border-purple-800/60">
                                                                        Yahoo
                                                                    </span>
                                                                )}
                                                                {emailLower.endsWith('@aol.com') && (
                                                                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-950/60 text-amber-300 border border-amber-800/60">
                                                                        AOL
                                                                    </span>
                                                                )}
                                                                {(emailLower.endsWith('@outlook.com') || emailLower.endsWith('@hotmail.com')) && (
                                                                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-blue-950/60 text-blue-300 border border-blue-800/60">
                                                                        Outlook
                                                                    </span>
                                                                )}
                                                                {emailLower.endsWith('@icloud.com') && (
                                                                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-800/60">
                                                                        iCloud
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="p-3.5">
                                                            <select
                                                                value={u.plan}
                                                                onChange={(e) =>
                                                                    handleUpdateUserPlan(
                                                                        u.id,
                                                                        e.target.value as 'free' | 'pro' | 'enterprise'
                                                                    )
                                                                }
                                                                className={`text-[10px] font-mono font-bold uppercase px-2 py-1 rounded bg-slate-950 border ${
                                                                    u.plan === 'enterprise'
                                                                        ? 'text-purple-300 border-purple-800'
                                                                        : u.plan === 'pro'
                                                                        ? 'text-brand-300 border-brand-800'
                                                                        : 'text-slate-400 border-slate-800'
                                                                }`}
                                                            >
                                                                <option value="free">Free</option>
                                                                <option value="pro">Pro</option>
                                                                <option value="enterprise">Enterprise</option>
                                                            </select>
                                                        </td>
                                                        <td className="p-3.5">
                                                            {u.email_verified_at ? (
                                                                <span className="inline-flex items-center gap-1 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-900/60">
                                                                    <span>✓</span>
                                                                    <span>Verified</span>
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1 text-amber-400 text-[10px] font-bold px-2 py-0.5 rounded bg-amber-950/60 border border-amber-900/60">
                                                                    <span>○</span>
                                                                    <span>Pending</span>
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="p-3.5 text-slate-400 font-mono">
                                                            <span className="text-white font-bold">{u.valuationsCount || 0}</span> analyses
                                                        </td>
                                                        <td className="p-3.5 text-slate-400 font-mono">
                                                            <span className="text-white font-bold">{u.watchlistCount || 0}</span> domains
                                                        </td>
                                                        <td className="p-3.5 text-slate-400 text-[11px] whitespace-nowrap">
                                                            {new Date(u.created_at).toLocaleDateString(undefined, {
                                                                year: 'numeric',
                                                                month: 'short',
                                                                day: 'numeric',
                                                            })}
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination Footer */}
                            {filteredUsers.length > 0 && usersPerPage > 0 && (
                                <div className="p-4 bg-slate-950/60 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono">
                                    <div className="text-slate-400">
                                        Showing <span className="text-white font-bold">{(currentUserPage - 1) * effectivePageSize + 1}</span> to{' '}
                                        <span className="text-white font-bold">
                                            {Math.min(currentUserPage * effectivePageSize, filteredUsers.length)}
                                        </span>{' '}
                                        of <span className="text-white font-bold">{filteredUsers.length}</span> members
                                        {filteredUsers.length !== users.length && ` (filtered from ${users.length} total)`}
                                    </div>

                                    <div className="flex items-center gap-1.5">
                                        <button
                                            onClick={() => setUserPage(1)}
                                            disabled={currentUserPage <= 1}
                                            className="px-2.5 py-1 rounded bg-slate-900 text-slate-400 hover:text-white border border-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            « First
                                        </button>
                                        <button
                                            onClick={() => setUserPage((p) => Math.max(1, p - 1))}
                                            disabled={currentUserPage <= 1}
                                            className="px-3 py-1 rounded bg-slate-900 text-slate-400 hover:text-white border border-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            ‹ Prev
                                        </button>
                                        <span className="px-3 py-1 rounded bg-brand-950 text-brand-300 border border-brand-800 font-bold">
                                            Page {currentUserPage} of {totalUserPages}
                                        </span>
                                        <button
                                            onClick={() => setUserPage((p) => Math.min(totalUserPages, p + 1))}
                                            disabled={currentUserPage >= totalUserPages}
                                            className="px-3 py-1 rounded bg-slate-900 text-slate-400 hover:text-white border border-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            Next ›
                                        </button>
                                        <button
                                            onClick={() => setUserPage(totalUserPages)}
                                            disabled={currentUserPage >= totalUserPages}
                                            className="px-2.5 py-1 rounded bg-slate-900 text-slate-400 hover:text-white border border-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            Last »
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                );
            })()}

            {/* ========================================================================= */}
            {/* TAB 5: LIVE LINK PUSH TO GET & WEBHOOKS HUB */}
            {/* ========================================================================= */}
            {activeTab === 'feed' && (
                <div className="space-y-6">
                    <div>
                        <h2 className="text-lg font-black text-white tracking-tight">
                            Live Link Push to GET Hub &amp; Webhooks
                        </h2>
                        <p className="text-xs text-slate-400 font-mono">
                            Seamless real-time synchronization between DomainIQ and external automation systems, CRMs, or analytics engines.
                        </p>
                    </div>

                    {/* Method 1: Push to GET Feed */}
                    <div className="card p-6 rounded-2xl border-brand-500/40 bg-slate-900/80 space-y-4">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold uppercase tracking-wider px-2.5 py-0.5 rounded bg-brand-950 text-brand-300 border border-brand-800">
                                Option A: Pull via GET
                            </span>
                            <span className="text-xs text-slate-400 font-mono">Real-time HTTP GET API</span>
                        </div>

                        <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
                            Any external script, scraper, or bot can perform a standard HTTP GET request against this URL. It outputs full JSON telemetry of all recent signups, live 4 ad box states, and active ad buyers.
                        </p>

                        <div className="space-y-2">
                            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-brand-300 flex items-center justify-between gap-3 overflow-x-auto">
                                <code>GET /api/admin/feed?key=domainiq-admin-2026</code>
                                <div className="flex items-center gap-2 shrink-0">
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(`${window.location.origin}/api/admin/feed?key=domainiq-admin-2026`);
                                            showToast('Copied JSON GET URL to clipboard!');
                                        }}
                                        className="btn-secondary px-3 py-1 text-[11px]"
                                    >
                                        Copy URL
                                    </button>
                                    <a
                                        href="/api/admin/feed?key=domainiq-admin-2026"
                                        target="_blank"
                                        className="btn-primary px-3 py-1 text-[11px]"
                                    >
                                        Open JSON ↗
                                    </a>
                                </div>
                            </div>

                            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-cyan-300 flex items-center justify-between gap-3 overflow-x-auto">
                                <code>GET /api/admin/feed?key=domainiq-admin-2026&amp;format=csv</code>
                                <div className="flex items-center gap-2 shrink-0">
                                    <a
                                        href="/api/admin/feed?key=domainiq-admin-2026&format=csv"
                                        download="domainiq_signups.csv"
                                        className="px-3 py-1 rounded bg-cyan-950 hover:bg-cyan-900 text-cyan-200 border border-cyan-800 text-[11px] transition-colors"
                                    >
                                        Export CSV ↓
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Method 2: Active Webhook Push Trigger */}
                    <div className="card p-6 rounded-2xl border-indigo-500/40 bg-slate-900/80 space-y-4">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold uppercase tracking-wider px-2.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                                Option B: Push Outbound Webhook
                            </span>
                            <span className="text-xs text-slate-400 font-mono">Dispatches POST payload with live data</span>
                        </div>

                        <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
                            Enter a destination webhook URL (e.g., Zapier, Make, custom Slack bot, or CRM webhook). Click &quot;Dispatch Push&quot; to send the latest signups and ad buyer states immediately.
                        </p>

                        <div className="flex flex-col sm:flex-row gap-2">
                            <input
                                type="url"
                                placeholder="https://hooks.zapier.com/hooks/catch/..."
                                value={customWebhookUrl}
                                onChange={(e) => setCustomWebhookUrl(e.target.value)}
                                className="input flex-1 text-xs font-mono bg-slate-950 border-slate-800"
                            />
                            <button
                                onClick={handleTriggerWebhookPush}
                                disabled={pushingWebhook}
                                className="btn-primary px-5 py-2 text-xs font-mono font-bold uppercase tracking-wider shrink-0"
                            >
                                {pushingWebhook ? 'Dispatching...' : '🚀 Dispatch Push Now'}
                            </button>
                        </div>

                        {pushResult && (
                            <div
                                className={`p-3.5 rounded-xl border text-xs font-mono ${
                                    pushResult.success
                                        ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                                        : 'bg-rose-950/60 border-rose-800 text-rose-300'
                                }`}
                            >
                                <div className="font-bold">
                                    Result: {pushResult.success ? 'HTTP 200 Delivered' : 'Delivery Issue'}
                                </div>
                                <div className="text-[11px] mt-1">{pushResult.message}</div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
