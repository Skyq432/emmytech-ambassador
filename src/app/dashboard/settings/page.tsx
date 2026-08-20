'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  User,
  Mail,
  Link as LinkIcon,
  Save,
  LogOut,
  Copy,
  Check,
  Globe,
  Trophy,
  Lock,
  Bell,
  Trash2,
  AlertTriangle,
  Camera,
  Eye,
  EyeOff,
  Phone,
  KeyRound,
  Calendar,
  Gift,
  ShieldCheck,
  CheckCircle2,
  Circle,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';

const OFFICIAL_AMBASSADOR_DOMAIN = 'https://emmytechambassador.netlify.app';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar_url: string | null;
  created_at: string;
}

interface AmbassadorProfile {
  id: string;
  ambassador_tag: string;
  referral_code: string;
  custom_referral_code: string | null;
  custom_referral_code_set: boolean;
  whatsapp_number: string;
  whatsapp_link: string;
  bio: string | null;
  social_links: Record<string, string>;
  total_points: number;
  total_leads: number;
  total_conversions: number;
  total_cashed_out: number;
  available_balance: number;
  status: string;
  created_at: string;
  date_of_birth: string | null;
}

interface NotificationPref {
  new_leads: boolean;
  post_approvals: boolean;
  conversions: boolean;
  leaderboard_updates: boolean;
  point_rewards: boolean;
}

export default function SettingsPage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [ambassador, setAmbassador] = useState<AmbassadorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form states
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [instagram, setInstagram] = useState('');
  const [tiktok, setTiktok] = useState('');
  const [twitter, setTwitter] = useState('');
  const [threads, setThreads] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Custom referral code
  const [customCode, setCustomCode] = useState('');
  const [settingCustomCode, setSettingCustomCode] = useState(false);

  // Password states
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  // Notification states
  const [notifications, setNotifications] = useState<NotificationPref>({
    new_leads: true,
    post_approvals: true,
    conversions: true,
    leaderboard_updates: false,
    point_rewards: true,
  });

  // Delete account modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);

  const referralLink = ambassador
    ? `${OFFICIAL_AMBASSADOR_DOMAIN}/r/${
        ambassador.custom_referral_code || ambassador.referral_code
      }`
    : '';

  const profileChecks = [
    { label: 'Profile photo', done: Boolean(avatarUrl) },
    { label: 'WhatsApp number', done: Boolean(whatsappNumber) },
    { label: 'Date of birth', done: Boolean(dateOfBirth) },
    { label: 'Bio', done: Boolean(bio) },
    { label: 'Custom referral code', done: Boolean(ambassador?.custom_referral_code) },
  ];

  const completedCount = profileChecks.filter((item) => item.done).length;
  const completionPercentage =
    user?.role === 'ambassador'
      ? Math.round((completedCount / profileChecks.length) * 100)
      : avatarUrl && name
        ? 100
        : 60;

  useEffect(() => {
    async function fetchProfile() {
      try {
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.user) return;

        const { data: userData } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (userData) {
          setUser(userData);
          setName(userData.name || '');
          setAvatarUrl(userData.avatar_url);
        }

        if (userData?.role === 'ambassador') {
          const { data: ambassadorData } = await supabase
            .from('ambassadors')
            .select('*')
            .eq('user_id', session.user.id)
            .single();

          if (ambassadorData) {
            setAmbassador(ambassadorData);
            setBio(ambassadorData.bio || '');
            setWhatsappNumber(ambassadorData.whatsapp_number || '');
            setDateOfBirth(ambassadorData.date_of_birth || '');
            setCustomCode(ambassadorData.custom_referral_code || '');

            const socials = ambassadorData.social_links || {};
            setInstagram(socials.instagram || '');
            setTiktok(socials.tiktok || '');
            setTwitter(socials.twitter || '');
            setThreads(socials.threads || '');
          }
        }
      } catch (err) {
        console.error('Error fetching profile:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchProfile();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) throw new Error('Not authenticated');

      if (name !== user?.name) {
        const { error: userError } = await supabase
          .from('users')
          .update({ name })
          .eq('id', session.user.id);

        if (userError) throw userError;

        setUser((prev) => (prev ? { ...prev, name } : prev));
      }

      if (user?.role === 'ambassador' && ambassador) {
        const socialLinks = {
          ...(instagram && { instagram }),
          ...(tiktok && { tiktok }),
          ...(twitter && { twitter }),
          ...(threads && { threads }),
        };

        const { error: ambassadorError } = await supabase
          .from('ambassadors')
          .update({
            bio: bio || null,
            whatsapp_number: whatsappNumber || '+2348146503700',
            date_of_birth: dateOfBirth || null,
            social_links:
              Object.keys(socialLinks).length > 0 ? socialLinks : {},
          })
          .eq('id', ambassador.id);

        if (ambassadorError) throw ambassadorError;

        setAmbassador((prev) =>
          prev
            ? {
                ...prev,
                bio: bio || null,
                whatsapp_number: whatsappNumber || '+2348146503700',
                date_of_birth: dateOfBirth || null,
                social_links: socialLinks,
              }
            : prev
        );
      }

      setMessage('Profile updated successfully');
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSetCustomCode = async () => {
    if (!customCode.trim() || !ambassador) return;

    setSettingCustomCode(true);
    setMessage(null);

    try {
      const supabase = createClient();

      const { data, error } = await supabase.rpc('set_custom_referral_code', {
        p_ambassador_id: ambassador.id,
        p_code: customCode.trim().toLowerCase(),
      });

      if (error) throw error;

      if (!data) {
        setMessage('Error: Custom code already set or unavailable');
        return;
      }

      setMessage('Custom referral code set successfully!');

      const { data: refreshed } = await supabase
        .from('ambassadors')
        .select('*')
        .eq('id', ambassador.id)
        .single();

      if (refreshed) {
        setAmbassador(refreshed);
        setCustomCode(refreshed.custom_referral_code || '');
      }
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setSettingCustomCode(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingAvatar(true);
    setMessage(null);

    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) throw new Error('Not authenticated');

      const fileExt = file.name.split('.').pop();
      const filePath = `avatars/${session.user.id}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from('avatars').getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('users')
        .update({ avatar_url: publicUrl })
        .eq('id', session.user.id);

      if (updateError) throw updateError;

      setAvatarUrl(publicUrl);
      setUser((prev) => (prev ? { ...prev, avatar_url: publicUrl } : prev));
      setMessage('Avatar updated successfully');
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      setMessage('Error: Passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      setMessage('Error: Password must be at least 6 characters');
      return;
    }

    setChangingPassword(true);
    setMessage(null);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });

      if (error) throw error;

      setMessage('Password changed successfully');
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswordForm(false);
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setChangingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== 'DELETE') return;

    setDeleting(true);
    setMessage(null);

    try {
      setMessage(
        'Error: Account deletion must be requested from admin support for security reasons.'
      );
      setDeleting(false);
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
      setDeleting(false);
    }
  };

  const copyReferralLink = () => {
    if (referralLink) {
      navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = '/auth/login';
  };

  const toggleNotification = (key: keyof NotificationPref) => {
    setNotifications((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
        <Card>
          <CardContent className="p-6">
            <div className="h-32 w-full animate-pulse rounded bg-slate-200" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Profile Settings</h1>
        <p className="text-muted-foreground">
          Manage your profile, security, ambassador details, and preferences.
        </p>
      </div>

      {message && (
        <div
          className={`rounded-lg border p-3 ${
            message.includes('Error')
              ? 'border-red-200 bg-red-50 text-red-600'
              : 'border-emerald-200 bg-emerald-50 text-emerald-600'
          }`}
        >
          {message}
        </div>
      )}

      {/* Profile Completion */}
      {user?.role === 'ambassador' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Profile Completion
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium text-slate-700">
                  Your ambassador profile is {completionPercentage}% complete
                </p>
                <Badge variant={completionPercentage >= 80 ? 'default' : 'secondary'}>
                  {completionPercentage}%
                </Badge>
              </div>

              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-emmy-primary transition-all"
                  style={{ width: `${completionPercentage}%` }}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {profileChecks.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm"
                >
                  {item.done ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Circle className="h-4 w-4 text-slate-300" />
                  )}
                  <span className={item.done ? 'text-slate-700' : 'text-slate-400'}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Avatar & Account Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Account Information
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <div className="relative">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Avatar"
                  className="h-16 w-16 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emmy-primary text-xl font-bold text-white">
                  {user?.name?.[0]?.toUpperCase() || 'U'}
                </div>
              )}

              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 text-white transition-colors hover:bg-slate-700"
              >
                <Camera className="h-3.5 w-3.5" />
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
              />
            </div>

            <div>
              <p className="font-medium">{user?.name || 'User'}</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
              {uploadingAvatar && (
                <p className="mt-1 text-xs text-emmy-primary">Uploading...</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Full Name</label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="pl-9"
                  placeholder="Your name"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input value={user?.email || ''} disabled className="bg-slate-50 pl-9" />
              </div>
            </div>

            {user?.role === 'ambassador' && (
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium">Date of Birth</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    className="pl-9"
                  />
                </div>

                <p className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Gift className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emmy-primary" />
                  <span>
                    Add your date of birth to enjoy special recognition and
                    exclusive benefits on your birthday.
                  </span>
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
            <Badge variant="secondary">
              ambassador
            </Badge>

            <span className="text-sm text-muted-foreground">
              Joined {user?.created_at ? formatDate(user.created_at) : 'N/A'}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Ambassador Details */}
      {user?.role === 'ambassador' && ambassador && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LinkIcon className="h-5 w-5" />
                Ambassador Information
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Ambassador Tag</label>
                  <Input value={ambassador.ambassador_tag} disabled className="bg-slate-50" />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Referral Code</label>
                  <Input value={ambassador.referral_code} disabled className="bg-slate-50" />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Status</label>
                  <Input value={ambassador.status} disabled className="bg-slate-50 capitalize" />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Joined Ambassador Program</label>
                  <Input
                    value={ambassador.created_at ? formatDate(ambassador.created_at) : 'N/A'}
                    disabled
                    className="bg-slate-50"
                  />
                </div>
              </div>

              {/* Custom Referral Code */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-emmy-primary" />
                  <label className="text-sm font-medium">Custom Referral Code</label>
                  {ambassador.custom_referral_code_set && (
                    <Badge variant="secondary">Locked</Badge>
                  )}
                </div>

                {ambassador.custom_referral_code_set ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={ambassador.custom_referral_code || ''}
                      disabled
                      className="flex-1 bg-slate-50"
                    />
                    <span className="text-xs text-muted-foreground">
                      Cannot be changed
                    </span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input
                        value={customCode}
                        onChange={(e) =>
                          setCustomCode(
                            e.target.value
                              .toLowerCase()
                              .replace(/[^a-z0-9]/g, '')
                          )
                        }
                        placeholder="Set your custom code"
                        className="flex-1 lowercase"
                        maxLength={20}
                      />

                      <Button
                        size="sm"
                        onClick={handleSetCustomCode}
                        disabled={!customCode || settingCustomCode}
                      >
                        {settingCustomCode ? 'Saving...' : 'Set'}
                      </Button>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Choose a memorable code. This can only be set once.
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">WhatsApp Number</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={whatsappNumber}
                    onChange={(e) => setWhatsappNumber(e.target.value)}
                    className="pl-9"
                    placeholder="+2348146503700"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  This number helps admin contact you when necessary.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Referral Link</label>
                <div className="flex gap-2">
                  <Input value={referralLink} disabled className="flex-1 bg-slate-50" />

                  <Button variant="outline" size="sm" onClick={copyReferralLink}>
                    {copied ? (
                      <Check className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Share this link to track leads and ambassador activity.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Bio</label>
                <Textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell us about yourself..."
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Social Links
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Instagram</label>
                  <Input
                    value={instagram}
                    onChange={(e) => setInstagram(e.target.value)}
                    placeholder="@username"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">TikTok</label>
                  <Input
                    value={tiktok}
                    onChange={(e) => setTiktok(e.target.value)}
                    placeholder="@username"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Twitter / X</label>
                  <Input
                    value={twitter}
                    onChange={(e) => setTwitter(e.target.value)}
                    placeholder="@username"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Threads</label>
                  <Input
                    value={threads}
                    onChange={(e) => setThreads(e.target.value)}
                    placeholder="@username"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5" />
                Performance
              </CardTitle>
            </CardHeader>

            <CardContent>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-lg bg-slate-50 p-4 text-center">
                  <p className="text-2xl font-bold">{ambassador.total_points}</p>
                  <p className="text-sm text-muted-foreground">Points</p>
                </div>

                <div className="rounded-lg bg-slate-50 p-4 text-center">
                  <p className="text-2xl font-bold">{ambassador.total_leads}</p>
                  <p className="text-sm text-muted-foreground">Leads</p>
                </div>

                <div className="rounded-lg bg-slate-50 p-4 text-center">
                  <p className="text-2xl font-bold">
                    {ambassador.total_conversions}
                  </p>
                  <p className="text-sm text-muted-foreground">Conversions</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Security */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Security
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {!showPasswordForm ? (
            <Button variant="outline" onClick={() => setShowPasswordForm(true)}>
              <Lock className="mr-2 h-4 w-4" />
              Change Password
            </Button>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">New Password</label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 6 characters"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-muted-foreground"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Confirm Password</label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleChangePassword}
                  disabled={changingPassword || !newPassword || !confirmPassword}
                >
                  {changingPassword ? 'Updating...' : 'Update Password'}
                </Button>

                <Button variant="ghost" onClick={() => setShowPasswordForm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notifications
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {[
            {
              key: 'new_leads' as const,
              label: 'New Leads',
              desc: 'When someone clicks your referral link',
            },
            {
              key: 'post_approvals' as const,
              label: 'Post Approvals',
              desc: 'When admin reviews your activity',
            },
            {
              key: 'conversions' as const,
              label: 'Conversions',
              desc: 'When a lead converts to a sale',
            },
            {
              key: 'point_rewards' as const,
              label: 'Point Rewards',
              desc: 'When you earn points',
            },
            {
              key: 'leaderboard_updates' as const,
              label: 'Leaderboard Updates',
              desc: 'Weekly position changes',
            },
          ].map((item) => (
            <div key={item.key} className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium">{item.label}</p>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>

              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={notifications[item.key]}
                  onChange={() => toggleNotification(item.key)}
                  className="peer sr-only"
                />

                <div className="peer h-6 w-11 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-emmy-primary peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none" />
              </label>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            Danger Zone
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium">Delete Account</p>
              <p className="text-sm text-muted-foreground">
                Account deletion must be reviewed by admin support.
              </p>
            </div>

            <Button variant="danger" onClick={() => setShowDeleteModal(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Request Delete
            </Button>
          </div>
        </CardContent>
      </Card>

      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="mx-4 w-full max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="h-5 w-5" />
                Request Account Deletion?
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                For security reasons, account deletion must be reviewed by admin
                support. Type <strong>DELETE</strong> to submit your request.
              </p>

              <Input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="Type DELETE"
              />

              <div className="flex gap-2">
                <Button
                  variant="danger"
                  onClick={handleDeleteAccount}
                  disabled={deleteConfirm !== 'DELETE' || deleting}
                >
                  {deleting ? 'Submitting...' : 'Submit Request'}
                </Button>

                <Button variant="ghost" onClick={() => setShowDeleteModal(false)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>

        <Button variant="danger" onClick={handleSignOut} className="gap-2">
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}
