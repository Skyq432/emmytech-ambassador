export type UserRole = 'admin' | 'ambassador';

export type AmbassadorStatus = 'pending' | 'active' | 'suspended';

export type ActivityStatus = 'pending_review' | 'approved' | 'rejected';

export type LeadStatus = 'new' | 'contacted' | 'converted' | 'lost';

export type LeadSource = 'whatsapp' | 'referral' | 'social' | 'direct';

export type SocialPlatform = 'instagram' | 'tiktok' | 'twitter' | 'threads';

export type PointType = 'post' | 'lead' | 'conversion' | 'bonus';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar_url?: string;
  created_at: string;
}

export interface Ambassador {
  id: string;
  user_id: string;
  user?: User;
  ambassador_tag: string;
  referral_code: string;
  whatsapp_number: string;
  whatsapp_link: string;
  bio?: string;
  social_links?: Record<string, string>;
  total_points: number;
  status: AmbassadorStatus;
  created_at: string;
}

export interface Activity {
  id: string;
  ambassador_id: string;
  ambassador?: Ambassador;
  platform: SocialPlatform;
  post_url: string;
  caption?: string;
  submitted_at: string;
  status: ActivityStatus;
  reviewed_by?: string;
  reviewer?: User;
  reviewed_at?: string;
  points_awarded: number;
  rejection_reason?: string;
}

export interface Lead {
  id: string;
  ambassador_id: string;
  ambassador?: Ambassador;
  source: LeadSource;
  source_detail?: {
    campaign?: string;
    platform?: string;
    post_id?: string;
    referral_code?: string;
  };
  customer_name?: string;
  customer_phone: string;
  customer_email?: string;
  referral_code_used?: string;
  whatsapp_link_used?: string;
  status: LeadStatus;
  notes?: string;
  assigned_admin?: string;
  created_at: string;
  updated_at: string;
}

export interface Conversion {
  id: string;
  lead_id: string;
  lead?: Lead;
  ambassador_id: string;
  ambassador?: Ambassador;
  amount: number;
  commission_amount: number;
  commission_rate: number;
  approved_by: string;
  approver?: User;
  approved_at: string;
  points_generated: number;
}

export interface PointTransaction {
  id: string;
  ambassador_id: string;
  ambassador?: Ambassador;
  amount: number;
  type: PointType;
  reference_id?: string;
  reference_type?: string;
  reason: string;
  created_at: string;
}

export interface LeaderboardEntry {
  ambassador_id: string;
  name: string;
  tag: string;
  total_points: number;
  total_leads: number;
  total_conversions: number;
  conversion_value: number;
  rank: number;
}