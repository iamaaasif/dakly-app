import { MessageCircle } from 'lucide-react';
import Image from 'next/image';

export function AuthBrandPanel() {
  return (
    <aside className="relative hidden flex-col overflow-hidden bg-brand-dark px-12 py-11 text-on-primary lg:sticky lg:top-0 lg:flex lg:h-dvh xl:px-16 2xl:px-18">
      <BrandBackdrop />
      <p className="relative flex items-center gap-3 text-lg font-bold">
        <span
          aria-hidden="true"
          className="flex size-9.5 items-center justify-center rounded-lg bg-primary"
        >
          <Image src="/dakly-mark.png" alt="" width={230} height={290} className="h-auto w-5.5" />
        </span>
        <span>
          Dakly <span className="text-primary">AI</span>
        </span>
      </p>
      <div className="relative flex max-w-130 flex-1 flex-col justify-center gap-4.5">
        <p className="flex items-center gap-2 text-xs font-semibold tracking-widest text-on-primary/60 uppercase">
          <span aria-hidden="true" className="size-1.5 rounded-sm bg-primary" />
          AI customer growth platform
        </p>
        <p className="text-display font-bold tracking-tight text-balance">
          Connect customers.
          <br />
          <span className="text-primary">Grow sales.</span>
        </p>
        <p className="max-w-md text-md text-pretty text-on-primary/70">
          Answer every chat, keep every customer and send the right follow-up, from one place, in
          Bangla or English.
        </p>
      </div>
      <div className="relative flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-sm text-on-primary/50">
        <a
          href="https://wa.me/8809610325591"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-on-primary/70 hover:text-on-primary"
        >
          <span
            aria-hidden="true"
            className="flex size-5.5 items-center justify-center rounded-full bg-success"
          >
            <MessageCircle size={13} />
          </span>
          Need help? <b className="font-semibold text-on-primary">+880 9610-325591</b>
        </a>
        <span>© 2026 Dakly AI</span>
      </div>
    </aside>
  );
}

// A faint grid fading out from the upper left, and two orange glows.
function BrandBackdrop() {
  return (
    <>
      <svg aria-hidden="true" className="absolute inset-0 size-full text-on-primary/5">
        <defs>
          <pattern id="auth-grid" width="56" height="56" patternUnits="userSpaceOnUse">
            <path d="M56 0H0V56" fill="none" stroke="currentColor" />
          </pattern>
          <radialGradient id="auth-grid-fade" cx="30%" cy="40%" r="75%">
            <stop offset="30%" stopColor="white" />
            <stop offset="100%" stopColor="black" />
          </radialGradient>
          <mask id="auth-grid-mask">
            <rect width="100%" height="100%" fill="url(#auth-grid-fade)" />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="url(#auth-grid)" mask="url(#auth-grid-mask)" />
      </svg>
      <div
        aria-hidden="true"
        className="absolute -top-64 -left-56 size-155 rounded-full bg-primary/25 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="absolute -right-60 -bottom-60 size-130 rounded-full bg-primary/15 blur-3xl"
      />
    </>
  );
}
