import { describe, expect, it } from 'vitest'
import { resolveApiListenHost } from './network-config.js'

describe('resolveApiListenHost', () => {
  it('生产环境默认只监听本机回环地址', () => {
    expect(resolveApiListenHost({ NODE_ENV: 'production' })).toBe('127.0.0.1')
  })

  it('开发环境默认允许局域网访问并支持显式覆盖', () => {
    expect(resolveApiListenHost({ NODE_ENV: 'development' })).toBe('0.0.0.0')
    expect(
      resolveApiListenHost({
        NODE_ENV: 'production',
        API_HOST: '10.0.0.8',
      }),
    ).toBe('10.0.0.8')
  })
})
