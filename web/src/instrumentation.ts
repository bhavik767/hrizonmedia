export async function register() {
  if (process.env.NEXT_RUNTIME === 'edge') return

  const { recoverStagingMediaFolderSchema } = await import('./members/staging-schema-recovery')
  const { bootstrapStagingPlatformAdministrator } =
    await import('./members/staging-platform-administrator')
  await recoverStagingMediaFolderSchema()
  await bootstrapStagingPlatformAdministrator()
}
