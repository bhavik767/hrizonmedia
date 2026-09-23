import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import * as fontkit from 'fontkit'
import pngToIco from 'png-to-ico'
import sharp from 'sharp'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicDirectory = path.join(projectRoot, 'public')
const manropePath = path.join(
  projectRoot,
  'node_modules/@fontsource/manrope/files/manrope-latin-800-normal.woff2',
)

const mark = `
  <circle cx="69" cy="69" fill="#f3c30c" r="57"/>
  <path d="M47 36v67l58-34-58-33Z" fill="#08080b"/>
  <path d="m51 116 18-10v111l-18-13v-88Zm20-10 14 10v38h18v17H85v18h28v18H85l-14 10V106Z" fill="#f3c30c"/>`

const iconSvg = (radius) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <rect width="256" height="256" rx="${radius}" fill="#08080b"/>
  <g transform="translate(39 9) scale(1.27)">${mark}</g>
</svg>`

const font = fontkit.openSync(manropePath)
const run = font.layout('WeCloud')
let cursor = 0
const glyphs = run.glyphs
  .map((glyph, index) => {
    const position = run.positions[index]
    const translatedPath = `<path d="${glyph.path.toSVG()}" transform="translate(${cursor + position.xOffset} ${position.yOffset})"/>`
    cursor += position.xAdvance
    return translatedPath
  })
  .join('')

const wordScale = 0.082
const lockupWidth = Math.ceil(110 + cursor * wordScale)
const lockupSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lockupWidth} 180">
  <g transform="translate(0 20) scale(.6)">${mark}</g>
  <g fill="#fff" transform="translate(110 130) scale(${wordScale} -${wordScale})">${glyphs}</g>
</svg>`

await mkdir(publicDirectory, { recursive: true })
await writeFile(path.join(publicDirectory, 'brand-lockup.svg'), lockupSvg)
await writeFile(
  path.join(publicDirectory, 'brand-lockup.png'),
  await sharp(Buffer.from(lockupSvg), { density: 192 }).png().toBuffer(),
)
await writeFile(path.join(publicDirectory, 'favicon.svg'), iconSvg(64))

const icon32 = await sharp(Buffer.from(iconSvg(64))).resize(32, 32).png().toBuffer()
const icon48 = await sharp(Buffer.from(iconSvg(64))).resize(48, 48).png().toBuffer()
const icon16 = await sharp(Buffer.from(iconSvg(64))).resize(16, 16).png().toBuffer()
const appleIcon = await sharp(Buffer.from(iconSvg(48))).resize(180, 180).png().toBuffer()

await writeFile(path.join(publicDirectory, 'icon-32.png'), icon32)
await writeFile(path.join(publicDirectory, 'apple-touch-icon.png'), appleIcon)
await writeFile(path.join(publicDirectory, 'favicon.ico'), await pngToIco([icon16, icon32, icon48]))
