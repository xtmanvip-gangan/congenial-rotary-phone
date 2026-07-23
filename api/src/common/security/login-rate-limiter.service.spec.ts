import { HttpException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { LoginRateLimiterService } from './login-rate-limiter.service.js'

describe('LoginRateLimiterService', () => {
  it('同一账号和来源连续失败达到上限后拒绝继续登录', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-23T10:00:00.000Z'))
    const service = new LoginRateLimiterService()

    for (let index = 0; index < 5; index += 1) {
      service.recordFailure('Admin', '10.0.0.1')
    }

    expect(() => service.assertAllowed('admin', '10.0.0.1')).toThrow(
      HttpException,
    )
    vi.useRealTimers()
  })

  it('成功登录后清除当前组合的失败计数', () => {
    const service = new LoginRateLimiterService()
    service.recordFailure('admin', '10.0.0.1')
    service.clear('admin', '10.0.0.1')
    expect(() => service.assertAllowed('admin', '10.0.0.1')).not.toThrow()
  })
})
