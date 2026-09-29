export function attemptSupersessionMarkerKey(processingJobId, attempt) {
  return `transcode-control/${processingJobId}/attempt-${attempt}.superseded`
}
