'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Link2, Check, AlertTriangle, Loader2 } from 'lucide-react';

export default function InviteRegisterPage() {
  const [code, setCode] = useState<string | null>(null);
  const [codeLoaded, setCodeLoaded] = useState(false);
  const [validating, setValidating] = useState(true);
  const [valid, setValid] = useState(false);
  const [inviteData, setInviteData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [registering, setRegistering] = useState(false);
  const [success, setSuccess] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeParam = params.get('code');

    setCode(codeParam);
    setCodeLoaded(true);
  }, []);

  useEffect(() => {
    if (!codeLoaded) return;
    validateCode(code);
  }, [codeLoaded, code]);

  const validateCode = async (codeToValidate: string | null) => {
    if (!codeToValidate) {
      setError('No invite code provided');
      setValidating(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('invite_links')
        .select('*')
        .eq('code', codeToValidate)
        .eq('status', 'active')
        .single();

      if (error || !data) {
        setError('Invalid or expired invite code');
        setValidating(false);
        return;
      }

      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        setError('This invite link has expired');
        setValidating(false);
        return;
      }

      if (data.max_uses && data.used_count >= data.max_uses) {
        setError('This invite link has reached its maximum uses');
        setValidating(false);
        return;
      }

      setInviteData(data);
      setValid(true);
    } catch (err) {
      setError('Failed to validate invite code');
    } finally {
      setValidating(false);
    }
  };

  const handleRegister = async () => {
    if (!email || !password || !name) return;
    setRegistering(true);
    setError(null);

    try {
      // Sign up with invite code in metadata
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name,
            role: inviteData?.role || 'ambassador',
            invite_code: code,
          },
        },
      });

      if (authError) throw authError;

      setSuccess(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRegistering(false);
    }
  };

  if (validating) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <p>Validating invite code...</p>
        </div>
      </div>
    );
  }

  if (!valid) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Invalid Invite</h2>
            <p className="text-red-600 mb-4">{error}</p>
            <p className="text-sm text-muted-foreground">
              Please contact an admin to get a valid invite link.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <Check className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Registration Successful!</h2>
            <p className="text-muted-foreground mb-4">
              Please check your email to verify your account.
            </p>
            <Button onClick={() => window.location.href = '/auth/login'}>
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Join EmmyTech Ambassador
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-3 bg-emmy-primary/5 rounded-lg">
            <p className="text-sm">
              Invite Code: <Badge variant="secondary">{code}</Badge>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Role: {inviteData?.role || 'ambassador'}
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Full Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Password</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 6 characters"
            />
          </div>

          <Button
            onClick={handleRegister}
            disabled={registering || !email || !password || !name}
            className="w-full"
          >
            {registering ? 'Creating Account...' : 'Create Account'}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <a href="/auth/login" className="text-emmy-primary hover:underline">
              Login
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}