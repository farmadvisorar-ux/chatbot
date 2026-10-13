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
        notes: string;
    }>({
        slot_id: 1,
        advertiser_name: '',
        company: '',
        email: '',
        amount_usd: 499,
        status: 'active',
        destination_url: '',
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
                        <form onSubmit={handleLogin} className="space-y-5">
                            <div className="space-y-2">
                                <label className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300 block">
                                    Terminal Passcode
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
                                ⚡ Fill Default Passcode (<span className="text-slate-300">domainiq-admin-2026</span>)
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

    const filteredUsers = users.filter((u) =>
        u.email.toLowerCase().includes(userQuery.toLowerCase())
    );

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
                                {stats?.proUsers ?? 0} Pro • {stats?.verifiedUsers ?? 0} Verified
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
                                                    <div className="font-bold text-white">{p.advertiser_name}</div>
                                                    <div className="text-[11px] text-slate-400">{p.company}</div>
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
                                                <td className="p-3.5 text-right">
                                                    <button
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
                                        <label className="text-brand-300 font-bold">Live Target Link (Destination URL)</label>
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
            {/* TAB 4: USER SIGNUPS DIRECTORY */}
            {/* ========================================================================= */}
            {activeTab === 'users' && (
                <div className="space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <h2 className="text-lg font-black text-white tracking-tight">
                                User Signups Directory
                            </h2>
                            <p className="text-xs text-slate-400 font-mono">
                                Total registered members: {users.length}. Inspect verification, plans, and valuations.
                            </p>
                        </div>

                        <div className="w-full sm:w-72">
                            <input
                                type="text"
                                placeholder="Search by email..."
                                value={userQuery}
                                onChange={(e) => setUserQuery(e.target.value)}
                                className="input w-full text-xs font-mono bg-slate-950 border-slate-800"
                            />
                        </div>
                    </div>

                    <div className="card rounded-2xl border-slate-800 bg-slate-900/80 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs font-mono">
                                <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider border-b border-slate-800 text-[11px]">
                                    <tr>
                                        <th className="p-3.5">ID</th>
                                        <th className="p-3.5">Email Address</th>
                                        <th className="p-3.5">Account Plan</th>
                                        <th className="p-3.5">Verification</th>
                                        <th className="p-3.5">Valuations</th>
                                        <th className="p-3.5">Portfolio Count</th>
                                        <th className="p-3.5">Signed Up Date</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                                    {filteredUsers.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="p-8 text-center text-slate-500">
                                                No users found matching &quot;{userQuery}&quot;
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredUsers.map((u) => (
                                            <tr key={u.id} className="hover:bg-slate-800/40 transition-colors">
                                                <td className="p-3.5 font-bold text-slate-400">#{u.id}</td>
                                                <td className="p-3.5 font-medium text-white">{u.email}</td>
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
                                                        <span className="text-emerald-400 text-[10px]">✓ Verified</span>
                                                    ) : (
                                                        <span className="text-amber-400 text-[10px]">○ Pending</span>
                                                    )}
                                                </td>
                                                <td className="p-3.5 text-slate-400">
                                                    {u.valuationsCount || 0} analyses
                                                </td>
                                                <td className="p-3.5 text-slate-400">
                                                    {u.watchlistCount || 0} domains
                                                </td>
                                                <td className="p-3.5 text-slate-400 text-[11px]">
                                                    {new Date(u.created_at).toLocaleDateString()}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

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
