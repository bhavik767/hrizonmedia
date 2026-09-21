export interface ProtectedPlaybackBrowser {
  keySystem: 'com.widevine.alpha'
  manifestFormat: 'dash'
}

export const widevinePlaybackBrowser: ProtectedPlaybackBrowser = {
  keySystem: 'com.widevine.alpha',
  manifestFormat: 'dash',
}

export class PlaybackCompatibilityError extends Error {
  readonly status = 422

  constructor(message: string) {
    super(message)
  }
}

const WIDEVINE_BROWSER = /(?:Chrome|Edg|EdgA)\/\d+/i
const UNVERIFIED_CHROMIUM_BROWSER = /(?:CriOS|EdgiOS|OPR|SamsungBrowser)\//i

export function protectedPlaybackBrowser(
  userAgent: string | null,
  widevineAvailable: boolean,
): ProtectedPlaybackBrowser {
  if (
    userAgent &&
    widevineAvailable &&
    WIDEVINE_BROWSER.test(userAgent) &&
    !UNVERIFIED_CHROMIUM_BROWSER.test(userAgent)
  ) {
    return widevinePlaybackBrowser
  }

  throw new PlaybackCompatibilityError(
    'Secure playback is not supported by this browser. Use a current Chrome or Microsoft Edge browser with Widevine DRM enabled.',
  )
}

export function isProtectedPlaybackBrowser(value: unknown): value is ProtectedPlaybackBrowser {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as ProtectedPlaybackBrowser).keySystem === 'com.widevine.alpha' &&
    (value as ProtectedPlaybackBrowser).manifestFormat === 'dash'
  )
}
