type WecomLoginSuccess = {
  code?: string
}

declare const process: {
  env: {
    TARO_ENV?: string
  }
}

type WecomLoginOptions = {
  success?: (result: WecomLoginSuccess) => void
  fail?: (error: unknown) => void
}

type WecomBridge = {
  qy?: {
    login?: (options: WecomLoginOptions) => void
  }
}

function getWecomBridge(): WecomBridge | undefined {
  return (globalThis as { wx?: WecomBridge }).wx
}

export function isWeappEnv() {
  return process.env.TARO_ENV === 'weapp'
}

export function canUseWecomMiniappLogin() {
  return Boolean(isWeappEnv() && getWecomBridge()?.qy?.login)
}

export function shouldUseMockMode() {
  return !canUseWecomMiniappLogin()
}

export function requestWecomLoginCode() {
  return new Promise<string>((resolve, reject) => {
    const login = getWecomBridge()?.qy?.login

    if (!login) {
      reject(new Error('当前环境不是企业微信小程序，已切换到预览模式。'))
      return
    }

    login({
      success: (result) => {
        if (result.code) {
          resolve(result.code)
          return
        }

        reject(new Error('企业微信未返回登录凭证，请稍后重试。'))
      },
      fail: (error) => {
        console.error('[MiniappAuth] 企业微信登录失败', error)
        reject(new Error('企业微信登录失败，请稍后重试。'))
      },
    })
  })
}
