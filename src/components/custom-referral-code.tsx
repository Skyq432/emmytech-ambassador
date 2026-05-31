'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Lock, KeyRound, Check } from 'lucide-react';

interface CustomReferralCodeProps {
  ambassadorId: string;
  currentCode: string | null;
  isSet: boolean;
  onUpdate: () => void;
}

export function CustomReferralCodeSetter({ ambassadorId, currentCode, isSet, onUpdate }: CustomReferralCodeProps) {
  const [customCode, setCustomCode] = useState(currentCode || '');
  const [setting, setSetting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSet = async () => {
    if (!customCode.trim()) return;
    setSetting(true);
    setMessage(null);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('set_custom_referral_code', {
        p_ambassador_id: ambassadorId,
        p_code: customCode.trim().toUpperCase(),
      });

      if (error) throw error;
      if (!data) {
        setMessage('This code is already taken or you have already set one');
        return;
      }

      setMessage('Custom referral code set successfully!');
      onUpdate();
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setSetting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-emmy-primary" />
        <label className="text-sm font-medium">Custom Referral Code</label>
        {isSet && (
          <Badge variant="secondary" className="gap-1">
            <Lock className="h-3 w-3" />
            Locked
          </Badge>
        )}
      </div>

      {isSet ? (
        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border">
          <code className="text-lg font-bold text-emmy-primary">{currentCode}</code>
          <span className="text-xs text-muted-foreground">Cannot be changed once set</span>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              value={customCode}
              onChange={(e) => setCustomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              placeholder="Enter custom code (e.g. CHIDI10)"
              className="flex-1 uppercase"
              maxLength={15}
            />
            <Button
              onClick={handleSet}
              disabled={setting || !customCode.trim() || customCode.length < 3}
              className="gap-2"
            >
              {setting ? 'Setting...' : <><Check className="h-4 w-4" /> Set</>}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Choose a memorable code (3-15 chars, letters & numbers). This can only be set once!
          </p>
        </div>
      )}

      {message && (
        <div className={`p-2 rounded-lg text-sm ${message.includes('Error') ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
          {message}
        </div>
      )}
    </div>
  );
}