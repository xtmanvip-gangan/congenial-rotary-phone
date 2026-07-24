import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  BookOpen,
  CalendarDays,
  ClipboardList,
  Download,
  FolderKanban,
  GraduationCap,
  Home,
  LayoutDashboard,
  ListChecks,
  Radio,
  Settings2,
  ShieldAlert,
  UserCheck,
  Users,
  UsersRound,
} from 'lucide-react'
import type { AppRole } from './auth'

export type NavItem = {
  label: string
  to: string
  icon: LucideIcon
  /** 精确匹配时才高亮（用于首页类路径） */
  end?: boolean
}

export type NavGroup = {
  title: string
  items: NavItem[]
}

export function formatRoleLabel(role: AppRole) {
  if (role === 'anchor') return '主播'
  if (role === 'operator') return '运营老师'
  if (role === 'audit_teacher') return '审核老师'
  if (role === 'training_teacher') return '培训老师'
  if (role === 'training_admin') return '培训管理员'
  return '超级管理员'
}

/** 员工后台左侧菜单：分组 + 一级链接 */
export function getStaffNavGroups(role: AppRole): NavGroup[] {
  if (role === 'super_admin') {
    return [
      {
        title: '总览',
        items: [
          {
            label: '后台首页',
            to: '/admin/dashboard',
            icon: LayoutDashboard,
            end: true,
          },
        ],
      },
      {
        title: '人员与主播',
        items: [
          { label: '员工与角色', to: '/admin/staff', icon: Users },
          { label: '主播激活', to: '/audit/activations', icon: UserCheck },
          { label: '主播与归属', to: '/operator/anchors', icon: UsersRound },
        ],
      },
      {
        title: '礼物业务',
        items: [
          { label: '活动记录', to: '/admin/records', icon: ClipboardList },
          { label: '活动管理', to: '/admin/activities', icon: FolderKanban },
          { label: '规则管理', to: '/admin/rules', icon: Settings2 },
          { label: '导出中心', to: '/admin/exports', icon: Download },
        ],
      },
      {
        title: '培训中心',
        items: [
          { label: '课程管理', to: '/training/courses', icon: BookOpen },
          { label: '排课与场次', to: '/training/sessions', icon: CalendarDays },
          { label: '参会处理', to: '/training/attendance', icon: ListChecks },
          { label: '培训代报名', to: '/operator/training', icon: GraduationCap },
          { label: '培训运营', to: '/training/operations', icon: Activity },
        ],
      },
      {
        title: '运维',
        items: [
          { label: '任务与异常', to: '/operations', icon: ShieldAlert },
        ],
      },
    ]
  }

  if (role === 'operator') {
    return [
      {
        title: '工作台',
        items: [{ label: '今日工作台', to: '/staff/home', icon: Home }],
      },
      {
        title: '主播孵化',
        items: [
          { label: '我的主播', to: '/operator/anchors', icon: UsersRound },
        ],
      },
      {
        title: '培训',
        items: [
          { label: '培训代报名', to: '/operator/training', icon: CalendarDays },
          { label: '反馈与问题', to: '/training/operations', icon: BookOpen },
        ],
      },
      {
        title: '礼物活动',
        items: [
          { label: '活动记录', to: '/admin/records', icon: ClipboardList },
          { label: '规则管理', to: '/admin/rules', icon: Settings2 },
          { label: '导出中心', to: '/admin/exports', icon: Download },
        ],
      },
    ]
  }

  if (role === 'audit_teacher') {
    return [
      {
        title: '工作台',
        items: [{ label: '今日工作台', to: '/staff/home', icon: Home }],
      },
      {
        title: '主播开通',
        items: [
          { label: '主播激活', to: '/audit/activations', icon: UserCheck },
        ],
      },
    ]
  }

  if (role === 'training_admin') {
    return [
      {
        title: '工作台',
        items: [{ label: '今日工作台', to: '/staff/home', icon: Home }],
      },
      {
        title: '课程',
        items: [
          { label: '课程管理', to: '/training/courses', icon: BookOpen },
          { label: '排课与场次', to: '/training/sessions', icon: CalendarDays },
        ],
      },
      {
        title: '执行',
        items: [
          { label: '参会处理', to: '/training/attendance', icon: ListChecks },
          { label: '问题与周会', to: '/training/operations', icon: Activity },
        ],
      },
      {
        title: '主播',
        items: [
          { label: '主播激活', to: '/audit/activations', icon: UserCheck },
        ],
      },
      {
        title: '运维',
        items: [
          { label: '任务与异常', to: '/operations', icon: ShieldAlert },
        ],
      },
    ]
  }

  if (role === 'training_teacher') {
    return [
      {
        title: '工作台',
        items: [{ label: '今日工作台', to: '/staff/home', icon: Home }],
      },
      {
        title: '执行',
        items: [
          { label: '场次执行', to: '/training/sessions', icon: Radio },
          { label: '参会处理', to: '/training/attendance', icon: ListChecks },
          { label: '问题池', to: '/training/operations', icon: BookOpen },
        ],
      },
    ]
  }

  return [
    {
      title: '工作台',
      items: [{ label: '今日工作台', to: '/staff/home', icon: Home }],
    },
  ]
}

export function isStaffRole(role: AppRole) {
  return role !== 'anchor'
}
