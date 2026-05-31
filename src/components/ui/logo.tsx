'use client';

import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
  size?: number;
  showText?: boolean;
}

export function EmmytechLogo({ className, size = 40, showText = true }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M20 4L36 32H4L20 4Z"
          fill="url(#emmy-gradient)"
          stroke="#003399"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <defs>
          <linearGradient id="emmy-gradient" x1="20" y1="4" x2="20" y2="32" gradientUnits="userSpaceOnUse">
            <stop stopColor="#003399" />
            <stop offset="1" stopColor="#ef7305" />
          </linearGradient>
        </defs>
      </svg>
      {showText && (
        <span className="font-bold text-xl tracking-tight">
          <span className="text-emmy-primary">Emmy</span>
          <span className="text-emmy-secondary">tech</span>
        </span>
      )}
    </div>
  );
}