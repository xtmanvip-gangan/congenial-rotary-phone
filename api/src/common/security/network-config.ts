export function resolveApiListenHost(
  environment: {
    NODE_ENV?: string
    API_HOST?: string
  },
) {
  const configuredHost = environment.API_HOST?.trim()
  if (configuredHost) return configuredHost
  return environment.NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0'
}
