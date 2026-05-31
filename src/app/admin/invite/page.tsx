'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Copy, Check, Plus, Link2, Clock, Users, Trash2 } from 'lucide-react';

interface InviteLink {
  id: string;
  code: string;
  max_uses: number;
  used_count: number;
  status: string;
  expires_at: string | null;
  created_at: string;
}

export default function AdminInvitePage() {
  const [links, setLinks] = useState<InviteLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [maxUses, setMaxUses] = useState(1);
  const [expiryDays, setExpiryDays] = useState(7);
  const [message, setMessage] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    fetchLinks();
  }, []);

  const fetchLinks = async () => {
    try {
      const { data } = await supabase
        .from('invite_links')
        .select('*')
        .order('created_at', { ascending: false });

      setLinks(data || []);
    } catch (err) {
      console.error('Error fetching links:', err);
    } finally {
      setLoading(false);
    }
  };

  const generateLink = async () => {
    setGenerating(true);
    setMessage(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('Not authenticated');

      const { data, error } = await supabase.rpc('generate_invite_link', {
        p_admin_id: session.user.id,
        p_max_uses: maxUses,
        p_expiry_days: expiryDays,
      });

      if (error) throw error;

      setMessage(`Invite link generated: ${data}`);
      fetchLinks();
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const copyLink = (code: string) => {
    const fullLink = `${window.location.origin}/auth/invite?code=${code}`;
    navigator.clipboard.writeText(fullLink);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  const deactivateLink = async (id: string) => {
    try {
      await supabase.from('invite_links').update({ status: 'inactive' }).eq('id', id);
      fetchLinks();
    } catch (err) {
      console.error('Error deactivating link:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emmy-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Invite Links</h1>
        <p className="text-muted-foreground">Generate and manage ambassador invite links</p>
      </div>

      {message && (
        <div className={`p-3 rounded-lg ${message.includes('Error') ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-emerald-50 text-emerald-600 border border-emerald-200'}`}>
          {message}
        </div>
      )}

      {/* Generate New Link */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Generate New Invite Link
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Max Uses</label>
              <div className="relative">
                <Users className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  value={maxUses}
                  onChange={(e) => setMaxUses(parseInt(e.target.value) || 1)}
                  className="pl-9"
                  min={1}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Expiry (Days)</label>
              <div className="relative">
                <Clock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  value={expiryDays}
                  onChange={(e) => setExpiryDays(parseInt(e.target.value) || 0)}
                  className="pl-9"
                  min={0}
                  placeholder="0 = never"
                />
              </div>
            </div>
          </div>
          <Button onClick={generateLink} disabled={generating} className="gap-2">
            <Link2 className="h-4 w-4" />
            {generating ? 'Generating...' : 'Generate Link'}
          </Button>
        </CardContent>
      </Card>

      {/* Links List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Active Invite Links
          </CardTitle>
        </CardHeader>
        <CardContent>
          {links.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No invite links generated yet
            </div>
          ) : (
            <div className="space-y-3">
              {links.map((link) => (
                <div
                  key={link.id}
                  className="flex items-center justify-between p-4 bg-slate-50 rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-bold text-emmy-primary">{link.code}</code>
                      <Badge variant={link.status === 'active' ? 'default' : 'secondary'}>
                        {link.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Uses: {link.used_count}/{link.max_uses} • 
                      Expires: {link.expires_at ? new Date(link.expires_at).toLocaleDateString() : 'Never'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyLink(link.code)}
                    >
                      {copied === link.code ? (
                        <Check className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                    {link.status === 'active' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deactivateLink(link.id)}
                        className="text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}