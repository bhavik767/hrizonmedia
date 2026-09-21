export interface WidevinePlaybackBrowser {
  keySystem: 'com.widevine.alpha'
  manifestFormat: 'dash'
}

export interface FairPlayPlaybackBrowser {
  keySystem: 'com.apple.fps'
  manifestFormat: 'hls'
}
export interface PlayReadyPlaybackBrowser { keySystem: 'com.microsoft.playready'; manifestFormat: 'dash' }

export type ProtectedPlaybackBrowser = FairPlayPlaybackBrowser | PlayReadyPlaybackBrowser | WidevinePlaybackBrowser

export const widevinePlaybackBrowser: WidevinePlaybackBrowser = {
  keySystem: 'com.widevine.alpha',
  manifestFormat: 'dash',
}

export const fairPlayPlaybackBrowser: FairPlayPlaybackBrowser = {
  keySystem: 'com.apple.fps',
  manifestFormat: 'hls',
}
export const playReadyPlaybackBrowser: PlayReadyPlaybackBrowser = { keySystem: 'com.microsoft.playready', manifestFormat: 'dash' }

export class PlaybackCompatibilityError extends Error {
  readonly status = 422

  constructor(message: string) {
    super(message)
  }
}

const WIDEVINE_BROWSER = /(?:Chrome|Edg|EdgA)\/\d+/i
const PLAYREADY_BROWSER = /(?:Edg|EdgA)\/\d+/i
const UNVERIFIED_CHROMIUM_BROWSER = /(?:CriOS|EdgiOS|OPR|SamsungBrowser)\//i
const SAFARI_BROWSER = /Version\/\d+(?:\.\d+)*.*Safari\//i

export interface ProtectedPlaybackCapabilities {
  fairPlayAvailable: boolean
  playReadyAvailable: boolean
  widevineAvailable: boolean
}

export function protectedPlaybackBrowser(
  userAgent: string | null,
  capabilities: ProtectedPlaybackCapabilities,
): ProtectedPlaybackBrowser {
  if (userAgent && capabilities.fairPlayAvailable && SAFARI_BROWSER.test(userAgent)) {
    return fairPlayPlaybackBrowser
  }
  if (userAgent && capabilities.playReadyAvailable && PLAYREADY_BROWSER.test(userAgent)) return playReadyPlaybackBrowser

  if (
    userAgent &&
    capabilities.widevineAvailable &&
    WIDEVINE_BROWSER.test(userAgent) &&
    !UNVERIFIED_CHROMIUM_BROWSER.test(userAgent)
  ) {
    return widevinePlaybackBrowser
  }

  throw new PlaybackCompatibilityError(
    'Secure playback is not supported by this browser. Use current Safari with FairPlay DRM, or Chrome or Microsoft Edge with Widevine DRM enabled.',
  )
}

export function isProtectedPlaybackBrowser(value: unknown): value is ProtectedPlaybackBrowser {
  return (
    typeof value === 'object' &&
    value !== null &&
    (((value as ProtectedPlaybackBrowser).keySystem === 'com.widevine.alpha' &&
      (value as ProtectedPlaybackBrowser).manifestFormat === 'dash') ||
      ((value as ProtectedPlaybackBrowser).keySystem === 'com.apple.fps' &&
        (value as ProtectedPlaybackBrowser).manifestFormat === 'hls') ||
      ((value as ProtectedPlaybackBrowser).keySystem === 'com.microsoft.playready' &&
        (value as ProtectedPlaybackBrowser).manifestFormat === 'dash'))
  )
}
