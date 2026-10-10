#!/usr/bin/env node
// forstudent 개인정보 점검 — 의심되는 곳을 찾아 알려 주는 도구입니다. 통과했다고 안전이 보증되지는 않습니다.
//
// 사용법 (프로젝트 폴더에서):
//   node scripts/privacy-check.mjs                       # 기본 금지 목록으로 점검
//   node scripts/privacy-check.mjs . --forbidden forbidden.json
//
// 찾는 것
//   [오류] Git 에 올라간 비밀 파일(.env, .vercel 등), 소스 속 API 키·서비스 역할 키
//   [검토] SQL 표의 금지 열 이름(예: name, phone), 화면 입력 칸의 이름·자동완성·안내 문구(예: 이름, 전화번호)
// 오류가 하나라도 있으면 종료 코드 1 을 돌려줍니다 (커밋·배포 전 점검에 쓸 수 있습니다).
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

const args = process.argv.slice(2)
const root = args[0] && !args[0].startsWith('--') ? args[0] : process.cwd()
const fbAt = args.indexOf('--forbidden')
const fbPath = fbAt >= 0 ? args[fbAt + 1] : join(root, 'forbidden.json')

const DEFAULTS = {
  // SQL 열 이름 / 화면 입력 이름으로 쓰면 안 되는 것 (소문자로 비교)
  fields: [
    'name', 'real_name', 'full_name', 'student_name', 'first_name', 'last_name',
    'phone', 'tel', 'mobile', 'email', 'address', 'birth', 'birthday', 'birthdate',
    'resident_id', 'rrn', 'ssn', 'photo', 'image_url', 'avatar_url', 'guardian', 'parent_name', 'parent_phone',
  ],
  // 화면 입력 칸의 안내 문구(placeholder, aria-label)에 들어 있으면 검토할 낱말
  words: ['이름', '성명', '전화', '연락처', '주소', '생년월일', '주민', '사진', '보호자'],
  // 괜찮다고 확인한 것: "표.열" 또는 열 이름 (예: 학급 이름이라서 classes.name 은 허용)
  allow: [],
}
let cfg = { ...DEFAULTS }
if (existsSync(fbPath)) {
  try {
    const u = JSON.parse(readFileSync(fbPath, 'utf8'))
    cfg = { fields: u.fields ?? DEFAULTS.fields, words: u.words ?? DEFAULTS.words, allow: u.allow ?? [] }
  } catch (e) {
    console.error('forbidden.json 을 읽지 못했어요:', e.message)
    process.exit(2)
  }
}
const fields = new Set(cfg.fields.map((x) => x.toLowerCase()))
const allow = new Set(cfg.allow.map((x) => x.toLowerCase()))

const errors = []
const reviews = []
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.next', '.vercel', 'coverage'])

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (st.size < 2_000_000) out.push(p)
  }
  return out
}
const rel = (p) => relative(root, p).replaceAll('\\', '/')
// Git 저장소면 'Git 에 올라갔거나 올릴 수 있는 파일'만 본다 (.gitignore 로 제외한 .env.local 같은 파일은 제외)
let files
try {
  files = execSync('git ls-files --cached --others --exclude-standard', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .split('\n')
    .filter(Boolean)
    .map((p) => join(root, p))
    .filter((p) => existsSync(p) && statSync(p).isFile() && statSync(p).size < 2_000_000)
} catch {
  files = walk(root)
}

// 1) Git 에 올라간 비밀 파일
try {
  const tracked = execSync('git ls-files', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().split('\n').filter(Boolean)
  for (const f of tracked) {
    if (/(^|\/)\.env(\.|$)/.test(f) && !/\.example$/.test(f)) errors.push(`${f}: 비밀 값이 들어 있을 수 있는 .env 파일이 Git 에 올라가 있어요`)
    if (/(^|\/)\.vercel(\/|$)/.test(f)) errors.push(`${f}: 배포 도구 설정 폴더가 Git 에 올라가 있어요`)
    if (/(^|\/)\.teacher-invite|auth\.json$/.test(f)) errors.push(`${f}: 인증·초대 암호 파일이 Git 에 올라가 있어요`)
  }
} catch {
  console.log('(Git 저장소가 아니거나 git 을 찾지 못해 Git 파일 점검은 건너뜀)')
}

// 2) 소스 속 비밀 값
const TEXT_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.sql', '.html', '.md', '.toml', '.yml', '.yaml', '.txt', '.env'])
for (const f of files) {
  if (!TEXT_EXT.has(extname(f)) && !/\.env/.test(f)) continue
  if (/package-lock\.json$/.test(f)) continue
  let text
  try {
    text = readFileSync(f, 'utf8')
  } catch {
    continue
  }
  if (/sk-[A-Za-z0-9_-]{20,}/.test(text)) errors.push(`${rel(f)}: API 키처럼 보이는 값(sk-…)이 있어요`)
  if (/sb_secret_[A-Za-z0-9_-]+/.test(text)) errors.push(`${rel(f)}: 서버 비밀 키처럼 보이는 값(sb_secret_…)이 있어요`)
  for (const m of text.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.([A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g)) {
    try {
      const role = JSON.parse(Buffer.from(m[1], 'base64url').toString()).role
      if (role === 'service_role') errors.push(`${rel(f)}: 서비스 역할(service_role) 키가 있어요 — 즉시 폐기하고 새로 만드세요`)
    } catch {
      /* JWT 가 아니면 무시 */
    }
  }
}

// 3) SQL: 금지 열 이름
for (const f of files.filter((x) => extname(x) === '.sql')) {
  const lines = readFileSync(f, 'utf8').split('\n')
  let table = ''
  let depth = 0
  lines.forEach((line, i) => {
    const t = line.match(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?("?\w+"?)\s*\(/i)
    if (t) {
      table = t[1].replaceAll('"', '').toLowerCase()
      depth = 0
    }
    if (!table) return
    const col = line.match(/^\s*("?[a-z_][a-z0-9_]*"?)\s+(?:text|varchar|char|int|integer|bigint|smallint|numeric|boolean|uuid|date|timestamp|timestamptz|jsonb?|bytea|citext)/i)
    if (col && depth >= 0) {
      const name = col[1].replaceAll('"', '').toLowerCase()
      if (fields.has(name) && !allow.has(name) && !allow.has(`${table}.${name}`)) {
        reviews.push(`${rel(f)}:${i + 1}  표 ${table} 의 열 '${name}' — 학생 개인정보가 아닌지 확인하세요 (괜찮다면 forbidden.json 의 allow 에 "${table}.${name}" 추가)`)
      }
    }
    depth += (line.match(/\(/g) ?? []).length - (line.match(/\)/g) ?? []).length
    if (depth < 0 || /^\s*\)\s*;?\s*$/.test(line)) table = ''
  })
}

// 4) 화면: 입력 칸 이름·자동완성·안내 문구
const UI_EXT = new Set(['.tsx', '.jsx', '.html', '.js', '.ts'])
for (const f of files.filter((x) => UI_EXT.has(extname(x)))) {
  if (/(^|\/)scripts\//.test(rel(f))) continue
  const lines = readFileSync(f, 'utf8').split('\n')
  lines.forEach((line, i) => {
    if (!/<(input|textarea|select)\b/i.test(line) && !/placeholder=|aria-label=|autoComplete=|autocomplete=/.test(line)) return
    const nm = line.match(/\b(?:name|id)=["']([a-z_][\w-]*)["']/i)
    if (nm && /<(input|textarea|select)\b/i.test(line) && fields.has(nm[1].toLowerCase()) && !allow.has(nm[1].toLowerCase()))
      reviews.push(`${rel(f)}:${i + 1}  입력 칸 '${nm[1]}' — 학생 개인정보를 받는 칸이 아닌지 확인하세요`)
    const ac = line.match(/\bautoComplete=["'](name|given-name|family-name|tel|email|street-address|bday)["']/i)
    if (ac) reviews.push(`${rel(f)}:${i + 1}  자동완성 '${ac[1]}' — 개인정보 입력 칸으로 보여요`)
    for (const m of line.matchAll(/\b(?:placeholder|aria-label)=["']([^"']*)["']/g)) {
      const hit = cfg.words.find((w) => m[1].includes(w))
      if (hit) reviews.push(`${rel(f)}:${i + 1}  안내 문구 "${m[1]}" 에 '${hit}' — 개인정보를 요구하는 문구가 아닌지 확인하세요`)
    }
  })
}

// 결과
console.log(`\n[개인정보 점검] ${files.length}개 파일 확인 · 금지 열/입력 이름 ${fields.size}개, 안내 낱말 ${cfg.words.length}개`)
if (errors.length) {
  console.log('\n[오류] 반드시 고쳐야 해요')
  for (const e of errors) console.log('  ✗', e)
}
if (reviews.length) {
  console.log('\n[검토] 의도한 것인지 확인해 주세요 (오류는 아님)')
  for (const r of reviews) console.log('  ?', r)
}
if (!errors.length && !reviews.length) console.log('  의심되는 곳을 찾지 못했어요. (이 점검은 보증이 아니므로 접근 통제 시험도 함께 하세요)')
process.exit(errors.length ? 1 : 0)
