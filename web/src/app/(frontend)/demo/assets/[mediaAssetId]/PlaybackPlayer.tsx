'use client'

import 'shaka-player/dist/controls.css'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

interface PlaybackGrantContract {
  distinctiveIdentifier: 'not-allowed'
  expiresAt: string
  keySystem: 'com.widevine.alpha'
  licenceURL: string
  manifestURL: string
  persistentState: 'not-allowed'
  playbackGrantToken: string
  sessionType: 'temporary'
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

export function PlaybackPlayer({
  mediaAssetId,
  viewerEmail,
}: {
  mediaAssetId: string
  viewerEmail: string
}) {
  const playerRef = useRef<null | { destroy(): Promise<void> }>(null)
  const uiRef = useRef<null | { destroy(): Promise<unknown> }>(null)
  const videoContainerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [message, setMessage] = useState('Playback has not started.')
  const [timestamp, setTimestamp] = useState('')
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
    const updateTimestamp = () => setTimestamp(new Date().toISOString())
    updateTimestamp()
    const timestampTimer = window.setInterval(updateTimestamp, 1_000)
    const positionTimer = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? undefined
      : window.setInterval(
          () => setWatermarkPosition((position) => (position + 1) % WATERMARK_POSITIONS.length),
          6_000,
        )

    return () => {
      window.clearInterval(timestampTimer)
      if (positionTimer !== undefined) window.clearInterval(positionTimer)
    }
  }, [])

  async function startPlayback() {
    const video = videoRef.current
    const videoContainer = videoContainerRef.current
    if (!video || !videoContainer || starting) return
    setStarting(true)
    setMessage('Authorising encrypted playback…')
    try {
      const response = await fetch(`/api/demo/assets/${mediaAssetId}/playback-grants`, {
        method: 'POST',
      })
      if (!response.ok) throw new Error(await response.text())
      const grant = (await response.json()) as PlaybackGrantContract
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

      const configuration = {
        distinctiveIdentifierRequired: false,
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
      setMessage('Secure playback could not start. Request a fresh grant and try again.')
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
        <div
          aria-label="Recording attribution watermark"
          className="secure-playback__watermark"
          data-position={WATERMARK_POSITIONS[watermarkPosition]}
          data-testid="viewer-watermark"
        >
          <span>{viewerEmail}</span>
          <time dateTime={timestamp}>
            {timestamp
              ? new Date(timestamp).toLocaleString('en-IN', {
                  dateStyle: 'medium',
                  timeStyle: 'medium',
                })
              : 'Loading current time…'}
          </time>
        </div>
      </div>
      <p aria-live="polite" className="secure-playback__status">
        {message}
      </p>
      <p className="secure-playback__disclosure" id="playback-watermark-notice">
        Your full email and the current timestamp move across playback to attribute screen
        recordings. Streaming-only playback uses temporary rights; downloads, offline playback,
        persistent licences, and picture-in-picture are disabled. Read the{' '}
        <Link href="/demo/terms">Pilot terms</Link>.
      </p>
    </section>
  )
}
