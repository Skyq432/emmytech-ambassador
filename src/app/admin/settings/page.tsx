'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  User,
  Shield,
  Bell,
  Settings,
  AlertTriangle,
  Save,
  Mail,
  Loader2,
  CheckCircle2,
  Crown,
  Lock,
  Users,
  FileCheck,
  Trophy,
  CreditCard,
  UserPlus,
  Megaphone,
  ArrowRight,
  KeyRound,
  Sparkles,
  Eye,
  Hash,
  Activity,
  Zap,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type ProgramSettings = {
  leaderboard_enabled: boolean;
  invite_only_registration: boolean;
  manual_activity_approval: boolean;
  default_post_points: number;
};

type NotificationSettings = {
  new_activity_submissions: boolean;
  new_ambassadors: boolean;
  new_leads: boolean;
  payout_updates: boolean;
};

type Toast = {
  id: number;
  message: string;
  type: 'success' | 'error';
};

export default function AdminSettingsPage() {
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'notifications' | 'program' | 'danger'>('profile');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [userId, setUserId] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');

  const [programSettings, setProgramSettings] = useState<ProgramSettings>({
    leaderboard_enabled: true,
    invite_only_registration: true,
    manual_activity_approval: true,
    default_post_points: 10,
  });

  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>({
    new_activity_submissions: true,
    new_ambassadors: true,
    new_leads: true,
    payout_updates: true,
  });

  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    loadSettings();
  }, []);

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }

  async function loadSettings() {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    setUserId(user.id);
    setEmail(user.email || '');

    const { data: profile } = await supabase
      .from('users')
      .select('name, email')
      .eq('id', user.id)
      .single();

    setName(profile?.name || '');
    setEmail(profile?.email || user.email || '');

    const { data: settings } = await supabase
      .from('app_settings')
      .select('key, value');

    const program = settings?.find((s) => s.key === 'program_settings');
    const notifications = settings?.find((s) => s.key === 'notification_settings');

    if (program?.value) {
      setProgramSettings(program.value as ProgramSettings);
    }

    if (notifications?.value) {
      setNotificationSettings(notifications.value as NotificationSettings);
    }

    setLoading(false);
  }

  async function saveProfile() {
    setSaving(true);

    const { error } = await supabase
      .from('users')
      .update({ name })
      .eq('id', userId);

    setSaving(false);

    if (error) {
      showToast(error.message, 'error');
      return;
    }

    showToast('Profile updated successfully');
  }

  async function sendPasswordReset() {
    if (!email) return;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/login`,
    });

    if (error) {
      showToast(error.message, 'error');
      return;
    }

    showToast('Password reset email sent');
  }

  async function saveProgramSettings() {
    setSaving(true);

    const { error } = await supabase
      .from('app_settings')
      .upsert({
        key: 'program_settings',
        value: programSettings,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      });

    setSaving(false);

    if (error) {
      showToast(error.message, 'error');
      return;
    }

    showToast('Program settings saved');
  }

  async function saveNotificationSettings() {
    setSaving(true);

    const { error } = await supabase
      .from('app_settings')
      .upsert({
        key: 'notification_settings',
        value: notificationSettings,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      });

    setSaving(false);

    if (error) {
      showToast(error.message, 'error');
      return;
    }

    showToast('Notification settings saved');
  }

  function toggleProgram(key: keyof ProgramSettings) {
    setProgramSettings((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }

  function toggleNotification(key: keyof NotificationSettings) {
    setNotificationSettings((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-sm font-medium text-slate-500">Loading settings...</p>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'profile' as const, label: 'Profile', icon: User, description: 'Personal information' },
    { id: 'security' as const, label: 'Security', icon: Shield, description: 'Password & access' },
    { id: 'notifications' as const, label: 'Notifications', icon: Bell, description: 'Alert preferences' },
    { id: 'program' as const, label: 'Program', icon: Settings, description: 'Ambassador rules' },
    { id: 'danger' as const, label: 'Danger Zone', icon: AlertTriangle, description: 'Destructive actions' },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Toast Notifications */}
      <div className="fixed top-6 right-6 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              'flex items-center gap-2 rounded-xl px-4 py-3 shadow-lg border text-sm font-medium animate-in slide-in-from-right-2 fade-in duration-300',
              toast.type === 'success'
                ? 'bg-white border-blue-200 text-slate-800'
                : 'bg-white border-red-200 text-red-800'
            )}
          >
            <CheckCircle2 className={cn('h-4 w-4', toast.type === 'success' ? 'text-blue-500' : 'text-red-500')} />
            {toast.message}
          </div>
        ))}
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-blue-600">
              <Sparkles className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">Administration</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Settings</h1>
            <p className="text-slate-500 max-w-lg">
              Manage your admin account, security preferences, notification alerts, and ambassador program rules.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 border border-blue-100">
            <Crown className="h-4 w-4 text-blue-600" />
            <span className="text-sm font-semibold text-blue-700">Administrator</span>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[300px_1fr]">
          {/* Sidebar Navigation */}
          <div className="space-y-6">
            <nav className="space-y-1 bg-white rounded-2xl border border-slate-200 p-2 shadow-sm">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'group flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-sm font-medium transition-all duration-200',
                    activeTab === tab.id
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                      : 'text-slate-600 hover:bg-blue-50 hover:text-blue-700'
                  )}
                >
                  <div className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
                    activeTab === tab.id ? 'bg-white/20' : 'bg-slate-100 group-hover:bg-blue-100'
                  )}>
                    <tab.icon className={cn(
                      'h-4 w-4 transition-colors',
                      activeTab === tab.id ? 'text-white' : 'text-slate-500 group-hover:text-blue-600'
                    )} />
                  </div>
                  <div className="flex flex-col items-start">
                    <span className="font-semibold">{tab.label}</span>
                    <span className={cn(
                      'text-xs',
                      activeTab === tab.id ? 'text-blue-100' : 'text-slate-400'
                    )}>
                      {tab.description}
                    </span>
                  </div>
                  <ChevronRight className={cn(
                    'ml-auto h-4 w-4 transition-all',
                    activeTab === tab.id ? 'opacity-100 translate-x-0 text-blue-200' : 'opacity-0 -translate-x-2'
                  )} />
                </button>
              ))}
            </nav>

            {/* Quick Stats Card */}
            <Card className="border border-slate-200 shadow-sm bg-white rounded-2xl overflow-hidden">
              <CardContent className="p-5 space-y-4">
                <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Quick Overview</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Eye className="h-4 w-4 text-blue-500" />
                      <span>Leaderboard</span>
                    </div>
                    <span className={cn(
                      'text-xs font-bold px-2 py-0.5 rounded-full',
                      programSettings.leaderboard_enabled ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                    )}>
                      {programSettings.leaderboard_enabled ? 'ON' : 'OFF'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Lock className="h-4 w-4 text-blue-500" />
                      <span>Invite Only</span>
                    </div>
                    <span className={cn(
                      'text-xs font-bold px-2 py-0.5 rounded-full',
                      programSettings.invite_only_registration ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                    )}>
                      {programSettings.invite_only_registration ? 'ON' : 'OFF'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <FileCheck className="h-4 w-4 text-blue-500" />
                      <span>Manual Approval</span>
                    </div>
                    <span className={cn(
                      'text-xs font-bold px-2 py-0.5 rounded-full',
                      programSettings.manual_activity_approval ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                    )}>
                      {programSettings.manual_activity_approval ? 'ON' : 'OFF'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Hash className="h-4 w-4 text-blue-500" />
                      <span>Default Points</span>
                    </div>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                      {programSettings.default_post_points}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Content Area */}
          <div className="space-y-6">
            {/* Profile Tab */}
            {activeTab === 'profile' && (
              <div className="space-y-6">
                <Card className="border border-slate-200 shadow-sm bg-white rounded-2xl overflow-hidden">
                  <CardHeader className="border-b border-slate-100 bg-white px-8 py-6">
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 shadow-lg shadow-blue-600/20">
                        <User className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <CardTitle className="text-xl font-bold text-slate-900">Profile Settings</CardTitle>
                        <p className="text-sm text-slate-500 mt-0.5">Manage your personal information and account details</p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-8 space-y-8">
                    <div className="grid gap-6 sm:grid-cols-2">
                      <div className="space-y-2.5">
                        <label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-blue-500" />
                          Full Name
                        </label>
                        <Input
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Enter your full name"
                          className="h-12 rounded-xl border-slate-200 bg-slate-50/50 focus-visible:ring-blue-500 focus-visible:ring-2 focus-visible:bg-white transition-all"
                        />
                      </div>
                      <div className="space-y-2.5">
                        <label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                          <Mail className="h-3.5 w-3.5 text-blue-500" />
                          Email Address
                        </label>
                        <div className="relative">
                          <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <Input
                            value={email}
                            disabled
                            className="h-12 rounded-xl border-slate-200 bg-slate-100 pl-11 text-slate-500 cursor-not-allowed"
                          />
                        </div>
                        <p className="text-xs text-slate-400 flex items-center gap-1">
                          <Lock className="h-3 w-3" />
                          Email changes must be handled through Supabase authentication.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-2xl bg-blue-50/60 p-6 border border-blue-100">
                      <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100">
                          <Crown className="h-6 w-6 text-blue-600" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-800">Administrator Account</p>
                          <p className="text-xs text-slate-500 mt-0.5">Full system access and management privileges</p>
                        </div>
                      </div>
                      <span className="rounded-full bg-blue-600 px-4 py-1.5 text-xs font-bold text-white shadow-sm shadow-blue-600/20">
                        ADMIN
                      </span>
                    </div>

                    <div className="flex justify-end pt-2">
                      <Button
                        onClick={saveProfile}
                        disabled={saving}
                        className="h-12 gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 px-8 text-sm font-semibold shadow-lg shadow-blue-600/20 transition-all hover:shadow-blue-600/30"
                      >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {saving ? 'Saving...' : 'Save Changes'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Security Tab */}
            {activeTab === 'security' && (
              <div className="space-y-6">
                <Card className="border border-slate-200 shadow-sm bg-white rounded-2xl overflow-hidden">
                  <CardHeader className="border-b border-slate-100 bg-white px-8 py-6">
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 shadow-lg shadow-blue-600/20">
                        <Shield className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <CardTitle className="text-xl font-bold text-slate-900">Password & Security</CardTitle>
                        <p className="text-sm text-slate-500 mt-0.5">Manage your account security and access controls</p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-8 space-y-6">
                    <div className="rounded-2xl border border-slate-200 bg-white p-6 hover:border-blue-200 transition-colors">
                      <div className="flex items-start gap-5">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50">
                          <KeyRound className="h-6 w-6 text-blue-600" />
                        </div>
                        <div className="flex-1 space-y-2">
                          <h3 className="font-bold text-slate-900 text-lg">Password Reset</h3>
                          <p className="text-sm text-slate-500 leading-relaxed">
                            We'll send a secure password reset link to <span className="font-semibold text-slate-700">{email}</span>. 
                            The link expires in 24 hours for your security.
                          </p>
                        </div>
                      </div>
                      <div className="mt-6 flex justify-end">
                        <Button
                          onClick={sendPasswordReset}
                          variant="outline"
                          className="h-11 gap-2 rounded-xl border-blue-200 text-blue-700 hover:bg-blue-50 hover:text-blue-800 font-semibold px-6"
                        >
                          <Mail className="h-4 w-4" />
                          Send Reset Email
                        </Button>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-6">
                      <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100">
                          <CheckCircle2 className="h-6 w-6 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-bold text-slate-800">Authentication Provider</p>
                          <p className="text-sm text-slate-500 mt-0.5">Your account is secured by Supabase Auth with enterprise-grade encryption</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Notifications Tab */}
            {activeTab === 'notifications' && (
              <div className="space-y-6">
                <Card className="border border-slate-200 shadow-sm bg-white rounded-2xl overflow-hidden">
                  <CardHeader className="border-b border-slate-100 bg-white px-8 py-6">
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 shadow-lg shadow-blue-600/20">
                        <Bell className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <CardTitle className="text-xl font-bold text-slate-900">Notification Preferences</CardTitle>
                        <p className="text-sm text-slate-500 mt-0.5">Choose what you want to be notified about via email</p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="divide-y divide-slate-100 p-0">
                    <NotificationItem
                      icon={FileCheck}
                      iconColor="text-blue-600"
                      iconBg="bg-blue-50"
                      title="New Activity Submissions"
                      description="Receive alerts when ambassadors submit new posts for review"
                      enabled={notificationSettings.new_activity_submissions}
                      onToggle={() => toggleNotification('new_activity_submissions')}
                    />
                    <NotificationItem
                      icon={UserPlus}
                      iconColor="text-emerald-600"
                      iconBg="bg-emerald-50"
                      title="New Ambassadors"
                      description="Get notified when a new ambassador joins the program"
                      enabled={notificationSettings.new_ambassadors}
                      onToggle={() => toggleNotification('new_ambassadors')}
                    />
                    <NotificationItem
                      icon={Megaphone}
                      iconColor="text-amber-600"
                      iconBg="bg-amber-50"
                      title="New Leads"
                      description="Alerts for newly created leads and opportunities"
                      enabled={notificationSettings.new_leads}
                      onToggle={() => toggleNotification('new_leads')}
                    />
                    <NotificationItem
                      icon={CreditCard}
                      iconColor="text-rose-600"
                      iconBg="bg-rose-50"
                      title="Payout Updates"
                      description="Notifications about payout status changes and completions"
                      enabled={notificationSettings.payout_updates}
                      onToggle={() => toggleNotification('payout_updates')}
                    />

                    <div className="flex justify-end p-8">
                      <Button
                        onClick={saveNotificationSettings}
                        disabled={saving}
                        className="h-12 gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 px-8 text-sm font-semibold shadow-lg shadow-blue-600/20 transition-all hover:shadow-blue-600/30"
                      >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {saving ? 'Saving...' : 'Save Preferences'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Program Tab */}
            {activeTab === 'program' && (
              <div className="space-y-6">
                <Card className="border border-slate-200 shadow-sm bg-white rounded-2xl overflow-hidden">
                  <CardHeader className="border-b border-slate-100 bg-white px-8 py-6">
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 shadow-lg shadow-blue-600/20">
                        <Settings className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <CardTitle className="text-xl font-bold text-slate-900">Ambassador Program Settings</CardTitle>
                        <p className="text-sm text-slate-500 mt-0.5">Configure program behavior, rules, and point system</p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="divide-y divide-slate-100 p-0">
                    <ProgramToggle
                      icon={Trophy}
                      iconColor="text-amber-600"
                      iconBg="bg-amber-50"
                      title="Leaderboard Enabled"
                      description="Allow ambassadors to view and compete on the public leaderboard"
                      enabled={programSettings.leaderboard_enabled}
                      onToggle={() => toggleProgram('leaderboard_enabled')}
                    />
                    <ProgramToggle
                      icon={Lock}
                      iconColor="text-blue-600"
                      iconBg="bg-blue-50"
                      title="Invite-Only Registration"
                      description="New ambassadors must register using a valid invite code"
                      enabled={programSettings.invite_only_registration}
                      onToggle={() => toggleProgram('invite_only_registration')}
                    />
                    <ProgramToggle
                      icon={Users}
                      iconColor="text-emerald-600"
                      iconBg="bg-emerald-50"
                      title="Manual Activity Approval"
                      description="Admin approval required before points are awarded for posts"
                      enabled={programSettings.manual_activity_approval}
                      onToggle={() => toggleProgram('manual_activity_approval')}
                    />

                    <div className="p-8">
                      <div className="max-w-md space-y-3">
                        <div className="flex items-center gap-2">
                          <Zap className="h-4 w-4 text-blue-600" />
                          <label className="text-sm font-bold text-slate-800">Default Post Points</label>
                        </div>
                        <p className="text-xs text-slate-500">Points automatically awarded per approved post</p>
                        <div className="flex items-center gap-4">
                          <Input
                            type="number"
                            min={0}
                            max={1000}
                            value={programSettings.default_post_points}
                            onChange={(e) =>
                              setProgramSettings((prev) => ({
                                ...prev,
                                default_post_points: Math.max(0, Number(e.target.value)),
                              }))
                            }
                            className="h-14 w-36 rounded-xl border-slate-200 text-center text-2xl font-bold text-slate-800 focus-visible:ring-blue-500 focus-visible:ring-2 bg-slate-50/50 focus-visible:bg-white transition-all"
                          />
                          <div className="space-y-0.5">
                            <span className="text-sm font-semibold text-slate-700">points per post</span>
                            <p className="text-xs text-slate-400">Set to 0 to disable auto-awarding</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end p-8">
                      <Button
                        onClick={saveProgramSettings}
                        disabled={saving}
                        className="h-12 gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 px-8 text-sm font-semibold shadow-lg shadow-blue-600/20 transition-all hover:shadow-blue-600/30"
                      >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {saving ? 'Saving...' : 'Save Program Settings'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Danger Zone Tab */}
            {activeTab === 'danger' && (
              <div className="space-y-6">
                <Card className="border border-red-200 shadow-sm bg-white rounded-2xl overflow-hidden">
                  <CardHeader className="border-b border-red-100 bg-red-50/30 px-8 py-6">
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-600 shadow-lg shadow-red-600/20">
                        <AlertTriangle className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <CardTitle className="text-xl font-bold text-red-800">Danger Zone</CardTitle>
                        <p className="text-sm text-red-600 mt-0.5">Destructive and irreversible actions</p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-8">
                    <div className="rounded-2xl border border-red-200 bg-red-50/30 p-8">
                      <div className="flex items-start gap-5">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-red-100">
                          <Shield className="h-7 w-7 text-red-600" />
                        </div>
                        <div className="space-y-3">
                          <h3 className="font-bold text-red-900 text-lg">Restricted Actions</h3>
                          <p className="text-sm text-red-700 leading-relaxed">
                            Destructive system-wide actions are disabled for safety. Ambassador deletion, 
                            data purging, and account termination are handled from individual ambassador 
                            detail pages to prevent accidental data loss.
                          </p>
                          <div className="flex flex-wrap gap-2 pt-2">
                            <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700 border border-red-200">
                              <Lock className="h-3 w-3 mr-1" />
                              Protected
                            </span>
                            <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700 border border-red-200">
                              <Shield className="h-3 w-3 mr-1" />
                              Admin Only
                            </span>
                            <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700 border border-red-200">
                              <Activity className="h-3 w-3 mr-1" />
                              Audit Logged
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Sub-Components ─── */

function NotificationItem({
  icon: Icon,
  iconColor,
  iconBg,
  title,
  description,
  enabled,
  onToggle,
}: {
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  title: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 p-8 transition-colors hover:bg-slate-50/50">
      <div className="flex items-center gap-5">
        <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', iconBg)}>
          <Icon className={cn('h-5 w-5', iconColor)} />
        </div>
        <div>
          <p className="font-bold text-slate-900">{title}</p>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
      </div>

      <Switch enabled={enabled} onToggle={onToggle} />
    </div>
  );
}

function ProgramToggle({
  icon: Icon,
  iconColor,
  iconBg,
  title,
  description,
  enabled,
  onToggle,
}: {
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  title: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 p-8 transition-colors hover:bg-slate-50/50">
      <div className="flex items-center gap-5">
        <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', iconBg)}>
          <Icon className={cn('h-5 w-5', iconColor)} />
        </div>
        <div>
          <p className="font-bold text-slate-900">{title}</p>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
      </div>

      <Switch enabled={enabled} onToggle={onToggle} />
    </div>
  );
}

function Switch({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'relative h-7 w-12 rounded-full transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
        enabled ? 'bg-blue-600' : 'bg-slate-300'
      )}
      aria-pressed={enabled}
    >
      <span
        className={cn(
          'absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-200',
          enabled ? 'left-6' : 'left-1'
        )}
      />
    </button>
  );
}