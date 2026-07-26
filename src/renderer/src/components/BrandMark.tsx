import { cn } from '@renderer/lib/utils'

/**
 * The Shailee-GRMS mark.
 *
 * Drop the official logo at `src/renderer/src/assets/logo.png` and it is used
 * automatically — Vite resolves it at build time, and the inline SVG below is
 * the fallback until then. The SVG is not a stand-in shape: it traces the same
 * motif as the logo (ring, draped figure, hanger) so the app reads as the same
 * brand either way.
 */

// eager+query so a missing file is simply an empty record rather than a build
// error. `npm run brand:logo` writes both of these.
const glob = (pattern: string): string | null => {
  const hits = import.meta.glob('../assets/*.{png,svg,jpg,jpeg,webp}', {
    eager: true,
    query: '?url',
    import: 'default'
  }) as Record<string, string>
  const key = Object.keys(hits).find((k) => k.includes(pattern))
  return key ? hits[key] : null
}

/** Square emblem — reads at any size, used for badges and the taskbar. */
const MARK_URL = glob('logo-mark')
/** Full lockup with wordmark and strapline — only legible when shown large. */
const FULL_URL = glob('logo-full')

export interface BrandMarkProps {
  /** Rendered size in px (height, for the 'full' variant). */
  size?: number
  className?: string
  /**
   * 'tile' — square emblem on a white tile, for the sidebar badge.
   * 'bare' — square emblem, no background.
   * 'full' — the complete lockup including the wordmark; needs real width, so
   *          only use it somewhere the logo can be shown large.
   */
  variant?: 'tile' | 'bare' | 'full'
}

export function BrandMark({ size = 32, className, variant = 'tile' }: BrandMarkProps): JSX.Element {
  if (variant === 'full' && FULL_URL) {
    return (
      <img
        src={FULL_URL}
        alt="Shailee-GRMS — Garment Retail Management System"
        className={cn('block h-auto w-full max-w-[420px] object-contain', className)}
      />
    )
  }

  const url = MARK_URL ?? FULL_URL
  if (url) {
    return (
      <img
        src={url}
        alt="Shailee-GRMS"
        width={size}
        height={size}
        className={cn(
          'shrink-0 object-contain',
          variant === 'tile' && 'rounded-lg bg-white p-0.5 shadow-sm',
          className
        )}
      />
    )
  }

  const tile = variant === 'tile'
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      role="img"
      aria-label="Shailee-GRMS"
      className={cn('shrink-0', className)}
    >
      <defs>
        <linearGradient id="sg-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3F1F63" />
          <stop offset="0.55" stopColor="#5B2D8E" />
          <stop offset="1" stopColor="#C2186B" />
        </linearGradient>
        <linearGradient id="sg-drape" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#E0489A" />
        </linearGradient>
      </defs>

      {tile && <rect width="512" height="512" rx="112" fill="url(#sg-bg)" />}

      <circle
        cx="256"
        cy="256"
        r="176"
        fill="none"
        stroke={tile ? '#ffffff' : 'currentColor'}
        strokeOpacity={tile ? 0.28 : 0.35}
        strokeWidth="16"
      />

      {/* hanger hook */}
      <path
        d="M330 150 c0 -26 -22 -40 -42 -30 c-16 8 -18 28 -6 40"
        fill="none"
        stroke={tile ? '#ffffff' : 'currentColor'}
        strokeWidth="15"
        strokeLinecap="round"
      />

      {/* head */}
      <circle cx="214" cy="168" r="42" fill={tile ? '#ffffff' : 'currentColor'} />

      {/* shoulder and flowing drape */}
      <path
        d="M214 214 c-52 0 -84 34 -92 82 c-8 50 6 104 34 140 c14 18 40 22 58 8
           c26 -20 40 -56 44 -96 c4 -44 -8 -88 -44 -134 z"
        fill={tile ? 'url(#sg-drape)' : 'currentColor'}
      />

      {/* pallu sweep */}
      <path
        d="M268 232 c44 22 66 66 62 116 c-4 44 -30 80 -68 96
           c22 -40 30 -84 24 -128 c-4 -32 -12 -60 -18 -84 z"
        fill={tile ? '#ffffff' : 'currentColor'}
        fillOpacity={tile ? 0.85 : 0.7}
      />
    </svg>
  )
}
