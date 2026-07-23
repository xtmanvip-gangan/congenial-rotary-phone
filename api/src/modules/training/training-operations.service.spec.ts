import { describe, expect, it } from 'vitest'
import { trainingWeekStart } from './training-operations.service.js'

describe('trainingWeekStart', () => {
  it('统一按周一生成每周反馈周期', () => {
    expect(
      trainingWeekStart(new Date('2026-07-23T10:00:00.000Z')).toISOString(),
    ).toBe('2026-07-20T00:00:00.000Z')
  })
})
