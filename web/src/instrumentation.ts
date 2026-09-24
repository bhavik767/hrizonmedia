export async function register() {
  if (process.env.NEXT_RUNTIME === 'edge') return

  const { purgeStagingNonPlatformMembers, recoverStagingMediaFolderSchema } =
    await import('./members/staging-schema-recovery')
  const { bootstrapStagingPlatformAdministrator } =
    await import('./members/staging-platform-administrator')
  await recoverStagingMediaFolderSchema()
  await purgeStagingNonPlatformMembers(process.env.STAGING_PLATFORM_ADMIN_EMAIL)
  await bootstrapStagingPlatformAdministrator()
}
