import 'server-only'

import type { TranscodeMetadataReason } from './providers/errors'

type DiagnosticEvent =
  | 'health_unavailable'
  | 'processing_stalled'
  | 'processing_dispatch_invalid'
  | 'processing_dispatch_rejected'
  | 'processing_dispatch_unavailable'
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
  metadataReason?: TranscodeMetadataReason,
) {
  console[level](
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      event,
      ...(recordID === undefined ? {} : { recordID }),
      ...(metadataReason === undefined ? {} : { metadataReason }),
    }),
  )
}
