export function attemptSupersessionMarkerKey(processingJobId, attempt) {
  return `transcode-control/${processingJobId}/attempt-${attempt}.superseded`
}

export function processingDrmContentId(processingJobId) {
  const match =
    /^processing_([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})$/.exec(
      processingJobId,
    )
  if (!match) throw new Error('Processing Job ID is invalid.')
  return `drm${match.slice(1).join('')}`
}
