export function LogoMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="hsl(var(--brand))" />
      <circle cx="14" cy="15" r="7.5" fill="none" stroke="hsl(var(--brand-fg))" strokeWidth="2.4" />
      <path d="M19.6 20.6 25 26" stroke="hsl(var(--brand-fg))" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M10.5 13h7M10.5 16.5h5" stroke="hsl(var(--brand-fg))" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      <div className="leading-none">
        <div className="text-[15px] font-semibold tracking-[-0.01em] text-ink">SpecLens</div>
        <div className="mt-1 text-[11px] text-ink-3">Requirements intelligence</div>
      </div>
    </div>
  );
}
