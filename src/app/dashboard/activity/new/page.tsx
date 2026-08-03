'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Send } from 'lucide-react';


const PLATFORM_OPTIONS = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'twitter', label: 'Twitter / X' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'threads', label: 'Threads' },
] as const;

type ActivityPlatform = (typeof PLATFORM_OPTIONS)[number]['value'];

export default function SubmitActivityPage() {
  const router = useRouter();

  const [platform, setPlatform] = useState<ActivityPlatform | ''>('');
  const [postUrl, setPostUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    const supabase = createClient();

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.user) {
      setErrorMsg('You must be logged in to submit a post.');
      setLoading(false);
      return;
    }

    const { data: ambassador, error: ambassadorError } = await supabase
      .from('ambassadors')
      .select('id')
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (ambassadorError || !ambassador) {
      setErrorMsg('Ambassador profile not found.');
      setLoading(false);
      return;
    }

    const { error: insertError } = await supabase.from('activities').insert({
      ambassador_id: ambassador.id,
      platform,
      post_url: postUrl.trim(),
      caption: caption.trim() || null,
      status: 'pending_review',
      points_awarded: 0,
    });

    if (insertError) {
      if (
        insertError.code === '23514' &&
        insertError.message.includes('activities_platform_check')
      ) {
        setErrorMsg(
          'This platform is not enabled in the database yet. Apply the local activity-platform migration and try again.'
        );
      } else {
        setErrorMsg(insertError.message);
      }

      setLoading(false);
      return;
    }

    router.push('/dashboard/activity');
    router.refresh();
  }

  return (
    <div className="max-w-3xl space-y-6">
      <button
        type="button"
        onClick={() => router.push('/dashboard/activity')}
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Activity
      </button>

      <div>
        <h1 className="text-3xl font-bold text-slate-900">Submit New Post</h1>
        <p className="text-slate-500">
          Submit your social media post for admin review.
        </p>
      </div>

      <Card className="rounded-2xl border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Post Details</CardTitle>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {errorMsg && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
                {errorMsg}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">
                Platform
              </label>

              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as ActivityPlatform | '')}
                required
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-emmy-primary"
              >
                <option value="">Select platform</option>
                {PLATFORM_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">
                Post URL
              </label>

              <input
                type="url"
                value={postUrl}
                onChange={(e) => setPostUrl(e.target.value)}
                placeholder="https://instagram.com/p/..."
                required
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emmy-primary"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">
                Caption / Notes
              </label>

              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Add the post caption or a short note..."
                rows={5}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emmy-primary"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emmy-primary px-5 py-3 font-semibold text-white hover:bg-emmy-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              {loading ? 'Submitting...' : 'Submit Post'}
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}