type HeaderResponse = {
  setHeader(name: string, value: string): void
}

export function securityHeaders(
  _request: unknown,
  response: HeaderResponse,
  next: () => void,
) {
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('X-Frame-Options', 'DENY')
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()',
  )
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; frame-ancestors 'none'",
  )
  next()
}
