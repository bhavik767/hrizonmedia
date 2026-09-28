import { getPayload } from 'payload'

import config from '../src/payload.config.ts'

function relationID(value: number | { id: number }): number {
  return typeof value === 'number' ? value : value.id
}

async function readHidden(prompt: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) {
    throw new Error('Run this command in an interactive terminal.')
  }

  process.stdout.write(prompt)
  process.stdin.setRawMode(true)
  process.stdin.resume()
  return new Promise((resolve, reject) => {
    let value = ''
    const onData = (chunk: Buffer) => {
      for (const character of chunk.toString('utf8')) {
        if (character === '\r' || character === '\n') {
          process.stdin.off('data', onData)
          process.stdin.setRawMode(false)
          process.stdin.pause()
          process.stdout.write('\n')
          resolve(value)
          return
        }
        if (character === '\u0003') {
          process.stdin.off('data', onData)
          process.stdin.setRawMode(false)
          process.stdin.pause()
          process.stdout.write('\n')
          reject(new Error('Cancelled.'))
          return
        }
        if (character === '\u007f' || character === '\b') value = value.slice(0, -1)
        else if (character >= ' ') value += character
      }
    }
    process.stdin.on('data', onData)
  })
}

async function main() {
  const [command, role, emailArgument] = process.argv.slice(2)
  if (command !== 'list' && command !== 'reset') {
    throw new Error('Usage: admin-member-password.mts list | reset <platform|organisation> <email>')
  }
  if (command === 'reset' && !process.stdin.isTTY) {
    throw new Error('Password reset requires an interactive terminal.')
  }

  const payload = await getPayload({ config })
  try {
    if (command === 'list') {
      const [platform, memberships] = await Promise.all([
        payload.find({
          collection: 'platform-administrators',
          depth: 0,
          overrideAccess: true,
          pagination: false,
          where: { status: { equals: 'active' } },
        }),
        payload.find({
          collection: 'organisation-memberships',
          depth: 0,
          overrideAccess: true,
          pagination: false,
          where: { and: [{ role: { equals: 'administrator' } }, { status: { equals: 'active' } }] },
        }),
      ])
      for (const record of platform.docs) {
        const member = await payload.findByID({
          collection: 'members', id: relationID(record.member), overrideAccess: true,
        })
        if (member.status === 'active') process.stdout.write(`platform\t${member.email}\n`)
      }
      for (const record of memberships.docs) {
        const member = await payload.findByID({
          collection: 'members', id: relationID(record.member), overrideAccess: true,
        })
        if (member.status === 'active') {
          process.stdout.write(`organisation\t${member.email}\torganisation ${relationID(record.organisation)}\n`)
        }
      }
      return
    }

    if ((role !== 'platform' && role !== 'organisation') || !emailArgument) {
      throw new Error('Usage: admin-member-password.mts reset <platform|organisation> <email>')
    }
    const email = emailArgument.trim().toLowerCase()
    const result = await payload.find({
      collection: 'members',
      depth: 0,
      limit: 2,
      overrideAccess: true,
      where: { email: { equals: email } },
    })
    const member = result.docs[0]
    if (!member || result.docs.length !== 1 || member.status !== 'active') {
      throw new Error('An active Member with that exact email was not found.')
    }
    const grants = await payload.find({
      collection: role === 'platform' ? 'platform-administrators' : 'organisation-memberships',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: {
        and: [
          { member: { equals: member.id } },
          { status: { equals: 'active' } },
          ...(role === 'organisation' ? [{ role: { equals: 'administrator' } }] : []),
        ],
      },
    })
    if (!grants.docs[0]) throw new Error(`That Member has no active ${role} administrator access.`)

    const password = await readHidden(`New password for ${email}: `)
    const confirmation = await readHidden('Confirm new password: ')
    if (password.length < 8) throw new Error('Use at least 8 characters.')
    if (password !== confirmation) throw new Error('Passwords do not match.')

    await payload.update({
      collection: 'members',
      data: { password, sessions: [] },
      id: member.id,
      overrideAccess: true,
    })
    process.stdout.write(`Password replaced for ${email}. All existing sessions were revoked.\n`)
  } finally {
    await payload.destroy()
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Password reset failed.'}\n`)
  process.exitCode = 1
})
