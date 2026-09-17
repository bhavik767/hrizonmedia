import 'server-only'

import { createCipheriv, createHash } from 'node:crypto'

import type { DrmProvider } from './contracts'
import { PermanentTranscodeError, TransientTranscodeError } from './errors'

const LICENCE_URL = 'https://drm-license.doverunner.com/ri/licenseManager.do?response_format=original'
const TOKEN_IV = Buffer.from('0123456789abcdef', 'utf8')
const CONTENT_ID = /^drm_processing_[0-9a-f-]{36}$/

export interface DoveRunnerDrmConfiguration {
  accessKey: string
  siteId: string
  siteKey: string
}

interface DoveRunnerDependencies {
  fetch?: typeof globalThis.fetch
  now?: () => Date
}

function timestamp(now: Date): string {
  return now.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function encryptedPolicy(siteKey: string): string {
  const key = Buffer.from(siteKey, 'utf8')
  if (key.byteLength !== 32) {
    throw new PermanentTranscodeError('DoveRunner site key must be exactly 32 bytes.')
  }
  const cipher = createCipheriv('aes-256-cbc', key, TOKEN_IV)
  const policy = JSON.stringify({
    playback_policy: { license_duration: 0, persistent: false },
    policy_version: 2,
  })
  return Buffer.concat([cipher.update(policy, 'utf8'), cipher.final()]).toString('base64')
}

function providerToken(
  configuration: DoveRunnerDrmConfiguration,
  drmContentId: string,
  playbackGrantId: string,
  now: Date,
): string {
  if (!CONTENT_ID.test(drmContentId)) {
    throw new PermanentTranscodeError('DRM Content ID is invalid.')
  }
  const token = {
    cid: drmContentId,
    drm_type: 'Widevine',
    policy: encryptedPolicy(configuration.siteKey),
    site_id: configuration.siteId,
    timestamp: timestamp(now),
    user_id: playbackGrantId,
  }
  const hash = createHash('sha256')
    .update(
      `${configuration.accessKey}${token.drm_type}${token.site_id}${token.user_id}${token.cid}${token.policy}${token.timestamp}`,
    )
    .digest('base64')
  return Buffer.from(JSON.stringify({ ...token, hash }), 'utf8').toString('base64')
}

export function createDoveRunnerDrmProvider(
  configuration: DoveRunnerDrmConfiguration,
  dependencies: DoveRunnerDependencies = {},
): DrmProvider {
  const fetcher = dependencies.fetch ?? globalThis.fetch
  const now = dependencies.now ?? (() => new Date())

  return {
    async acquireTemporaryLicence({ challenge, drmContentId, playbackGrantId }) {
      const customData = providerToken(configuration, drmContentId, playbackGrantId, now())
      let response: Response
      try {
        response = await fetcher(LICENCE_URL, {
          body: challenge,
          headers: {
            'content-type': 'application/octet-stream',
            'pallycon-customdata-v2': customData,
          },
          method: 'POST',
          signal: AbortSignal.timeout(10_000),
        })
      } catch (error) {
        throw new TransientTranscodeError('DoveRunner licence request failed.', { cause: error })
      }
      if (response.status === 429 || response.status >= 500) {
        throw new TransientTranscodeError('DoveRunner licence service is temporarily unavailable.')
      }
      if (!response.ok) throw new PermanentTranscodeError('DoveRunner rejected the licence request.')
      const licence = new Uint8Array(await response.arrayBuffer())
      if (licence.byteLength === 0) {
        throw new PermanentTranscodeError('DoveRunner returned an empty licence.')
      }
      return licence
    },

    createPlaybackContract({ playbackGrantId }) {
      return {
        distinctiveIdentifier: 'not-allowed',
        keySystem: 'com.widevine.alpha',
        licenceURL: `/api/demo/playback/${playbackGrantId}/licence`,
        persistentState: 'not-allowed',
        sessionType: 'temporary',
      }
    },
  }
}
