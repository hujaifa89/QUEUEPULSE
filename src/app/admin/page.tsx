'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';
import { Button, TextField, Banner, LanguageSwitcher } from '@/components/ui';
import type { Locale } from '@/i18n';

interface OverviewCounts {
  organizations: number;
  active_queues: number;
  tokens_today: number;
}

interface Organization {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

interface StaffMember {
  id: string;
  full_name: string;
  role: string;
  org_id: string | null;
  is_active: boolean;
  created_at: string;
  organizations?: {
    id: string;
    name: string;
  } | null;
}

export default function AdminPage() {
  const router = useRouter();
  const [counts, setCounts] = useState<OverviewCounts>({ organizations: 0, active_queues: 0, tokens_today: 0 });
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorBanner, setErrorBanner] = useState('');

  // Organization Form State
  const [newOrgName, setNewOrgName] = useState('');
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);
  const [orgError, setOrgError] = useState('');

  // Staff Form State
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffOrgId, setNewStaffOrgId] = useState('');
  const [isCreatingStaff, setIsCreatingStaff] = useState(false);
  const [staffError, setStaffError] = useState('');

  // Temporary Password Modal State (DEC-14)
  const [locale, setLocale] = useState<Locale>('bn');
  const [tempPasswordInfo, setTempPasswordInfo] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('queuepulse_locale');
      if (saved === 'en' || saved === 'bn') {
        setLocale(saved);
      }
    } catch {
      // Ignore
    }

    const handleLocaleChange = (e: Event) => {
      const customEvent = e as CustomEvent<Locale>;
      if (customEvent.detail === 'en' || customEvent.detail === 'bn') {
        setLocale(customEvent.detail);
      }
    };

    window.addEventListener('queuepulse:locale_change', handleLocaleChange);
    return () => {
      window.removeEventListener('queuepulse:locale_change', handleLocaleChange);
    };
  }, []);

  // Load Admin Data
  const loadData = async () => {
    try {
      setErrorBanner('');
      const [overviewRes, orgsRes, staffRes] = await Promise.all([
        fetch('/api/admin/overview'),
        fetch('/api/admin/organizations'),
        fetch('/api/admin/staff'),
      ]);

      if (overviewRes.status === 401 || orgsRes.status === 401) {
        router.push('/login');
        return;
      }

      if (overviewRes.status === 403 || orgsRes.status === 403) {
        router.push('/403');
        return;
      }

      const overviewData = await overviewRes.json();
      const orgsData = await orgsRes.json();
      const staffData = await staffRes.json();

      setCounts(overviewData);
      setOrganizations(orgsData.organizations || []);
      setStaff(staffData.staff || []);

      if (orgsData.organizations?.length > 0 && !newStaffOrgId) {
        const activeOrg = orgsData.organizations.find((o: Organization) => o.is_active);
        if (activeOrg) setNewStaffOrgId(activeOrg.id);
      }
    } catch {
      setErrorBanner('Failed to load admin dashboard data. Please refresh.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrgError('');
    setIsCreatingOrg(true);

    try {
      const res = await fetch('/api/admin/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newOrgName.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setOrgError(data.error?.message || 'Failed to create organization');
        setIsCreatingOrg(false);
        return;
      }

      setNewOrgName('');
      await loadData();
    } catch {
      setOrgError('Network error while creating organization');
    } finally {
      setIsCreatingOrg(false);
    }
  };

  const handleToggleOrg = async (org: Organization) => {
    const confirmMessage = org.is_active
      ? `Are you sure you want to deactivate "${org.name}"? Staff of this organization will be blocked immediately.`
      : `Reactivate organization "${org.name}"?`;

    if (!window.confirm(confirmMessage)) return;

    try {
      const res = await fetch(`/api/admin/organizations/${org.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !org.is_active }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error?.message || 'Update failed');
        return;
      }

      await loadData();
    } catch {
      alert('Network error while updating organization');
    }
  };

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setStaffError('');
    setIsCreatingStaff(true);

    try {
      const res = await fetch('/api/admin/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newStaffEmail.trim(),
          full_name: newStaffName.trim(),
          organization_id: newStaffOrgId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setStaffError(data.error?.message || 'Failed to create staff account');
        setIsCreatingStaff(false);
        return;
      }

      // Display temporary password ONCE (DEC-14)
      setTempPasswordInfo({
        email: data.staff.email,
        password: data.temporary_password,
      });

      setNewStaffEmail('');
      setNewStaffName('');
      await loadData();
    } catch {
      setStaffError('Network error while creating staff account');
    } finally {
      setIsCreatingStaff(false);
    }
  };

  const handleToggleStaff = async (member: StaffMember) => {
    const confirmMessage = member.is_active
      ? `Deactivate staff account for "${member.full_name}"? They will lose system access immediately.`
      : `Reactivate staff account for "${member.full_name}"?`;

    if (!window.confirm(confirmMessage)) return;

    try {
      const res = await fetch(`/api/admin/staff/${member.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !member.is_active }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error?.message || 'Update failed');
        return;
      }

      await loadData();
    } catch {
      alert('Network error while updating staff account');
    }
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const copyPassword = () => {
    if (tempPasswordInfo) {
      navigator.clipboard.writeText(tempPasswordInfo.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (isLoading) {
    return (
      <main className="min-h-screen p-8 bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-600 font-medium">
          <span className="w-4 h-4 border-2 border-teal-700 border-t-transparent rounded-full animate-spin" />
          Loading Platform Administration...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-12 space-y-8">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
              Queue<span className="text-[#0F766E]">Pulse</span> Platform Admin
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-100 text-teal-800">
              Admin
            </span>
          </div>
          <p className="text-sm text-slate-600 mt-1">
            Global management of organizations, staff accounts, and daily queue metrics.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <LanguageSwitcher currentLocale={locale} onLocaleChange={setLocale} />
          <Button variant="outline" onClick={handleLogout}>
            {locale === 'bn' ? 'লগআউট' : 'Sign Out'}
          </Button>
        </div>
      </div>

      {errorBanner && (
        <Banner variant="danger" title="System Notice">
          {errorBanner}
        </Banner>
      )}

      {/* Temporary Password Modal / Alert (Shown ONCE - DEC-14) */}
      {tempPasswordInfo && (
        <div className="p-6 bg-teal-50 border-2 border-teal-600 rounded-xl space-y-4 shadow-sm" role="dialog" aria-labelledby="temp-pwd-title">
          <div className="flex items-start justify-between">
            <div>
              <h2 id="temp-pwd-title" className="text-lg font-bold text-teal-950">
                Staff Account Created Successfully
              </h2>
              <p className="text-sm text-teal-800">
                Temporary credentials for <span className="font-semibold">{tempPasswordInfo.email}</span>.
              </p>
            </div>
            <button
              onClick={() => setTempPasswordInfo(null)}
              className="text-teal-700 hover:text-teal-900 text-sm font-semibold p-1"
              aria-label="Dismiss credential notice"
            >
              ✕ Dismiss
            </button>
          </div>

          <div className="p-4 bg-white rounded-lg border border-teal-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs text-slate-500 font-medium">Temporary Password</div>
              <div className="font-mono text-base font-bold text-slate-900 select-all">
                {tempPasswordInfo.password}
              </div>
            </div>
            <Button variant="primary" onClick={copyPassword} className="self-start sm:self-center">
              {copied ? '✓ Copied!' : 'Copy Password'}
            </Button>
          </div>

          <div className="text-xs text-teal-900 font-medium bg-teal-100/60 p-2.5 rounded border border-teal-300">
            <strong>Security Notice (DEC-14):</strong> This temporary password is shown ONCE only and cannot be retrieved later. Share it securely with the staff member. They will reset it upon initial login.
          </div>
        </div>
      )}

      {/* Overview Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Organizations</div>
          <div className="text-3xl font-extrabold text-slate-900 mt-2">{counts.organizations}</div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Queues</div>
          <div className="text-3xl font-extrabold text-slate-900 mt-2">{counts.active_queues}</div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tokens Issued Today</div>
          <div className="text-3xl font-extrabold text-[#0F766E] mt-2">{counts.tokens_today}</div>
        </div>
      </div>

      {/* Two-Column Section: Organizations & Staff */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Organizations Section */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Create New Organization</h2>
            {orgError && <Banner variant="danger">{orgError}</Banner>}
            <form onSubmit={handleCreateOrg} className="space-y-3">
              <TextField
                label="Organization Name"
                required
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                placeholder="e.g. Dhaka Central Clinic"
                helperText="2 to 80 characters"
                disabled={isCreatingOrg}
              />
              <Button type="submit" variant="primary" isLoading={isCreatingOrg}>
                Create Organization
              </Button>
            </form>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Organizations ({organizations.length})</h2>
            <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
              {organizations.length === 0 ? (
                <p className="text-sm text-slate-500 py-4">No organizations registered yet.</p>
              ) : (
                organizations.map((org) => (
                  <div key={org.id} className="py-3 flex items-center justify-between gap-4">
                    <div>
                      <div className="font-semibold text-slate-900 text-sm">{org.name}</div>
                      <div className="text-xs text-slate-500">
                        Status:{' '}
                        <span className={`font-semibold ${org.is_active ? 'text-green-700' : 'text-red-600'}`}>
                          {org.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant={org.is_active ? 'danger' : 'outline'}
                      onClick={() => handleToggleOrg(org)}
                      className="text-xs py-1 px-3 min-h-[38px]"
                    >
                      {org.is_active ? 'Deactivate' : 'Activate'}
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Staff Management Section */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Create Staff Account</h2>
            {staffError && <Banner variant="danger">{staffError}</Banner>}
            <form onSubmit={handleCreateStaff} className="space-y-3">
              <TextField
                label="Staff Full Name"
                required
                value={newStaffName}
                onChange={(e) => setNewStaffName(e.target.value)}
                placeholder="e.g. Nasrin Akter"
                disabled={isCreatingStaff}
              />

              <TextField
                label="Staff Email"
                type="email"
                required
                value={newStaffEmail}
                onChange={(e) => setNewStaffEmail(e.target.value)}
                placeholder="staff@organization.com"
                disabled={isCreatingStaff}
              />

              <div className="flex flex-col space-y-1.5 text-left">
                <label htmlFor="staff-org-select" className="text-sm font-semibold text-slate-800">
                  Assigned Organization
                </label>
                <select
                  id="staff-org-select"
                  required
                  value={newStaffOrgId}
                  onChange={(e) => setNewStaffOrgId(e.target.value)}
                  disabled={isCreatingStaff || organizations.length === 0}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm min-h-[44px] bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F766E]"
                >
                  {organizations.filter((o) => o.is_active).length === 0 ? (
                    <option value="">No active organizations available</option>
                  ) : (
                    organizations
                      .filter((o) => o.is_active)
                      .map((org) => (
                        <option key={org.id} value={org.id}>
                          {org.name}
                        </option>
                      ))
                  )}
                </select>
              </div>

              <Button
                type="submit"
                variant="primary"
                isLoading={isCreatingStaff}
                disabled={!newStaffOrgId}
              >
                Create Staff Account
              </Button>
            </form>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Staff Accounts ({staff.length})</h2>
            <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
              {staff.length === 0 ? (
                <p className="text-sm text-slate-500 py-4">No staff accounts registered yet.</p>
              ) : (
                staff.map((member) => (
                  <div key={member.id} className="py-3 flex items-center justify-between gap-4">
                    <div>
                      <div className="font-semibold text-slate-900 text-sm">{member.full_name}</div>
                      <div className="text-xs text-slate-500">
                        {member.organizations?.name || 'No Org'} &middot;{' '}
                        <span className={`font-semibold ${member.is_active ? 'text-green-700' : 'text-red-600'}`}>
                          {member.is_active ? 'Active' : 'Deactivated'}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant={member.is_active ? 'danger' : 'outline'}
                      onClick={() => handleToggleStaff(member)}
                      className="text-xs py-1 px-3 min-h-[38px]"
                    >
                      {member.is_active ? 'Deactivate' : 'Activate'}
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
