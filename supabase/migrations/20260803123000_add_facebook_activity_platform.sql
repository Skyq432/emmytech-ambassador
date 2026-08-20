-- Add Facebook to the permitted ambassador activity platforms.
-- Safe for repeated local execution. This migration changes schema only.

alter table public.activities
  drop constraint if exists activities_platform_check;

alter table public.activities
  add constraint activities_platform_check
  check (
    platform = any (
      array[
        'instagram'::text,
        'facebook'::text,
        'tiktok'::text,
        'twitter'::text,
        'threads'::text
      ]
    )
  );

comment on constraint activities_platform_check on public.activities is
  'Allowed ambassador social platforms: Instagram, Facebook, TikTok, Twitter/X and Threads.';
