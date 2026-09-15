import 'server-only'

type DiagnosticEvent =
  | 'health_unavailable'
  | 'processing_stalled'
  | 'media_cleanup_pending'
  | 'source_cleanup_pending'
  | 'lifecycle_audit_pending'
  | 'media_cycle_completed'
  | 'media_cycle_failed'

// Deliberately accept no exception bodies, request data, credentials, or member email.
export function logMediaDiagnostic(
  level: 'info' | 'error',
  event: DiagnosticEvent,
  recordID?: number,
) {
  console[level](
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      event,
      ...(recordID === undefined ? {} : { recordID }),
    }),
  )
}
