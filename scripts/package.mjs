#!/usr/bin/env node
// forstudent 스킬 업로드용 ZIP 만들기: node scripts/package.mjs  (또는 npm run package)
// 결과: dist/forstudent.zip — 압축을 풀면 forstudent/SKILL.md 가 맨 위 폴더 바로 아래에 있습니다.
// Claude 앱·웹의 스킬 업로드는 SKILL.md 가 맨 위 폴더 바로 아래에 있어야 받아 줍니다.
// (GitHub 'Download ZIP' 은 forstudent-main/skills/forstudent/SKILL.md 로 세 단계 아래라 업로드가 거절됩니다.)
// 외부 패키지 없이 Node 만 씁니다. 같은 내용이면 항상 같은 ZIP 이 나오도록 시각을 고정합니다.
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateRawSync, inflateRawSync } from 'node:zlib'

const repo = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const skillDir = join(repo, 'skills', 'forstudent')
const outDir = join(repo, 'dist')
const outPath = join(outDir, 'forstudent.zip')
const TOP = 'forstudent' // ZIP 맨 위 폴더 이름 (SKILL.md 의 name 과 같게)
const TEXT = /\.(md|mjs|json|sql|yaml|yml|txt)$/

const fail = (m) => {
  console.error('✗', m)
  process.exit(1)
}

// 1) 담을 파일 모으기: skills/forstudent 안의 모든 파일 + 라이선스(MIT 는 복사본에 문구를 남기라고 요구)
function walk(dir, base = '') {
  const out = []
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name)
    const rel = base ? `${base}/${name}` : name
    statSync(p).isDirectory() ? out.push(...walk(p, rel)) : out.push({ rel, path: p })
  }
  return out
}
const files = walk(skillDir)
files.push({ rel: 'LICENSE', path: join(repo, 'LICENSE') })
if (!files.some((f) => f.rel === 'SKILL.md')) fail('skills/forstudent/SKILL.md 가 없어요')

// 2) ZIP 쓰기 도구
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const DOS_TIME = 0 // 00:00:00
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1 // 2026-01-01
const UTF8 = 0x0800

const entries = [] // { name, method, crc, csize, usize, offset, attr }
const chunks = []
let offset = 0
function add(name, data, isDir) {
  const nameBuf = Buffer.from(name, 'utf8')
  const method = isDir ? 0 : 8
  const body = isDir ? Buffer.alloc(0) : deflateRawSync(data, { level: 9 })
  const crc = isDir ? 0 : crc32(data)
  const h = Buffer.alloc(30)
  h.writeUInt32LE(0x04034b50, 0)
  h.writeUInt16LE(20, 4)
  h.writeUInt16LE(UTF8, 6)
  h.writeUInt16LE(method, 8)
  h.writeUInt16LE(DOS_TIME, 10)
  h.writeUInt16LE(DOS_DATE, 12)
  h.writeUInt32LE(crc, 14)
  h.writeUInt32LE(body.length, 18)
  h.writeUInt32LE(isDir ? 0 : data.length, 22)
  h.writeUInt16LE(nameBuf.length, 26)
  h.writeUInt16LE(0, 28)
  chunks.push(h, nameBuf, body)
  entries.push({ name: nameBuf, method, crc, csize: body.length, usize: isDir ? 0 : data.length, offset, attr: isDir ? 0x10 : 0 })
  offset += h.length + nameBuf.length + body.length
}

// 3) 폴더 항목 → 파일 항목 순서로 넣기 (경로는 항상 / 로 구분)
const dirs = new Set([TOP])
for (const f of files) {
  const parts = f.rel.split('/')
  for (let i = 1; i < parts.length; i++) dirs.add(`${TOP}/${parts.slice(0, i).join('/')}`)
}
for (const d of [...dirs].sort()) add(`${d}/`, null, true)
for (const f of files) {
  let data = readFileSync(f.path)
  if (TEXT.test(f.rel) || f.rel === 'LICENSE') data = Buffer.from(data.toString('utf8').replace(/\r\n/g, '\n'), 'utf8')
  add(`${TOP}/${f.rel}`, data, false)
}

// 4) 목차(중앙 디렉터리)와 끝 표시
const cdStart = offset
for (const e of entries) {
  const c = Buffer.alloc(46)
  c.writeUInt32LE(0x02014b50, 0)
  c.writeUInt16LE(20, 4)
  c.writeUInt16LE(20, 6)
  c.writeUInt16LE(UTF8, 8)
  c.writeUInt16LE(e.method, 10)
  c.writeUInt16LE(DOS_TIME, 12)
  c.writeUInt16LE(DOS_DATE, 14)
  c.writeUInt32LE(e.crc, 16)
  c.writeUInt32LE(e.csize, 20)
  c.writeUInt32LE(e.usize, 24)
  c.writeUInt16LE(e.name.length, 28)
  c.writeUInt32LE(e.attr, 38)
  c.writeUInt32LE(e.offset, 42)
  chunks.push(c, e.name)
  offset += c.length + e.name.length
}
const end = Buffer.alloc(22)
end.writeUInt32LE(0x06054b50, 0)
end.writeUInt16LE(entries.length, 8)
end.writeUInt16LE(entries.length, 10)
end.writeUInt32LE(offset - cdStart, 12)
end.writeUInt32LE(cdStart, 16)
chunks.push(end)

mkdirSync(outDir, { recursive: true })
writeFileSync(outPath, Buffer.concat(chunks))

// 5) 만든 ZIP 을 다시 읽어 구조 확인: 맨 위 폴더, SKILL.md 위치, 내용(CRC), 역슬래시 없음
const zip = readFileSync(outPath)
const eocd = zip.length - 22
if (zip.readUInt32LE(eocd) !== 0x06054b50) fail('ZIP 끝 표시를 찾지 못했어요')
const count = zip.readUInt16LE(eocd + 10)
let p = zip.readUInt32LE(eocd + 16)
const names = []
for (let i = 0; i < count; i++) {
  if (zip.readUInt32LE(p) !== 0x02014b50) fail('ZIP 목차가 깨졌어요')
  const method = zip.readUInt16LE(p + 10)
  const crc = zip.readUInt32LE(p + 16)
  const csize = zip.readUInt32LE(p + 20)
  const nlen = zip.readUInt16LE(p + 28)
  const lho = zip.readUInt32LE(p + 42)
  const name = zip.subarray(p + 46, p + 46 + nlen).toString('utf8')
  names.push(name)
  if (!name.endsWith('/')) {
    const dataStart = lho + 30 + zip.readUInt16LE(lho + 26) + zip.readUInt16LE(lho + 28)
    const raw = zip.subarray(dataStart, dataStart + csize)
    const data = method === 8 ? inflateRawSync(raw) : raw
    if (crc32(data) !== crc) fail(`내용 검사(CRC) 실패: ${name}`)
  }
  p += 46 + nlen
}
if (names.some((n) => n.includes('\\'))) fail('경로에 역슬래시가 있어요')
if (names.some((n) => !n.startsWith(`${TOP}/`))) fail(`${TOP}/ 밖에 있는 항목이 있어요`)
if (!names.includes(`${TOP}/SKILL.md`)) fail(`${TOP}/SKILL.md 가 ZIP 맨 위 폴더 바로 아래에 없어요`)
const dirCount = names.filter((n) => n.endsWith('/')).length
console.log(`✓ dist/forstudent.zip  파일 ${names.length - dirCount}개, ${(zip.length / 1024).toFixed(1)} KB`)
console.log(`✓ ${TOP}/SKILL.md 가 맨 위 폴더 바로 아래에 있어요`)
