'use client'

import { useEffect, useRef, useState } from 'react'

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

export function PlaybackPlayer({ mediaAssetId }: { mediaAssetId: string }) {
  const playerRef = useRef<null | { destroy(): Promise<void> }>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [message, setMessage] = useState('Playback has not started.')
  const [starting, setStarting] = useState(false)

  useEffect(
    () => () => {
      void playerRef.current?.destroy()
    },
    [],
  )

  async function startPlayback() {
    if (!videoRef.current || starting) return
    setStarting(true)
    setMessage('Authorising encrypted playback…')
    try {
      const response = await fetch(`/api/demo/assets/${mediaAssetId}/playback-grants`, {
        method: 'POST',
      })
      if (!response.ok) throw new Error(await response.text())
      const grant = (await response.json()) as PlaybackGrantContract
      const { default: shaka } = await import('shaka-player')
      shaka.polyfill.installAll()
      if (!shaka.Player.isBrowserSupported()) {
        throw new Error('Encrypted playback is not supported by this browser.')
      }

      await playerRef.current?.destroy()
      const player = new shaka.Player()
      playerRef.current = player
      await player.attach(videoRef.current)
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
      <video
        aria-label="Encrypted Media Asset"
        controls
        controlsList="nodownload noplaybackrate"
        data-testid="secure-video"
        disablePictureInPicture
        onContextMenu={(event) => event.preventDefault()}
        playsInline
        ref={videoRef}
      />
      <p aria-live="polite" className="secure-playback__status">
        {message}
      </p>
      <p className="secure-playback__disclosure">
        Streaming-only playback uses temporary rights. Offline playback and persistent licences are
        disabled.
      </p>
    </section>
  )
}
