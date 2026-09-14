import type { Payload } from 'payload'

export async function cleanMediaRecords(payload: Payload): Promise<void> {
  await payload.delete({ collection: 'playback-grants', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'processing-jobs', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'upload-sessions', overrideAccess: true, where: {} })
  await payload.delete({ collection: 'media-assets', overrideAccess: true, where: {} })
}
