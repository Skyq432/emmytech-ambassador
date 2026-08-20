'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import { EmmytechLogo } from '@/components/ui/logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  ArrowRight,
  ArrowLeft,
  CheckCircle,
} from 'lucide-react';

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [error, setError] = useState('');

  const router = useRouter();

  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get('error');
    if (reason === 'ambassador-only') {
      setError('This login is only for ambassadors. Admin accounts cannot access the Ambassador portal.');
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    const supabase = createClient();

    setLoading(true);
    setError('');

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', data.user.id)
        .single();

      if (profile?.role !== 'ambassador') {
        await supabase.auth.signOut();
        setError('This login is only for ambassadors. Admin accounts cannot access the Ambassador portal.');
        setLoading(false);
        return;
      }

      router.push('/dashboard');

      router.refresh();
    }

    setLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email) {
      setError('Please enter your email address.');
      return;
    }

    const supabase = createClient();

    setLoading(true);
    setError('');
    setResetSent(false);

    const redirectTo =
      typeof window !== 'undefined'
        ? `${window.location.origin}/auth/reset-password`
        : undefined;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (error) {
      setError(error.message);
    } else {
      setResetSent(true);
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-md px-4">
        <div className="flex justify-center mb-8">
          <EmmytechLogo size={160} />
        </div>

        <Card className="border-0 shadow-lg">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-2xl font-bold text-slate-900">
              {mode === 'login' ? 'Welcome Back' : 'Reset Password'}
            </CardTitle>

            <CardDescription>
              {mode === 'login'
                ? 'Sign in to your ambassador dashboard'
                : 'Enter your email and we will send you a reset link'}
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-6">
            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-600 text-sm">
                {error}
              </div>
            )}

            {resetSent && (
              <div className="mb-4 p-3 rounded-lg bg-emerald-50 text-emerald-700 text-sm flex gap-2">
                <CheckCircle className="w-5 h-5 shrink-0" />
                <span>
                  Password reset link sent. Please check your email inbox or
                  spam folder.
                </span>
              </div>
            )}

            {mode === 'login' ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">
                    Email
                  </label>

                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <Input
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-700">
                      Password
                    </label>

                    <button
                      type="button"
                      onClick={() => {
                        setMode('forgot');
                        setError('');
                        setResetSent(false);
                      }}
                      className="text-sm font-medium text-emmy-primary hover:text-emmy-primary-light"
                    >
                      Forgot password?
                    </button>
                  </div>

                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />

                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 pr-10"
                      required
                    />

                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? (
                        <EyeOff className="w-5 h-5" />
                      ) : (
                        <Eye className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-emmy-primary hover:bg-emmy-primary-light"
                  size="lg"
                  disabled={loading}
                >
                  {loading ? 'Signing in...' : 'Sign In'}
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </form>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">
                    Email Address
                  </label>

                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />

                    <Input
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-emmy-primary hover:bg-emmy-primary-light"
                  size="lg"
                  disabled={loading}
                >
                  {loading ? 'Sending reset link...' : 'Send Reset Link'}
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    setMode('login');
                    setError('');
                    setResetSent(false);
                  }}
                >
                  <ArrowLeft className="mr-2 w-4 h-4" />
                  Back to Login
                </Button>
              </form>
            )}

            {mode === 'login' && (
              <div className="mt-6 text-center">
                <p className="text-sm text-slate-500">
                  New ambassador?{' '}
                  <Link
                    href="/auth/invite"
                    className="text-emmy-primary hover:text-emmy-primary-light font-medium"
                  >
                    Use invite code
                  </Link>
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="mt-8 text-center text-sm text-slate-400">
          2026 Emmytech. Internal use only.
        </p>
      </div>
    </div>
  );
}
