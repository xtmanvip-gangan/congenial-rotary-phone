export function resolveApiListenHost(
  environment: Pick<NodeJS.ProcessEnv, 'NODE_ENV' | 'API_HOST'>,
) {
  const configuredHost = environment.API_HOST?.trim()
  if (configuredHost) return configuredHost
  return environment.NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0'
}
