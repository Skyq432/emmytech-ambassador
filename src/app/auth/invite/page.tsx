'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import { EmmytechLogo } from '@/components/ui/logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { KeyRound, User, Mail, Lock, ArrowLeft, CheckCircle } from 'lucide-react';

export default function InvitePage() {
  const [inviteCode, setInviteCode] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // For now, any invite code works (or empty)
    // TODO: Verify invite code with Supabase later

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name, role: 'ambassador' },
      },
    });

    if (error) {
      setError(error.message);
    } else {
      // Create ambassador record
      if (data.user) {
        const { data: assets, error: rpcError } = await supabase.rpc('generate_ambassador_assets', {
          user_name: name
        });

        if (rpcError) {
          console.error('RPC Error:', rpcError);
          // Fallback: generate manually
          const cleanName = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
          const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
          const tag = '#EMMY_' + cleanName.slice(0, 10);
          const code = cleanName.slice(0, 6) + random;
          const waLink = 'https://wa.me/2348146503700?text=Hi%20I%20came%20from%20' + code;

          await supabase.from('ambassadors').insert({
            user_id: data.user.id,
            ambassador_tag: tag,
            referral_code: code,
            whatsapp_link: waLink,
            status: 'active'
          });
        } else if (assets && assets[0]) {
          await supabase.from('ambassadors').insert({
            user_id: data.user.id,
            ambassador_tag: assets[0].tag,
            referral_code: assets[0].code,
            whatsapp_link: assets[0].wa_link,
            status: 'active'
          });
        }
      }
      setSuccess(true);
    }
    setLoading(false);
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-full max-w-md px-4">
          <div className="flex justify-center mb-8"><EmmytechLogo size={48} /></div>
          <Card className="border-0 shadow-lg">
            <CardContent className="pt-8 pb-8 text-center">
              <CheckCircle className="w-16 h-16 text-emmy-secondary mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Account Created!</h2>
              <p className="text-slate-600 mb-2">
                Welcome to Emmytech Ambassador Program.
              </p>
              <p className="text-sm text-slate-500 mb-6">
                Your ambassador tag and referral code have been generated. Check your email to verify your account.
              </p>
              <Button onClick={() => router.push('/auth/login')} className="w-full bg-emmy-primary hover:bg-emmy-primary-light">
                Go to Login
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-md px-4">
        <div className="flex justify-center mb-8"><EmmytechLogo size={48} /></div>
        <Card className="border-0 shadow-lg">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-2xl font-bold text-slate-900">Join as Ambassador</CardTitle>
            <CardDescription>Enter your details to create an account</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {error && <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-600 text-sm">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Invite Code (Optional)</label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <Input placeholder="Enter invite code (or leave empty)" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} className="pl-10" />
                </div>
                <p className="text-xs text-slate-400">For testing: any code works or leave empty</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <Input placeholder="John Doe" value={name} onChange={(e) => setName(e.target.value)} className="pl-10" required />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <Input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10" required />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <Input type="password" placeholder="Min 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-10" required minLength={6} />
                </div>
              </div>
              <Button type="submit" className="w-full bg-emmy-primary hover:bg-emmy-primary-light" size="lg" disabled={loading}>
                {loading ? 'Creating...' : 'Create Account'}
              </Button>
            </form>
            <div className="mt-6 text-center">
              <Link href="/auth/login" className="text-sm text-emmy-primary hover:text-emmy-primary-light font-medium inline-flex items-center">
                <ArrowLeft className="mr-1 w-4 h-4" />Back to login
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}