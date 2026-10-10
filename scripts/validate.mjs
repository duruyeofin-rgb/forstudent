#!/usr/bin/env node
// forstudent 스킬 구조 점검: node scripts/validate.mjs
// 스킬 형식(이름·설명·길이), 가리키는 파일이 있는지, 네 질문이 그대로 들어 있는지, 비밀 값이 없는지 확인합니다.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const skillDir = join(repo, 'skills', 'forstudent')
let bad = 0
const fail = (m) => {
  bad++
  console.log('✗', m)
}
const ok = (m) => console.log('✓', m)

// 1) SKILL.md 머리말과 길이
const skillPath = join(skillDir, 'SKILL.md')
if (!existsSync(skillPath)) {
  fail('SKILL.md 가 없어요')
  process.exit(1)
}
const text = readFileSync(skillPath, 'utf8').replace(/\r\n/g, '\n')
const fm = text.match(/^---\n([\s\S]*?)\n---\n/)
if (!fm) fail('SKILL.md 맨 위에 --- 머리말이 없어요')
else {
  const name = fm[1].match(/^name:\s*(.+)$/m)?.[1]?.trim()
  const desc = fm[1].match(/^description:\s*([\s\S]+)$/m)?.[1]?.trim() ?? ''
  if (name !== 'forstudent') fail(`name 이 forstudent 가 아니에요: ${name}`)
  else ok('name: forstudent')
  if (!desc) fail('description 이 비어 있어요')
  else if (desc.length > 1024) fail(`description 이 너무 길어요 (${desc.length}자, 최대 1024자)`)
  else ok(`description ${desc.length}자`)
  for (const k of ['학생', '질문', 'web app']) if (!desc.includes(k)) fail(`description 에 '${k}' 가 없어요 (스킬이 잘 불리도록 넣어 두었어요)`)
}
const lines = text.split('\n').length
if (lines > 500) fail(`SKILL.md 가 ${lines}줄이에요 (500줄 이내 권장)`)
else ok(`SKILL.md ${lines}줄`)

// 2) 네 질문이 그대로 들어 있는가
const QUESTIONS = [
  '학생의 배움이 멈추는 순간은 언제입니까?',
  '학생이 가장 먼저 해야 할 일은 무엇입니까?',
  '웹앱 또는 도구로써 구현하고 싶은 기능은 무엇입니까?',
  '웹앱에 들어가서는 안되는 정보는 무엇입니까?',
]
for (const q of QUESTIONS) if (!text.includes(q)) fail(`네 질문 중 하나가 SKILL.md 에 그대로 없어요: ${q}`)
if (QUESTIONS.every((q) => text.includes(q))) ok('네 질문이 그대로 들어 있어요')

// 3) 가리키는 파일이 모두 있는가
const refs = new Set([...text.matchAll(/(?:references|templates)\/[\w.-]+\.\w+/g)].map((m) => m[0]))
for (const r of refs) if (!existsSync(join(skillDir, r))) fail(`SKILL.md 가 가리키는 파일이 없어요: ${r}`)
ok(`가리키는 파일 ${refs.size}개 확인`)
// references 안의 문서가 서로 가리키는 파일도 확인
for (const f of readdirSync(join(skillDir, 'references'))) {
  const t = readFileSync(join(skillDir, 'references', f), 'utf8')
  for (const m of t.matchAll(/templates\/[\w.-]+\.\w+/g)) if (!existsSync(join(skillDir, m[0]))) fail(`references/${f} 가 가리키는 파일이 없어요: ${m[0]}`)
}

// 4) JSON·야믈
for (const f of ['templates/forbidden.example.json', 'evals/evals.json']) {
  try {
    JSON.parse(readFileSync(join(skillDir, f), 'utf8'))
    ok(`${f} 형식 정상`)
  } catch (e) {
    fail(`${f} 를 읽지 못했어요: ${e.message}`)
  }
}
if (!existsSync(join(skillDir, 'agents', 'openai.yaml'))) fail('agents/openai.yaml 이 없어요 (Codex 표시용)')
else ok('agents/openai.yaml 있음')

// 5) 비밀 값·개인 정보처럼 보이는 것이 없는가
function walk(d, out = []) {
  for (const n of readdirSync(d)) {
    if (n === '.git' || n === 'node_modules') continue
    const p = join(d, n)
    statSync(p).isDirectory() ? walk(p, out) : out.push(p)
  }
  return out
}
for (const f of walk(repo)) {
  if (!/\.(md|mjs|json|sql|yaml|yml|ps1|sh|txt)$/.test(f)) continue
  const t = readFileSync(f, 'utf8')
  const r = relative(repo, f).replaceAll('\\', '/')
  if (/sk-[A-Za-z0-9_-]{20,}/.test(t)) fail(`${r}: API 키처럼 보이는 값이 있어요`)
  if (/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/.test(t) && !r.endsWith('privacy-check.mjs')) fail(`${r}: JWT 처럼 보이는 값이 있어요`)
  if (/https?:\/\/[a-z0-9]{20}\.supabase\.co|prj_[A-Za-z0-9]{20,}|team_[A-Za-z0-9]{15,}/.test(t)) fail(`${r}: 특정 프로젝트의 주소·ID 가 들어 있어요`)
  if (/\b\d{6}\b.*학급 코드|학급 코드\s*[:：]?\s*\d{6}/.test(t)) fail(`${r}: 실제 학급 코드처럼 보이는 숫자가 있어요`)
}
if (bad === 0) ok('비밀 값·특정 프로젝트 ID 없음 (점검 범위: md, mjs, json, sql, yaml, ps1, sh, txt)')

console.log(bad === 0 ? '\n✅ 문제 없음' : `\n❌ 문제 ${bad}건`)
process.exit(bad === 0 ? 0 : 1)
