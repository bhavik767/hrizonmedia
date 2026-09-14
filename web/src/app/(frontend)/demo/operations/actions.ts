'use server'

import { revalidatePath } from 'next/cache'
import { getPayload } from 'payload'

import config from '@/payload.config'
import { getPilotMember } from '@/pilot/session'
import { disablePilotMember, updateOperationalControls } from '@/pilot/operations'

export async function disableMember(formData: FormData): Promise<void> {
  const operator = await getPilotMember()
  if (!operator) throw new Error('Active operator access required.')
  const memberID = Number(formData.get('memberID'))
  if (!Number.isSafeInteger(memberID)) throw new Error('Pilot Member not found.')
  await disablePilotMember(await getPayload({ config }), operator, memberID)
  revalidatePath('/demo/operations')
}

export async function saveOperationalControls(formData: FormData): Promise<void> {
  const operator = await getPilotMember()
  if (!operator) throw new Error('Active operator access required.')
  await updateOperationalControls(await getPayload({ config }), operator, {
    killSwitchEnabled: formData.get('killSwitchEnabled') === 'on',
    providerConcurrency: Number(formData.get('providerConcurrency')),
  })
  revalidatePath('/demo/operations')
}
