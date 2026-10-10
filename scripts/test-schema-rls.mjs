// schema-starter.sql 을 가상의 PostgreSQL(PGlite)에 적용하고 접근 규칙(RLS)을 시험한다
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const SQL = readFileSync(new URL('../skills/forstudent/templates/schema-starter.sql', import.meta.url), 'utf8')
const db = new PGlite()
let bad = 0
const check = (ok, msg) => {
  console.log(ok ? '✓' : '✗', msg)
  if (!ok) bad++
}

// Supabase 환경 흉내: 역할, auth 스키마, 기본 권한(Supabase 는 public 표를 anon/authenticated 에 기본으로 열어 둔다)
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  grant usage on schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  grant execute on all functions in schema auth to anon, authenticated;
`)

try {
  await db.exec(SQL)
  check(true, 'SQL 을 처음 적용했어요')
  await db.exec(SQL)
  check(true, 'SQL 을 두 번째 적용해도 안전해요')
} catch (e) {
  check(false, 'SQL 적용 실패: ' + e.message)
  process.exit(1)
}

const ids = {
  t1: '11111111-1111-1111-1111-111111111111',
  t2: '22222222-2222-2222-2222-222222222222',
  a: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  b: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  c: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
}
await db.exec(`insert into auth.users(id) values ('${ids.t1}'),('${ids.t2}'),('${ids.a}'),('${ids.b}'),('${ids.c}')`)

/** 역할·사용자로 바꿔서 실행한다. anonymous: 익명 로그인 학생 */
async function as(role, sub, anonymous, fn) {
  await db.exec(`set role ${role}`)
  await db.query(`select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)`, [sub ?? '', JSON.stringify({ sub, is_anonymous: !!anonymous })])
  try {
    return await fn()
  } finally {
    await db.exec('reset role')
  }
}
const fails = async (fn) => {
  try {
    await fn()
    return false
  } catch {
    return true
  }
}
const q = async (sql, params) => (await db.query(sql, params)).rows

// 교사 두 명이 학급을 만든다
const c1 = (await as('authenticated', ids.t1, false, () => q(`insert into public.classes(name, code, student_count) values ('A반','111111',5) returning id`)))[0].id
const c2 = (await as('authenticated', ids.t2, false, () => q(`insert into public.classes(name, code, student_count) values ('B반','222222',5) returning id`)))[0].id
check(!!c1 && !!c2, '교사가 자기 학급을 만들 수 있어요')

// 익명 사용자는 학급을 만들 수 없다
check(await fails(() => as('authenticated', ids.a, true, () => q(`insert into public.classes(name, code) values ('몰래','999999')`))), '익명(학생) 사용자는 학급을 만들 수 없어요')

// 학생 입장
const sa = (await as('authenticated', ids.a, true, () => q(`select * from public.join_class('111111', 1)`)))[0]
const sb = (await as('authenticated', ids.b, true, () => q(`select * from public.join_class('111111', 2)`)))[0]
const sc = (await as('authenticated', ids.c, true, () => q(`select * from public.join_class('222222', 1)`)))[0]
check(sa?.number === 1 && sb?.number === 2 && sc?.number === 1, '학급 코드와 번호로 입장할 수 있어요')
check(await fails(() => as('authenticated', ids.a, true, () => q(`select * from public.join_class('000000', 1)`))), '틀린 코드로는 입장할 수 없어요')
check((await as('authenticated', ids.a, true, () => q(`select public.class_size('111111') as n`)))[0].n === 5, '코드가 맞으면 학급 인원 수를 알려 줘요')

// ── 1) 로그인하지 않은 요청(anon) ──
for (const t of ['classes', 'students', 'progress', 'attempts', 'teacher_notes']) {
  check(await fails(() => as('anon', null, false, () => q(`select * from public.${t}`))), `[비로그인] ${t} 읽기 거부`)
}
check(await fails(() => as('anon', null, false, () => q(`select * from public.join_class('111111', 3)`))), '[비로그인] 입장 함수 실행 거부')

// ── 2) 학생 본인 ──
const own = await as('authenticated', ids.a, true, () => q(`select id, number from public.students`))
check(own.length === 1 && own[0].number === 1, '[학생 A] 학생 표에서 자기 행만 보여요')
await as('authenticated', ids.a, true, () =>
  q(`insert into public.attempts(student_id, class_id, level, unit_id, item_id, target, answer, is_correct, first_try) values ($1,$2,'word','u1','u1-w0','책','책',true,true)`, [sa.id, c1]),
)
check(true, '[학생 A] 자기 문항 결과를 저장할 수 있어요')
await as('authenticated', ids.a, true, () => q(`insert into public.progress(student_id, unit_id, level, first_try_correct, total, passed) values ($1,'u1','word',8,8,true)`, [sa.id]))
check(true, '[학생 A] 자기 진도를 저장할 수 있어요')
check((await as('authenticated', ids.a, true, () => q(`select * from public.attempts`))).length === 1, '[학생 A] 자기 결과만 읽어요')
await as('authenticated', ids.a, true, () => q(`update public.students set state = '{"x":1}'::jsonb, updated_at = now() where id = $1`, [sa.id]))
check(true, '[학생 A] 자기 진행 상태(state)를 고칠 수 있어요')

// ── 3) 다른 학생 ──
check(await fails(() => as('authenticated', ids.a, true, () => q(`insert into public.attempts(student_id, class_id, level, unit_id, item_id, target, is_correct, first_try) values ($1,$2,'word','u1','u1-w1','x',true,true)`, [sb.id, c1]))), '[학생 A→B] 다른 학생 이름으로 결과 저장 거부')
check((await as('authenticated', ids.b, true, () => q(`select * from public.attempts`))).length === 0, '[학생 B] A 의 결과가 보이지 않아요')
check((await as('authenticated', ids.b, true, () => q(`select * from public.progress`))).length === 0, '[학생 B] A 의 진도가 보이지 않아요')
check(await fails(() => as('authenticated', ids.a, true, () => q(`update public.students set class_id = $1 where id = $2`, [c2, sa.id]))), '[학생 A] 다른 학급으로 옮기기(class_id 수정) 거부')
check(await fails(() => as('authenticated', ids.a, true, () => q(`update public.students set auth_uid = $1 where id = $2`, [ids.b, sa.id]))), '[학생 A] 입장 연결(auth_uid) 수정 거부')
const hijack = await as('authenticated', ids.a, true, () => q(`update public.students set state = '{"hack":1}'::jsonb where id = $1 returning id`, [sb.id]))
check(hijack.length === 0, '[학생 A→B] 다른 학생의 상태 수정은 0건')
check((await as('authenticated', ids.a, true, () => q(`select * from public.classes`))).length === 0, '[학생] 학급 표는 보이지 않아요')
check((await as('authenticated', ids.a, true, () => q(`select * from public.teacher_notes`))).length === 0, '[학생] 교사 메모는 보이지 않아요')
check(await fails(() => as('authenticated', ids.a, true, () => q(`insert into public.teacher_notes(student_id, class_id, note) values ($1,$2,'몰래')`, [sa.id, c1]))), '[학생] 교사 메모 쓰기 거부')

// ── 4) 교사 ──
check((await as('authenticated', ids.t1, false, () => q(`select * from public.students`))).length === 2, '[교사 1] 자기 학급 학생 2명만 보여요')
check((await as('authenticated', ids.t2, false, () => q(`select * from public.students`))).length === 1, '[교사 2] 자기 학급 학생 1명만 보여요')
check((await as('authenticated', ids.t2, false, () => q(`select * from public.attempts`))).length === 0, '[교사 2] 다른 교사 학급의 결과가 보이지 않아요')
check((await as('authenticated', ids.t1, false, () => q(`select * from public.attempts`))).length === 1, '[교사 1] 자기 학급 결과가 보여요')
await as('authenticated', ids.t1, false, () => q(`insert into public.teacher_notes(student_id, class_id, note) values ($1,$2,'잘하고 있어요')`, [sa.id, c1]))
check(true, '[교사 1] 자기 학급 학생에게 메모를 쓸 수 있어요')
check(await fails(() => as('authenticated', ids.t2, false, () => q(`insert into public.teacher_notes(student_id, class_id, note) values ($1,$2,'남의 반')`, [sa.id, c1]))), '[교사 2] 다른 교사 학급 학생에게 메모 쓰기 거부')
check((await as('authenticated', ids.t2, false, () => q(`delete from public.attempts returning id`))).length === 0, '[교사 2] 다른 교사 학급 결과 삭제는 0건')
check((await as('authenticated', ids.t1, false, () => q(`delete from public.attempts returning id`))).length === 1, '[교사 1] 자기 학급 결과는 지울 수 있어요 (초기화)')

console.log(bad === 0 ? '\n✅ 접근 규칙 시험 통과' : `\n❌ ${bad}건 실패`)
process.exit(bad === 0 ? 0 : 1)
