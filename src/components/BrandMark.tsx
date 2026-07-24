/**
 * logo-1.png：公司图形标（彩色，用于白底/浅色顶栏）
 * logo.png：公司图形标（纯白，用于蓝色品牌区）
 * logo-2：项目名「悦总统」字标（白底用 dark 版，蓝底用白字版）
 */

type BrandMarkProps = {
  className?: string
}

/** 彩色公司标（浅色背景） */
export function CompanyLogo({ className = 'h-9 w-9' }: BrandMarkProps) {
  return (
    <img
      src="/logo-1.png"
      alt="公司标识"
      className={`object-contain ${className}`}
    />
  )
}

/** 纯白公司标（深蓝/品牌色背景） */
export function CompanyLogoLight({ className = 'h-9 w-9' }: BrandMarkProps) {
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

/** 浅色顶栏/侧栏：彩色 logo-1 + 深色字标（不含副标题） */
export function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex items-center ${compact ? 'gap-1.5' : 'gap-2'}`}>
      <CompanyLogo className={compact ? 'h-8 w-8' : 'h-9 w-9'} />
      <ProjectWordmark
        variant="dark"
        className={compact ? 'h-6 max-w-[8.5rem]' : 'h-7 max-w-[10rem]'}
      />
    </div>
  )
}
