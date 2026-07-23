export type ReviewStatus = 'pending' | 'approved' | 'rejected'
export type GrantStatus = 'pending' | 'granted'
export type ActivityStatus = 'draft' | 'active' | 'ended' | 'disabled'

export const reviewStatusTextMap: Record<ReviewStatus, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回',
}

export const reviewStatusClassMap: Record<ReviewStatus, string> = {
  pending:
    'inline-flex items-center rounded-full border border-amber-100 bg-amber-50/90 px-3 py-1 text-xs font-semibold text-amber-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]',
  approved:
    'inline-flex items-center rounded-full border border-emerald-100 bg-emerald-50/90 px-3 py-1 text-xs font-semibold text-emerald-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]',
  rejected:
    'inline-flex items-center rounded-full border border-rose-100 bg-rose-50/90 px-3 py-1 text-xs font-semibold text-rose-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]',
}

export const grantStatusTextMap: Record<GrantStatus, string> = {
  pending: '待发放',
  granted: '已发放',
}

export const grantStatusClassMap: Record<GrantStatus, string> = {
  pending:
    'inline-flex items-center rounded-full border border-sky-100 bg-sky-50/90 px-3 py-1 text-xs font-semibold text-sky-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]',
  granted:
    'inline-flex items-center rounded-full border border-emerald-100 bg-emerald-50/90 px-3 py-1 text-xs font-semibold text-emerald-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]',
}

export const activityStatusTextMap: Record<ActivityStatus, string> = {
  draft: '草稿',
  active: '启用中',
  ended: '已结束',
  disabled: '已停用',
}

export const activityStatusClassMap: Record<ActivityStatus, string> = {
  draft:
    'inline-flex items-center rounded-full border border-slate-200 bg-slate-100/90 px-3 py-1 text-xs font-semibold text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]',
  active:
    'inline-flex items-center rounded-full border border-brand-100 bg-brand-50/90 px-3 py-1 text-xs font-semibold text-brand-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]',
  ended:
    'inline-flex items-center rounded-full border border-amber-100 bg-amber-50/90 px-3 py-1 text-xs font-semibold text-amber-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]',
  disabled:
    'inline-flex items-center rounded-full border border-rose-100 bg-rose-50/90 px-3 py-1 text-xs font-semibold text-rose-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]',
}
