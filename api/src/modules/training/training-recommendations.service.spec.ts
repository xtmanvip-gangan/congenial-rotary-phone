import { describe, expect, it } from 'vitest'
import { systemRecommendationSequences } from './training-recommendations.service.js'

describe('systemRecommendationSequences', () => {
  it('基础课未完成时只推荐课程1-3', () => {
    expect(systemRecommendationSequences([1])).toEqual([1, 2, 3])
  })

  it('课程1-3全部完成后推荐未完成的课程4-7', () => {
    expect(systemRecommendationSequences([1, 2, 3, 5])).toEqual([4, 6, 7])
  })
})
