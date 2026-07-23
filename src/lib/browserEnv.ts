export function getUserAgent() {
  if (typeof window === 'undefined') {
    return ''
  }

  return window.navigator.userAgent || ''
}

export function isWecomEnvironment(userAgent = getUserAgent()) {
  const normalized = userAgent.toLowerCase()
  return normalized.includes('wxwork')
}

export function getCurrentPageUrl() {
  if (typeof window === 'undefined') {
    return ''
  }

  return window.location.href
}
