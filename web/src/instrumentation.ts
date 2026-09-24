export async function register() {
  if (process.env.NEXT_RUNTIME === 'edge') return

  const { bootstrapStagingPlatformAdministrator } =
    await import('./members/staging-platform-administrator')
  await bootstrapStagingPlatformAdministrator()
}
