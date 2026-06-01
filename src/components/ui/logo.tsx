'use client';

import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
  size?: number;
  showText?: boolean;
}

export function EmmytechLogo({ className, size = 40, showText = false }: LogoProps) {
  const imgSize = typeof size === 'number' ? `${size}px` : size;
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <img src="/emmytech-logo.png" alt="EmmyTech" style={{ width: imgSize, height: 'auto' }} />
      {showText && (
        <span className="font-bold text-xl tracking-tight">
          <span className="text-emmy-primary">Emmy</span>
          <span className="text-emmy-secondary">tech</span>
        </span>
      )}
    </div>
  );
}