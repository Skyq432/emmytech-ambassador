import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateReferralCode(name: string): string {
  const clean = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${clean.slice(0, 6)}${random}`;
}

export function generateAmbassadorTag(name: string): string {
  const clean = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return `#EMMY_${clean.slice(0, 10)}`;
}

export function generateWhatsAppLink(phone: string, referralCode: string): string {
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  const text = encodeURIComponent(`Hi I came from ${referralCode}`);
  return `https://wa.me/${cleanPhone}?text=${text}`;
}

export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

export function formatCurrency(amount: number): string {
  return '₦' + amount.toLocaleString('en-NG');
}

// Point values
export const POINT_VALUES = {
  post: 50,
  lead: 100,
  conversion: 500,
} as const;

// Commission rate
export const COMMISSION_RATE = 0.05; // 5% fixed

// Emmytech WhatsApp
export const EMMYTECH_WHATSAPP = '+2348146503700';