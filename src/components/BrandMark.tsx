/**
 * logo.png：公司图形标（纯白，需放在品牌色底上）
 * logo-2：项目名「悦总统」字标（白底用 dark 版，蓝底用白字版）
 */

type BrandMarkProps = {
  className?: string
}

export function CompanyLogo({ className = 'h-9 w-9' }: BrandMarkProps) {
  return (
    <img
      src="/logo.png"
      alt="公司标识"
      className={`object-contain ${className}`}
    />
  )
}

/** 项目名字标。variant: dark=浅色底 | light=深色/蓝色底 */
export function ProjectWordmark({
  className = 'h-7',
  variant = 'dark',
}: BrandMarkProps & { variant?: 'dark' | 'light' }) {
  const src = variant === 'light' ? '/logo-2.png' : '/logo-2-dark.png'
  return (
    <img
      src={src}
      alt="悦总统"
      className={`object-contain object-left ${className}`}
    />
  )
}

export function BrandLockup({
  compact = false,
  onDark = false,
}: {
  compact?: boolean
  onDark?: boolean
}) {
  // 纯白 logo 放在品牌色圆角底上，无阴影
  const markBox = onDark
    ? 'flex shrink-0 items-center justify-center rounded-lg bg-white/15'
    : 'flex shrink-0 items-center justify-center rounded-lg bg-brand-600'

  return (
    <div className={`flex items-center ${compact ? 'gap-1.5' : 'gap-1.5'}`}>
      <div className={`${markBox} ${compact ? 'h-8 w-8 p-1' : 'h-9 w-9 p-1'}`}>
        <CompanyLogo className="h-full w-full" />
      </div>
      <div className="min-w-0">
        <ProjectWordmark
          variant={onDark ? 'light' : 'dark'}
          className={compact ? 'h-6 max-w-[8.5rem]' : 'h-7 max-w-[10rem]'}
        />
        <p
          className={[
            'mt-0 truncate text-[11px] leading-none',
            onDark ? 'text-blue-100/80' : 'text-secondary-500',
          ].join(' ')}
        >
          主播服务中台
        </p>
      </div>
    </div>
  )
}
