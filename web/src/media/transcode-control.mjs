export const CMAF_COMPLETION_MARKER_VERSION = 2
export const CMAF_PACKAGE_TYPE = 'cmaf'

export function attemptSupersessionMarkerKey(processingJobId, attempt) {
  return `transcode-control/${processingJobId}/attempt-${attempt}.superseded`
}

export function hasFairPlayProtection(masterPlaylist, mediaPlaylists) {
  if (!/^#EXTM3U/m.test(masterPlaylist) || mediaPlaylists.length === 0) return false
  return mediaPlaylists.every((playlist) => {
    if (!/^#EXTM3U/m.test(playlist)) return false
    return playlist.split(/\r?\n/).some(
      (line) =>
        /^#EXT-X-KEY:/i.test(line) &&
        /(?:^|,)METHOD=SAMPLE-AES(?:,|$)/i.test(line.slice('#EXT-X-KEY:'.length)) &&
        /(?:^|,)KEYFORMAT="com\.apple\.streamingkeydelivery"(?:,|$)/i.test(
          line.slice('#EXT-X-KEY:'.length),
        ) &&
        /(?:^|,)URI="skd:\/\/[^"\s]+"(?:,|$)/i.test(line.slice('#EXT-X-KEY:'.length)),
    )
  })
}

export function processingDrmContentId(processingJobId) {
  const match =
    /^processing_([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})$/.exec(
      processingJobId,
    )
  if (!match) throw new Error('Processing Job ID is invalid.')
  return `drm${match.slice(1).join('')}`
}
