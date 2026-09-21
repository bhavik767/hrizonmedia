'use client'

import 'shaka-player/dist/controls.css'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

interface PlaybackGrantContract {
  deliveryExpiresAt: string
  deliveryToken: string
  distinctiveIdentifier: 'not-allowed'
  expiresAt: string
  hdcpRequired: false
  keySystem: 'com.widevine.alpha'
  licenceURL: string
  manifestFormat: 'dash'
  manifestURL: string
  persistentState: 'not-allowed'
  playbackGrantId: string
  playbackGrantToken: string
  resourceAuthorization?: ResourceAuthorization
  sessionType: 'temporary'
  watermark: Watermark
}

interface ResourceAuthorization {
  origin: string
  pathPrefix: string
  query: string
}

interface Watermark {
  issuedAt: string
  leakId: string
}

const UI_CONFIGURATION = {
  addSeekBar: true,
  controlPanelElements: [
    'play_pause',
    'time_and_duration',
    'spacer',
    'mute',
    'volume',
    'overflow_menu',
    'fullscreen',
  ],
  overflowMenuButtons: ['quality', 'playback_rate'],
  playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2],
}

const WATERMARK_POSITIONS = ['top-left', 'top-right', 'center', 'bottom-left'] as const

async function responseJSON<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: string }
  if (!response.ok) throw new Error(body.error || 'Playback authorization failed.')
  return body
}

async function assertWidevineAvailable(): Promise<void> {
  if (!navigator.requestMediaKeySystemAccess) {
    throw new Error('Secure playback is not supported by this browser. Widevine DRM is unavailable.')
  }
  await navigator.requestMediaKeySystemAccess('com.widevine.alpha', [
    {
      audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"' }],
      initDataTypes: ['cenc'],
      videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.640028"' }],
    },
  ])
}

export function PlaybackPlayer({
  mediaAssetId,
}: {
  mediaAssetId: string
}) {
  const playerRef = useRef<null | { destroy(): Promise<void> }>(null)
  const uiRef = useRef<null | { destroy(): Promise<unknown> }>(null)
  const videoContainerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [message, setMessage] = useState('Playback has not started.')
  const [watermark, setWatermark] = useState<null | (Watermark & {
    playbackGrantId: string
    playbackGrantToken: string
  })>(null)
  const [watermarkPosition, setWatermarkPosition] = useState(0)
  const [starting, setStarting] = useState(false)

  useEffect(
    () => () => {
      if (uiRef.current) void uiRef.current.destroy()
      else void playerRef.current?.destroy()
    },
    [],
  )

  useEffect(() => {
    if (!watermark) return
    let cancelled = false
    let refreshing = false
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const refreshWatermark = async () => {
      if (refreshing) return
      refreshing = true
      try {
        const response = await fetch(`/api/demo/playback/${watermark.playbackGrantId}/watermark`, {
          headers: { 'X-Playback-Grant': watermark.playbackGrantToken },
          method: 'POST',
        })
        const next = await responseJSON<Watermark>(response)
        if (!cancelled) {
          setWatermark({ ...watermark, ...next })
          if (!reducedMotion) {
            setWatermarkPosition((position) => (position + 1) % WATERMARK_POSITIONS.length)
          }
        }
      } catch (error) {
        console.error(error)
      } finally {
        refreshing = false
      }
    }
    const rotationTimer = window.setInterval(() => void refreshWatermark(), 30_000)

    return () => {
      cancelled = true
      window.clearInterval(rotationTimer)
    }
  }, [watermark])

  async function startPlayback() {
    const video = videoRef.current
    const videoContainer = videoContainerRef.current
    if (!video || !videoContainer || starting) return
    setStarting(true)
    setMessage('Authorising encrypted playback…')
    try {
      await assertWidevineAvailable()
      const response = await fetch(`/api/demo/assets/${mediaAssetId}/playback-grants`, {
        headers: { 'X-Hrizonmedia-Widevine': 'available' },
        method: 'POST',
      })
      const grant = await responseJSON<PlaybackGrantContract>(response)
      setWatermark({
        ...grant.watermark,
        playbackGrantId: grant.playbackGrantId,
        playbackGrantToken: grant.playbackGrantToken,
      })
      const { default: shaka } = await import('shaka-player/dist/shaka-player.ui.js')
      shaka.polyfill.installAll()
      if (!shaka.Player.isBrowserSupported()) {
        throw new Error('Encrypted playback is not supported by this browser.')
      }

      if (uiRef.current) {
        await uiRef.current.destroy()
        uiRef.current = null
        playerRef.current = null
      } else {
        await playerRef.current?.destroy()
        playerRef.current = null
      }
      const player = new shaka.Player()
      playerRef.current = player
      await player.attach(video)
      const overlay = new shaka.ui.Overlay(player, videoContainer, video)
      uiRef.current = overlay
      overlay.configure(UI_CONFIGURATION)
      player.configure({
        drm: {
          advanced: {
            [grant.keySystem]: {
              distinctiveIdentifierRequired: false,
              persistentStateRequired: false,
              sessionType: grant.sessionType,
            },
          },
          persistentSessionOnlinePlayback: false,
          persistentSessionsMetadata: [],
          servers: { [grant.keySystem]: grant.licenceURL },
        },
      })
      player.getNetworkingEngine()?.registerRequestFilter((type, request) => {
        if (type === shaka.net.NetworkingEngine.RequestType.LICENSE) {
          request.headers['X-Playback-Grant'] = grant.playbackGrantToken
        }
      })

      let delivery: {
        expiresAt: string
        manifestURL: string
        resourceAuthorization?: ResourceAuthorization
      } = {
        expiresAt: grant.deliveryExpiresAt,
        manifestURL: grant.manifestURL,
        resourceAuthorization: grant.resourceAuthorization,
      }
      let refresh: Promise<void> | null = null
      player.getNetworkingEngine()?.registerRequestFilter(async (type, request) => {
        if (
          type !== shaka.net.NetworkingEngine.RequestType.MANIFEST &&
          type !== shaka.net.NetworkingEngine.RequestType.SEGMENT
        ) {
          return
        }
        if (Date.now() >= new Date(delivery.expiresAt).getTime() - 15_000) {
          refresh ??= fetch(
            `/api/demo/playback/${grant.playbackGrantId}/delivery?asset=${mediaAssetId}&token=${encodeURIComponent(grant.deliveryToken)}`,
            { cache: 'no-store' },
          )
            .then((response) =>
              responseJSON<{
                expiresAt: string
                manifestURL: string
                resourceAuthorization?: ResourceAuthorization
              }>(response),
            )
            .then((next) => {
              delivery = next
            })
            .finally(() => {
              refresh = null
            })
          await refresh
        }
        const authorization = delivery.resourceAuthorization
        if (!authorization) return
        const authorizationQuery = new URLSearchParams(authorization.query)
        request.uris = request.uris.map((uri) => {
          const resource = new URL(uri, authorization.origin)
          if (
            resource.origin !== authorization.origin ||
            !resource.pathname.startsWith(authorization.pathPrefix)
          ) {
            return uri
          }
          for (const [name, value] of authorizationQuery) {
            resource.searchParams.set(name, value)
          }
          return resource.toString()
        })
      })

      const configuration = {
        distinctiveIdentifierRequired: false,
        hdcpRequired: grant.hdcpRequired,
        keySystem: grant.keySystem,
        persistentSessionOnlinePlayback: false,
        persistentStateRequired: false,
        sessionType: grant.sessionType,
        ui: UI_CONFIGURATION,
      }
      window.dispatchEvent(
        new CustomEvent('hrizonmedia:shaka-configured', { detail: configuration }),
      )
      setMessage(`Playback authorised until ${new Date(grant.expiresAt).toLocaleTimeString()}.`)
      await player.load(grant.manifestURL)
    } catch (error) {
      console.error(error)
      setMessage(
        error instanceof Error
          ? error.message
          : 'Secure playback could not start. Request a fresh grant and try again.',
      )
    } finally {
      setStarting(false)
    }
  }

  return (
    <section aria-labelledby="secure-playback-title" className="secure-playback">
      <div className="secure-playback__heading">
        <div>
          <p className="eyebrow">Widevine streaming</p>
          <h2 id="secure-playback-title">Secure playback</h2>
        </div>
        <button disabled={starting} onClick={startPlayback} type="button">
          {starting ? 'Starting secure playback…' : 'Start secure playback'}
        </button>
      </div>
      <div className="secure-playback__video" ref={videoContainerRef}>
        <video
          aria-describedby="playback-watermark-notice"
          aria-label="Encrypted Media Asset"
          controlsList="nodownload"
          data-testid="secure-video"
          disablePictureInPicture
          onContextMenu={(event) => event.preventDefault()}
          playsInline
          ref={videoRef}
        />
        {watermark && (
          <div
            aria-label="Recording attribution watermark"
            className="secure-playback__watermark"
            data-position={WATERMARK_POSITIONS[watermarkPosition]}
            data-testid="viewer-watermark"
          >
            <span>{watermark.leakId}</span>
            <time dateTime={watermark.issuedAt}>
              {new Date(watermark.issuedAt).toLocaleString('en-IN', {
                dateStyle: 'medium',
                timeStyle: 'medium',
              })}
            </time>
          </div>
        )}
      </div>
      <p aria-live="polite" className="secure-playback__status">
        {message}
      </p>
      <p className="secure-playback__disclosure" id="playback-watermark-notice">
        A compact Leak ID and server-issued timestamp move across playback to support recording
        investigations without displaying your email. Streaming-only playback uses temporary rights;
        downloads, offline playback,
        persistent licences, and picture-in-picture are disabled. Read the{' '}
        <Link href="/demo/terms">Pilot terms</Link>.
      </p>
    </section>
  )
}
