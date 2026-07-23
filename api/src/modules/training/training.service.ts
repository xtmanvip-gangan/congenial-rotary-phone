import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type {
  TrainingLearningType,
  TrainingRegistrationSource,
  TrainingRegistrationStatus,
} from '@prisma/client'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service.js'
import { AccessService } from '../access/access.service.js'
import type { AuthenticatedUser } from '../auth/auth.types.js'
import type { CompleteRegistrationDto } from './dto/complete-registration.dto.js'
import type { CreateCourseDto } from './dto/create-course.dto.js'
import type { CreateScheduleTemplateDto } from './dto/create-schedule-template.dto.js'
import type { CreateSessionDto } from './dto/create-session.dto.js'
import type { UpdateCourseDto } from './dto/update-course.dto.js'
import type { RescheduleSessionDto } from './dto/reschedule-session.dto.js'

const courseInclude = {
  materialLinks: {
    orderBy: {
      sortOrder: 'asc' as const,
    },
  },
} as const

const sessionInclude = {
  course: {
    include: courseInclude,
  },
  teacher: {
    select: {
      id: true,
      displayName: true,
    },
  },
  registrations: {
    select: {
      id: true,
      anchorProfileId: true,
      status: true,
      waitlistPosition: true,
      learningType: true,
    },
  },
} as const

@Injectable()
export class TrainingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async listCourses(currentUser: AuthenticatedUser) {
    const canManage = await this.canManageTraining(currentUser)
    const items = await this.prisma.trainingCourse.findMany({
      where: canManage ? undefined : { status: 'active' },
      include: courseInclude,
      orderBy: [{ sequence: 'asc' }, { createdAt: 'asc' }],
    })
    return { items: items.map((item) => this.formatCourse(item)) }
  }

  async createCourse(currentUser: AuthenticatedUser, dto: CreateCourseDto) {
    await this.requireTrainingAdmin(currentUser)
    const item = await this.prisma.trainingCourse.create({
      data: {
        code: dto.code.trim(),
        title: dto.title.trim(),
        level: dto.level,
        sequence: dto.sequence,
        summary: dto.summary?.trim() || null,
        objectives: dto.objectives ?? [],
        practiceTasks: dto.practiceTasks ?? [],
        faq: dto.faq ?? [],
        createdBy: currentUser.accountId,
        materialLinks: {
          create: (dto.materialLinks ?? []).map((link, index) => ({
            title: link.title.trim(),
            url: link.url.trim(),
            sortOrder: link.sortOrder ?? index,
          })),
        },
      },
      include: courseInclude,
    })
    return { item: this.formatCourse(item) }
  }

  async updateCourse(
    currentUser: AuthenticatedUser,
    courseId: string,
    dto: UpdateCourseDto,
  ) {
    await this.requireTrainingAdmin(currentUser)
    const existing = await this.prisma.trainingCourse.findUnique({
      where: { id: courseId },
      select: { id: true },
    })
    if (!existing) throw new NotFoundException('未找到课程')

    const item = await this.prisma.$transaction(async (tx) => {
      if (dto.materialLinks) {
        await tx.trainingMaterialLink.deleteMany({ where: { courseId } })
      }
      return tx.trainingCourse.update({
        where: { id: courseId },
        data: {
          code: dto.code?.trim(),
          title: dto.title?.trim(),
          level: dto.level,
          sequence: dto.sequence,
          summary:
            dto.summary === undefined ? undefined : dto.summary.trim() || null,
          objectives: dto.objectives,
          practiceTasks: dto.practiceTasks,
          faq: dto.faq,
          status: dto.status,
          ...(dto.materialLinks
            ? {
                materialLinks: {
                  create: dto.materialLinks.map((link, index) => ({
                    title: link.title.trim(),
                    url: link.url.trim(),
                    sortOrder: link.sortOrder ?? index,
                  })),
                },
              }
            : {}),
        },
        include: courseInclude,
      })
    })
    return { item: this.formatCourse(item) }
  }

  async listScheduleTemplates(currentUser: AuthenticatedUser) {
    await this.access.requireAnyRole(currentUser, [
      'training_teacher',
      'training_admin',
    ])
    const items = await this.prisma.trainingScheduleTemplate.findMany({
      include: {
        course: true,
        teacher: { select: { id: true, displayName: true } },
      },
      orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
    })
    return { items }
  }

  async createScheduleTemplate(
    currentUser: AuthenticatedUser,
    dto: CreateScheduleTemplateDto,
  ) {
    await this.requireTrainingAdmin(currentUser)
    this.validateClassWindow(dto.startTime, dto.durationMinutes)
    const item = await this.prisma.trainingScheduleTemplate.create({
      data: {
        courseId: dto.courseId,
        teacherId: dto.teacherId || null,
        weekday: dto.weekday,
        weekParity: dto.weekParity,
        startTime: dto.startTime,
        durationMinutes: dto.durationMinutes,
        capacity: dto.capacity,
        active: dto.active ?? true,
        createdBy: currentUser.accountId,
      },
      include: {
        course: true,
        teacher: { select: { id: true, displayName: true } },
      },
    })
    return { item }
  }

  async generateNextWeekDrafts(currentUser: AuthenticatedUser) {
    await this.requireTrainingAdmin(currentUser)
    const templates = await this.prisma.trainingScheduleTemplate.findMany({
      where: { active: true },
    })
    const nextMonday = this.nextMonday()
    const items = []

    for (const template of templates) {
      const sessionDate = new Date(nextMonday)
      sessionDate.setUTCDate(nextMonday.getUTCDate() + template.weekday - 1)
      if (!this.matchesWeekParity(sessionDate, template.weekParity)) continue
      const [hour, minute] = template.startTime.split(':').map(Number)
      const startAt = new Date(
        `${sessionDate.toISOString().slice(0, 10)}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+08:00`,
      )
      const endAt = new Date(
        startAt.getTime() + template.durationMinutes * 60_000,
      )
      const item = await this.prisma.trainingSession.upsert({
        where: {
          scheduleTemplateId_scheduledStartAt: {
            scheduleTemplateId: template.id,
            scheduledStartAt: startAt,
          },
        },
        create: {
          courseId: template.courseId,
          scheduleTemplateId: template.id,
          teacherId: template.teacherId,
          scheduledStartAt: startAt,
          scheduledEndAt: endAt,
          capacity: template.capacity,
          status: 'draft',
          createdBy: currentUser.accountId,
        },
        update: {},
        include: sessionInclude,
      })
      items.push(item)
    }
    return { items: items.map((item) => this.formatSession(item)) }
  }

  async listSessions(currentUser: AuthenticatedUser) {
    const canManage = await this.canExecuteTraining(currentUser)
    const anchorProfile = this.isAnchor(currentUser)
      ? await this.findAnchorProfileForUser(currentUser.wecomUserId)
      : null
    const items = await this.prisma.trainingSession.findMany({
      where: canManage
        ? undefined
        : {
            status: 'published',
            scheduledStartAt: { gt: new Date() },
          },
      include: sessionInclude,
      orderBy: { scheduledStartAt: 'asc' },
    })
    return {
      items: items.map((item) =>
        this.formatSession(item, anchorProfile?.id ?? null),
      ),
    }
  }

  async createSession(
    currentUser: AuthenticatedUser,
    dto: CreateSessionDto,
  ) {
    await this.requireTrainingAdmin(currentUser)
    const startAt = new Date(dto.scheduledStartAt)
    const endAt = new Date(dto.scheduledEndAt)
    this.validateSessionTimes(startAt, endAt)
    const item = await this.prisma.trainingSession.create({
      data: {
        courseId: dto.courseId,
        teacherId: dto.teacherId || null,
        scheduledStartAt: startAt,
        scheduledEndAt: endAt,
        capacity: dto.capacity,
        status: 'draft',
        createdBy: currentUser.accountId,
      },
      include: sessionInclude,
    })
    return { item: this.formatSession(item) }
  }

  async publishSession(currentUser: AuthenticatedUser, sessionId: string) {
    await this.requireTrainingAdmin(currentUser)
    const item = await this.prisma.trainingSession.findUnique({
      where: { id: sessionId },
    })
    if (!item) throw new NotFoundException('未找到培训场次')
    if (item.status !== 'draft' && item.status !== 'rescheduled') {
      throw new BadRequestException('当前场次不能发布')
    }
    const updated = await this.prisma.trainingSession.update({
      where: { id: sessionId },
      data: { status: 'published', publishedAt: new Date() },
      include: sessionInclude,
    })
    return { item: this.formatSession(updated) }
  }

  async rescheduleSession(
    currentUser: AuthenticatedUser,
    sessionId: string,
    dto: RescheduleSessionDto,
  ) {
    await this.requireTrainingAdmin(currentUser)
    const startAt = new Date(dto.scheduledStartAt)
    const endAt = new Date(dto.scheduledEndAt)
    this.validateSessionTimes(startAt, endAt)
    const existing = await this.prisma.trainingSession.findUnique({
      where: { id: sessionId },
    })
    if (!existing) throw new NotFoundException('未找到培训场次')
    if (['cancelled', 'ended'].includes(existing.status)) {
      throw new BadRequestException('已取消或已结束场次不能改期')
    }
    const item = await this.prisma.trainingSession.update({
      where: { id: sessionId },
      data: {
        scheduledStartAt: startAt,
        scheduledEndAt: endAt,
        status: 'rescheduled',
        publishedAt: null,
      },
      include: sessionInclude,
    })
    return { item: this.formatSession(item) }
  }

  async startSession(currentUser: AuthenticatedUser, sessionId: string) {
    await this.access.requireAnyRole(currentUser, [
      'training_teacher',
      'training_admin',
    ])
    const session = await this.prisma.trainingSession.findUnique({
      where: { id: sessionId },
    })
    if (!session) throw new NotFoundException('未找到培训场次')
    if (session.status !== 'published') {
      throw new BadRequestException('只有已发布场次可以开始')
    }
    await this.prisma.trainingSession.update({
      where: { id: sessionId },
      data: { status: 'in_progress' },
    })
    return { ok: true }
  }

  async endSession(currentUser: AuthenticatedUser, sessionId: string) {
    await this.access.requireAnyRole(currentUser, [
      'training_teacher',
      'training_admin',
    ])
    const session = await this.prisma.trainingSession.findUnique({
      where: { id: sessionId },
    })
    if (!session) throw new NotFoundException('未找到培训场次')
    if (
      session.status !== 'published' &&
      session.status !== 'in_progress'
    ) {
      throw new BadRequestException('当前场次不能结束')
    }
    await this.prisma.trainingSession.update({
      where: { id: sessionId },
      data: { status: 'ended' },
    })
    return { ok: true }
  }

  async cancelSession(
    currentUser: AuthenticatedUser,
    sessionId: string,
    reasonInput: string,
  ) {
    await this.requireTrainingAdmin(currentUser)
    const reason = reasonInput.trim()
    if (!reason) throw new BadRequestException('请填写取消原因')
    await this.prisma.$transaction([
      this.prisma.trainingSession.update({
        where: { id: sessionId },
        data: { status: 'cancelled', cancellationReason: reason },
      }),
      this.prisma.trainingRegistration.updateMany({
        where: {
          sessionId,
          status: { in: ['registered', 'waitlisted'] },
        },
        data: { status: 'cancelled', cancelledAt: new Date() },
      }),
    ])
    return { ok: true }
  }

  async registerSelf(currentUser: AuthenticatedUser, sessionId: string) {
    if (!this.isAnchor(currentUser)) {
      throw new ForbiddenException('只有主播可以本人报名')
    }
    const profile = await this.findAnchorProfileForUser(currentUser.wecomUserId)
    if (!profile) throw new ForbiddenException('主播档案尚未激活')
    return this.registerProfile(
      profile,
      sessionId,
      'anchor',
      currentUser.wecomUserId,
    )
  }

  async registerForAnchor(
    currentUser: AuthenticatedUser,
    anchorProfileId: string,
    sessionId: string,
  ) {
    await this.access.requireAnyRole(currentUser, ['operator'])
    const profile = await this.prisma.anchorProfile.findFirst({
      where: {
        id: anchorProfileId,
        currentOperatorId: currentUser.accountId ?? '',
        assignmentStatus: 'confirmed',
        status: 'active',
      },
      include: {
        currentOperator: true,
      },
    })
    if (!profile) {
      throw new ForbiddenException('只能为自己已确认归属的主播报名')
    }
    return this.registerProfile(
      profile,
      sessionId,
      'operator',
      currentUser.wecomUserId,
    )
  }

  async bulkRegisterForOperator(
    currentUser: AuthenticatedUser,
    anchorProfileIds: string[],
    sessionId: string,
  ) {
    const items = []
    for (const anchorProfileId of [...new Set(anchorProfileIds)]) {
      try {
        const result = await this.registerForAnchor(
          currentUser,
          anchorProfileId,
          sessionId,
        )
        items.push({ anchorProfileId, ok: true, ...result.item })
      } catch (error) {
        items.push({
          anchorProfileId,
          ok: false,
          message: error instanceof Error ? error.message : '报名失败',
        })
      }
    }
    return { items }
  }

  async registerForTrainingStaff(
    currentUser: AuthenticatedUser,
    anchorProfileId: string,
    sessionId: string,
  ) {
    await this.access.requireAnyRole(currentUser, [
      'training_teacher',
      'training_admin',
    ])
    const profile = await this.prisma.anchorProfile.findFirst({
      where: { id: anchorProfileId, status: 'active' },
      include: { currentOperator: true },
    })
    if (!profile) throw new NotFoundException('未找到有效主播档案')
    return this.registerProfile(
      profile,
      sessionId,
      'training_staff',
      currentUser.wecomUserId,
    )
  }

  async cancelSelf(
    currentUser: AuthenticatedUser,
    registrationId: string,
  ) {
    if (!this.isAnchor(currentUser)) {
      throw new ForbiddenException('只有主播可以取消自己的报名')
    }
    const profile = await this.findAnchorProfileForUser(currentUser.wecomUserId)
    if (!profile) throw new ForbiddenException('主播档案尚未激活')
    const registration = await this.prisma.trainingRegistration.findFirst({
      where: { id: registrationId, anchorProfileId: profile.id },
      include: { session: true },
    })
    if (!registration) throw new NotFoundException('未找到报名记录')
    if (registration.session.scheduledStartAt <= new Date()) {
      throw new BadRequestException('课程开始后不能自行取消')
    }
    if (
      registration.status !== 'registered' &&
      registration.status !== 'waitlisted'
    ) {
      throw new BadRequestException('当前报名状态不能取消')
    }

    await this.cancelRegistration(registration, profile.id)
    return { ok: true }
  }

  async cancelForOperator(
    currentUser: AuthenticatedUser,
    registrationId: string,
  ) {
    await this.access.requireAnyRole(currentUser, ['operator'])
    const registration = await this.prisma.trainingRegistration.findFirst({
      where: {
        id: registrationId,
        anchorProfile: {
          currentOperatorId: currentUser.accountId ?? '',
          assignmentStatus: 'confirmed',
        },
      },
      include: { session: true },
    })
    if (!registration) {
      throw new ForbiddenException('只能取消自己已确认归属主播的报名')
    }
    await this.cancelRegistration(registration, registration.anchorProfileId)
    return { ok: true }
  }

  async listOperatorRegistrations(currentUser: AuthenticatedUser) {
    await this.access.requireAnyRole(currentUser, ['operator'])
    const items = await this.prisma.trainingRegistration.findMany({
      where: {
        status: { in: ['registered', 'waitlisted'] },
        anchorProfile: {
          currentOperatorId: currentUser.accountId ?? '',
          assignmentStatus: 'confirmed',
        },
        session: {
          scheduledStartAt: { gt: new Date() },
        },
      },
      include: {
        session: {
          include: sessionInclude,
        },
      },
      orderBy: { registeredAt: 'desc' },
    })
    return {
      items: items.map((item) => ({
        id: item.id,
        anchorProfileId: item.anchorProfileId,
        anchorDisplayName: item.anchorNameSnapshot,
        status: item.status,
        waitlistPosition: item.waitlistPosition,
        session: this.formatSession(item.session),
      })),
    }
  }

  private async cancelRegistration(
    registration: any,
    anchorProfileId: string,
  ) {
    if (registration.session.scheduledStartAt <= new Date()) {
      throw new BadRequestException('课程开始后不能取消')
    }
    if (
      registration.status !== 'registered' &&
      registration.status !== 'waitlisted'
    ) {
      throw new BadRequestException('当前报名状态不能取消')
    }
    await this.withSerializableTransaction(async (tx) => {
      await tx.trainingRegistration.update({
        where: { id: registration.id },
        data: {
          status: 'cancelled',
          cancelledAt: new Date(),
          waitlistPosition: null,
        },
      })
      await tx.trainingLearningProgress.updateMany({
        where: {
          anchorProfileId,
          courseId: registration.session.courseId,
          status: 'registered',
        },
        data: { status: 'not_started' },
      })
      if (registration.status === 'registered') {
        const next = await tx.trainingRegistration.findFirst({
          where: {
            sessionId: registration.session.id,
            status: 'waitlisted',
          },
          orderBy: [{ waitlistPosition: 'asc' }, { registeredAt: 'asc' }],
        })
        if (next) {
          await tx.trainingRegistration.update({
            where: { id: next.id },
            data: {
              status: 'registered',
              waitlistPosition: null,
            },
          })
        }
      }
    })
  }

  async listMyTraining(currentUser: AuthenticatedUser) {
    if (!this.isAnchor(currentUser)) {
      throw new ForbiddenException('只有主播可以查看个人培训')
    }
    const profile = await this.findAnchorProfileForUser(currentUser.wecomUserId)
    if (!profile) return { registrations: [], progress: [] }
    const [registrations, progress, courses] = await Promise.all([
      this.prisma.trainingRegistration.findMany({
        where: { anchorProfileId: profile.id },
        include: { session: { include: sessionInclude } },
        orderBy: { registeredAt: 'desc' },
      }),
      this.prisma.trainingLearningProgress.findMany({
        where: { anchorProfileId: profile.id },
      }),
      this.prisma.trainingCourse.findMany({
        where: { status: 'active' },
        include: courseInclude,
        orderBy: [{ sequence: 'asc' }, { createdAt: 'asc' }],
      }),
    ])
    const progressMap = new Map(progress.map((item) => [item.courseId, item]))
    return {
      registrations: registrations.map((item) => ({
        id: item.id,
        status: item.status,
        learningType: item.learningType,
        waitlistPosition: item.waitlistPosition,
        session: this.formatSession(item.session, profile.id),
      })),
      progress: courses.map((course) => {
        const item = progressMap.get(course.id)
        return {
          course: this.formatCourse(course),
          status: item?.status ?? 'not_started',
          makeupStatus: item?.makeupStatus ?? 'none',
          firstLearnedAt: item?.firstLearnedAt?.toISOString() ?? null,
          lastLearnedAt: item?.lastLearnedAt?.toISOString() ?? null,
        }
      }),
    }
  }

  async listOperatorTrainingAnchors(currentUser: AuthenticatedUser) {
    await this.access.requireAnyRole(currentUser, ['operator'])
    const items = await this.prisma.anchorProfile.findMany({
      where: {
        currentOperatorId: currentUser.accountId ?? '',
        assignmentStatus: 'confirmed',
        status: 'active',
      },
      include: {
        trainingProgress: true,
      },
      orderBy: { anchorDisplayName: 'asc' },
    })
    return {
      items: items.map((item) => ({
        id: item.id,
        anchorDisplayName: item.anchorDisplayName,
        learnedCourseIds: item.trainingProgress
          .filter((progress) => progress.status === 'learned')
          .map((progress) => progress.courseId),
      })),
    }
  }

  async listSessionRoster(
    currentUser: AuthenticatedUser,
    sessionId: string,
  ) {
    await this.access.requireAnyRole(currentUser, [
      'training_teacher',
      'training_admin',
    ])
    const items = await this.prisma.trainingRegistration.findMany({
      where: { sessionId },
      include: {
        anchorProfile: {
          include: {
            wecomUser: { select: { wecomName: true } },
          },
        },
      },
      orderBy: [
        { status: 'asc' },
        { waitlistPosition: 'asc' },
        { registeredAt: 'asc' },
      ],
    })
    return {
      items: items.map((item) => ({
        id: item.id,
        anchorProfileId: item.anchorProfileId,
        anchorDisplayName: item.anchorNameSnapshot,
        wecomName: item.anchorProfile.wecomUser.wecomName ?? '',
        operatorName: item.operatorNameSnapshot,
        status: item.status,
        learningType: item.learningType,
        waitlistPosition: item.waitlistPosition,
        outcomeReason: item.outcomeReason,
      })),
    }
  }

  async recordOutcome(
    currentUser: AuthenticatedUser,
    registrationId: string,
    dto: CompleteRegistrationDto,
  ) {
    await this.access.requireAnyRole(currentUser, [
      'training_teacher',
      'training_admin',
    ])
    const reason = dto.reason?.trim() || ''
    if (dto.status !== 'learned' && !reason) {
      throw new BadRequestException('非已学习结论必须填写原因')
    }
    const registration = await this.prisma.trainingRegistration.findFirst({
      where: {
        id: registrationId,
        status: { in: ['registered', 'waitlisted', 'needs_makeup'] },
      },
      include: { session: true },
    })
    if (!registration) throw new NotFoundException('未找到可处理的报名记录')
    const now = new Date()
    await this.prisma.$transaction(async (tx) => {
      await tx.trainingRegistration.update({
        where: { id: registration.id },
        data: {
          status: dto.status,
          outcomeReason: reason || null,
          outcomeBy: currentUser.wecomUserId,
          outcomeAt: now,
        },
      })
      if (dto.status === 'learned') {
        await tx.trainingLearningProgress.upsert({
          where: {
            anchorProfileId_courseId: {
              anchorProfileId: registration.anchorProfileId,
              courseId: registration.session.courseId,
            },
          },
          create: {
            anchorProfileId: registration.anchorProfileId,
            courseId: registration.session.courseId,
            status: 'learned',
            makeupStatus:
              registration.learningType === 'makeup' ? 'made_up' : 'none',
            firstLearnedAt: now,
            lastLearnedAt: now,
          },
          update: {
            status: 'learned',
            makeupStatus:
              registration.learningType === 'makeup' ? 'made_up' : undefined,
            lastLearnedAt: now,
          },
        })
      } else if (dto.status === 'needs_makeup') {
        await tx.trainingLearningProgress.upsert({
          where: {
            anchorProfileId_courseId: {
              anchorProfileId: registration.anchorProfileId,
              courseId: registration.session.courseId,
            },
          },
          create: {
            anchorProfileId: registration.anchorProfileId,
            courseId: registration.session.courseId,
            status: 'registered',
            makeupStatus: 'needs_relearning',
          },
          update: {
            makeupStatus: 'needs_relearning',
          },
        })
      }
    })
    return { ok: true }
  }

  private async registerProfile(
    profile: any,
    sessionId: string,
    source: TrainingRegistrationSource,
    registeredBy: string,
  ) {
    const session = await this.prisma.trainingSession.findFirst({
      where: {
        id: sessionId,
        status: 'published',
        scheduledStartAt: { gt: new Date() },
      },
      include: { course: true },
    })
    if (!session) {
      throw new BadRequestException('当前场次未开放报名或已经开始')
    }

    const item = await this.withSerializableTransaction(async (tx) => {
      const existing = await tx.trainingRegistration.findUnique({
        where: {
          anchorProfileId_sessionId: {
            anchorProfileId: profile.id,
            sessionId,
          },
        },
      })
      if (existing && existing.status !== 'cancelled') {
        return existing
      }
      const progress = await tx.trainingLearningProgress.findUnique({
        where: {
          anchorProfileId_courseId: {
            anchorProfileId: profile.id,
            courseId: session.courseId,
          },
        },
      })
      const learningType: TrainingLearningType =
        progress?.makeupStatus === 'needs_relearning' ||
        progress?.makeupStatus === 'waiting_makeup'
          ? 'makeup'
          : progress?.status === 'learned'
            ? 'review'
            : 'first_learning'
      const occupied = await tx.trainingRegistration.count({
        where: {
          sessionId,
          status: 'registered',
        },
      })
      let status: TrainingRegistrationStatus = 'registered'
      let waitlistPosition: number | null = null
      if (occupied >= session.capacity) {
        status = 'waitlisted'
        const maximum = await tx.trainingRegistration.aggregate({
          where: { sessionId, status: 'waitlisted' },
          _max: { waitlistPosition: true },
        })
        waitlistPosition = (maximum._max.waitlistPosition ?? 0) + 1
      }
      const registration = await tx.trainingRegistration.upsert({
        where: {
          anchorProfileId_sessionId: {
            anchorProfileId: profile.id,
            sessionId,
          },
        },
        create: {
          anchorProfileId: profile.id,
          sessionId,
          operatorIdSnapshot: profile.currentOperatorId,
          operatorNameSnapshot: profile.currentOperator?.displayName ?? null,
          anchorNameSnapshot: profile.anchorDisplayName,
          source,
          status,
          learningType,
          waitlistPosition,
          registeredBy,
        },
        update: {
          operatorIdSnapshot: profile.currentOperatorId,
          operatorNameSnapshot: profile.currentOperator?.displayName ?? null,
          anchorNameSnapshot: profile.anchorDisplayName,
          source,
          status,
          learningType,
          waitlistPosition,
          registeredBy,
          registeredAt: new Date(),
          cancelledAt: null,
          outcomeReason: null,
          outcomeBy: null,
          outcomeAt: null,
        },
      })
      await tx.trainingLearningProgress.upsert({
        where: {
          anchorProfileId_courseId: {
            anchorProfileId: profile.id,
            courseId: session.courseId,
          },
        },
        create: {
          anchorProfileId: profile.id,
          courseId: session.courseId,
          status: 'registered',
          makeupStatus: learningType === 'makeup' ? 'waiting_makeup' : 'none',
        },
        update:
          progress?.status === 'learned'
            ? {}
            : {
                status: 'registered',
                makeupStatus:
                  learningType === 'makeup' ? 'waiting_makeup' : undefined,
              },
      })
      return registration
    })
    return { item: this.formatRegistration(item) }
  }

  private async findAnchorProfileForUser(wecomUserId: string) {
    return this.prisma.anchorProfile.findFirst({
      where: {
        status: 'active',
        wecomUser: { wecomUserId },
      },
      include: {
        currentOperator: true,
      },
    })
  }

  private async withSerializableTransaction<T>(
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(callback, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        })
      } catch (error: any) {
        if (error?.code !== 'P2034' || attempt === 3) throw error
      }
    }
    throw new BadRequestException('报名人数变化较快，请重新操作')
  }

  private isAnchor(user: AuthenticatedUser) {
    return user.role === 'anchor' && user.loginType === 'wecom_miniapp'
  }

  private async canManageTraining(user: AuthenticatedUser) {
    if (user.role === 'super_admin') {
      await this.access.requirePasswordSuperAdmin(user)
      return true
    }
    if (user.loginType === 'wecom_staff' && user.roles.includes('training_admin')) {
      await this.access.requireAnyRole(user, ['training_admin'])
      return true
    }
    if (
      this.isAnchor(user) ||
      (user.loginType === 'wecom_staff' &&
        user.roles.some((role) =>
          ['operator', 'training_teacher'].includes(role),
        ))
    ) {
      return false
    }
    throw new ForbiddenException('当前账号没有培训课程权限')
  }

  private async canExecuteTraining(user: AuthenticatedUser) {
    if (user.role === 'super_admin') {
      await this.access.requirePasswordSuperAdmin(user)
      return true
    }
    if (
      user.loginType === 'wecom_staff' &&
      user.roles.some((role) =>
        ['training_teacher', 'training_admin'].includes(role),
      )
    ) {
      await this.access.requireAnyRole(user, [
        'training_teacher',
        'training_admin',
      ])
      return true
    }
    if (this.isAnchor(user) || user.roles.includes('operator')) return false
    throw new ForbiddenException('当前账号没有培训场次权限')
  }

  private async requireTrainingAdmin(user: AuthenticatedUser) {
    if (user.role === 'super_admin') {
      await this.access.requirePasswordSuperAdmin(user)
      return
    }
    await this.access.requireAnyRole(user, ['training_admin'])
  }

  private validateClassWindow(startTime: string, durationMinutes: number) {
    const [hour, minute] = startTime.split(':').map(Number)
    const startMinutes = hour * 60 + minute
    const endMinutes = startMinutes + durationMinutes
    if (startMinutes < 18 * 60 || endMinutes > 20 * 60) {
      throw new BadRequestException('课程必须安排在18:00—20:00之间')
    }
  }

  private validateSessionTimes(startAt: Date, endAt: Date) {
    if (
      Number.isNaN(startAt.getTime()) ||
      Number.isNaN(endAt.getTime()) ||
      endAt <= startAt
    ) {
      throw new BadRequestException('场次时间不正确')
    }
    const duration = (endAt.getTime() - startAt.getTime()) / 60_000
    if (duration > 60) throw new BadRequestException('单场课程不能超过60分钟')
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Shanghai',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
    const start = formatter.format(startAt)
    this.validateClassWindow(start, duration)
  }

  private nextMonday() {
    const now = new Date()
    const day = now.getUTCDay() || 7
    const daysUntilNextMonday = 8 - day
    return new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + daysUntilNextMonday,
      ),
    )
  }

  private matchesWeekParity(date: Date, parity: 'every' | 'a' | 'b') {
    if (parity === 'every') return true
    const firstDay = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
    const week = Math.ceil(
      ((date.getTime() - firstDay.getTime()) / 86_400_000 +
        firstDay.getUTCDay() +
        1) /
        7,
    )
    return parity === 'a' ? week % 2 === 1 : week % 2 === 0
  }

  private formatCourse(item: any) {
    return {
      id: item.id,
      code: item.code,
      title: item.title,
      level: item.level,
      sequence: item.sequence,
      summary: item.summary,
      objectives: Array.isArray(item.objectives) ? item.objectives : [],
      practiceTasks: Array.isArray(item.practiceTasks)
        ? item.practiceTasks
        : [],
      faq: Array.isArray(item.faq) ? item.faq : [],
      status: item.status,
      materialLinks: item.materialLinks ?? [],
    }
  }

  private formatSession(item: any, anchorProfileId: string | null = null) {
    const registeredCount = (item.registrations ?? []).filter(
      (registration: any) => registration.status === 'registered',
    ).length
    const waitlistCount = (item.registrations ?? []).filter(
      (registration: any) => registration.status === 'waitlisted',
    ).length
    const myRegistration = anchorProfileId
      ? item.registrations?.find(
          (registration: any) =>
            registration.anchorProfileId === anchorProfileId,
        )
      : null
    return {
      id: item.id,
      course: this.formatCourse(item.course),
      teacher: item.teacher ?? null,
      scheduledStartAt: item.scheduledStartAt.toISOString(),
      scheduledEndAt: item.scheduledEndAt.toISOString(),
      capacity: item.capacity,
      status: item.status,
      registeredCount,
      waitlistCount,
      remainingSeats: Math.max(0, item.capacity - registeredCount),
      myRegistration: myRegistration
        ? this.formatRegistration(myRegistration)
        : null,
    }
  }

  private formatRegistration(item: any) {
    return {
      id: item.id,
      status: item.status,
      waitlistPosition: item.waitlistPosition ?? null,
      learningType: item.learningType,
    }
  }
}
