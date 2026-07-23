import { HttpException, HttpStatus, Injectable } from '@nestjs/common'

const WINDOW_MS = 15 * 60_000
const MAX_FAILURES = 5

type Attempt = {
  failures: number
  firstFailureAt: number
}

@Injectable()
export class LoginRateLimiterService {
  private readonly attempts = new Map<string, Attempt>()

  assertAllowed(username: string, source: string) {
    const key = this.key(username, source)
    const attempt = this.attempts.get(key)
    if (!attempt) return
    if (Date.now() - attempt.firstFailureAt >= WINDOW_MS) {
      this.attempts.delete(key)
      return
    }
    if (attempt.failures >= MAX_FAILURES) {
      throw new HttpException(
        '登录失败次数过多，请15分钟后再试',
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }
  }

  recordFailure(username: string, source: string) {
    const key = this.key(username, source)
    const existing = this.attempts.get(key)
    if (!existing || Date.now() - existing.firstFailureAt >= WINDOW_MS) {
      this.attempts.set(key, { failures: 1, firstFailureAt: Date.now() })
      return
    }
    existing.failures += 1
  }

  clear(username: string, source: string) {
    this.attempts.delete(this.key(username, source))
  }

  private key(username: string, source: string) {
    return `${username.trim().toLowerCase()}:${source || 'unknown'}`
  }
}
