# forstudent

**선생님이 학생을 위한 학습 웹앱을 만들 때 쓰는 AI 스킬**입니다. Claude(Claude Code·Claude 앱)와 Codex에서 쓸 수 있습니다.

초등학교 선생님이 한글 받침 학습 웹앱을 처음부터 만든 과정에서 얻은 방식을, 다른 교과·다른 교실에서도 쓰도록 정리했습니다.

## 이 스킬을 쓰면 일어나는 일

선생님이 "우리 반 아이들이 쓸 연습 웹앱을 만들고 싶어요"라고 말하면, AI는 코드를 쓰기 전에 **먼저 네 가지를 묻습니다.**

1. 학생의 배움이 멈추는 순간은 언제입니까?
2. 학생이 가장 먼저 해야 할 일은 무엇입니까?
3. 웹앱 또는 도구로써 구현하고 싶은 기능은 무엇입니까?
4. 웹앱에 들어가서는 안되는 정보는 무엇입니까?

그 답으로 5줄 기획 요약을 만들어 확인받고, 다음 방식으로 만들어 갑니다.

- **기능이 아니라 배움이 멈추는 순간**에서 시작합니다. 첫 버전은 기능 **하나**를 끝까지 만듭니다.
- 학생은 **학급 코드와 번호**로 입장합니다. 이름·이메일·비밀번호를 받지 않습니다.
- 기록은 **교사의 피드백**으로 이어집니다: 첫 시도 기록, 반복 오류, "먼저 살펴볼 학생". 앱이 학생을 평가하지 않습니다.
- **들어가면 안 되는 정보**는 금지 목록으로 만들어 코드 점검으로 지킵니다.
- 접근 권한(학생은 자기 기록만, 교사는 자기 학급만)을 **실제로 시험**합니다.
- 단계별로 만들고(기반 → 첫 기능 → 나머지 → 통합 검증), **확인한 것과 확인하지 못한 것을 나눠** 보고합니다.
- 유료 사용, 되돌릴 수 없는 삭제, 운영 DB 변경, 배포는 **먼저 설명하고 승인**받습니다.

## 간단한 웹앱부터 시작할 수 있습니다

**학생별 학습 기록과 교사 대시보드는 각각 선택 사항**이며, 기본은 둘 다 만들지 않는 것입니다.

| 목표 | 방법 |
|---|---|
| 단순 낱말·퀴즈·읽기 연습 | HTML·CSS·JavaScript만으로 제작, DB·대시보드 없이 사용 |
| GitHub 없이 웹앱 공유 | Google Apps Script + `Code.gs`/`Index.html` 방식 |
| 학생별 학습 기록 관리 | 인증·권한이 검증된 DB를 선택; 교사 대시보드는 선택 |
| 교사 대시보드도 필요 | 별도로 요청하면 기록형 앱에 추가 |

GitHub·Supabase·Vercel은 **필수 연동이 아니라 기존에 운영한 권장 조합**입니다. Apps Script는 React/Vite 코드를 그대로 실행하는 방식이 아닙니다. 학생별 기록을 시트로 공개하지 마세요. [간단한 제작·배포 가이드](skills/forstudent/references/09-simple-deployment.md)를 참고하세요.

## 구성

```
skills/forstudent/
  SKILL.md                  스킬 본문 (질문 → 설계 → 단계별 개발 → 검증·보고)
  agents/openai.yaml        Codex 표시 정보
  references/               01 질문 해설 · 02 학습 설계 · 03 개인정보 · 04 기술 구성
                            05 개발 순서 · 06 교사 화면 · 07 점검표 · 08 실제 교훈
  templates/                기획서 · 프로젝트 지침 · 최종 보고 양식
                            schema-starter.sql (학급 코드 입장 + 접근 규칙)
                            privacy-check.mjs + forbidden.example.json (개인정보 점검)
  evals/evals.json          스킬이 잘 불리는지 시험하는 질문 예시
install.ps1 / install.sh    설치 스크립트
scripts/                    validate.mjs (스킬 구조 점검), test-schema-rls.mjs (SQL 접근 규칙 시험)
                            package.mjs (Claude 앱·웹 업로드용 forstudent.zip 만들기)
```

## 설치

쓰는 곳에 따라 방법이 다릅니다. (GitHub 계정이 없어도 됩니다.) 저장소 주소: https://github.com/duruyeofin-rgb/forstudent

### Claude 앱·웹에서 쓰기 (스킬 업로드) — 가장 쉬운 방법

1. **[forstudent.zip 내려받기](https://github.com/duruyeofin-rgb/forstudent/releases/latest/download/forstudent.zip)**
2. **압축을 풀지 말고 그대로** Claude 설정의 스킬(Skills) 메뉴에서 올립니다. (메뉴 이름은 버전에 따라 다를 수 있어요.)
3. 새 대화에서 쓰세요.

> **주의**: 이 페이지의 초록색 **Code → Download ZIP**으로 받은 `forstudent-main.zip`은 업로드하지 마세요. 저장소 전체가 들어 있어서 `SKILL.md file must be in the top-level folder` 오류가 납니다. 위의 `forstudent.zip`은 `forstudent/SKILL.md` 구조로 미리 만들어 둔 파일입니다.

### Claude Code · Codex에서 쓰기 (설치 스크립트)

이 페이지 위쪽의 초록색 **Code** 버튼 → **Download ZIP**으로 내려받아 압축을 풀고, 그 폴더에서 아래 명령을 실행하세요. `git clone`한 폴더에서도 같습니다. 스크립트가 알아서 `skills/forstudent`를 설치 위치로 복사하므로 다시 압축할 필요가 없습니다.

**Windows (PowerShell)**

```powershell
.\install.ps1              # Claude 와 Codex 에 모두 설치 (설치되어 있는 것만)
.\install.ps1 -Claude      # Claude 에만
.\install.ps1 -Codex       # Codex 에만
.\install.ps1 -DryRun      # 복사하지 않고 설치 위치만 보기
```

**macOS / Linux**

```bash
./install.sh               # 모두  (./install.sh claude, ./install.sh codex)
```

설치 위치는 다음과 같습니다. 직접 폴더를 복사해도 같습니다.

| 도구 | 위치 |
|---|---|
| Claude Code | `~/.claude/skills/forstudent` (한 프로젝트에만 쓰려면 `<프로젝트>/.claude/skills/forstudent`) |
| Codex | `~/.codex/skills/forstudent` |
| Claude 앱·웹 | 위의 `forstudent.zip`을 설정의 스킬(Skills) 메뉴에서 올립니다 (복사가 아니라 업로드) |

Codex의 `$skill-installer`로도 설치할 수 있습니다: `$skill-installer install https://github.com/duruyeofin-rgb/forstudent/tree/main/skills/forstudent`

설치한 뒤에는 Claude / Codex를 **새로 시작**하고 **새 대화**에서 쓰세요.

## 쓰는 법

새 대화에서 이렇게 말하면 됩니다. 스킬 이름을 부르지 않아도 학생용 웹앱을 만들겠다는 말이면 자동으로 쓰이고, 확실히 하려면 이름을 부르세요.

- "forstudent 스킬로 우리 반 곱셈구구 연습 웹앱을 만들고 싶어요."
- "학생들이 쓸 영어 단어 퀴즈 사이트를 만들어 줘."
- "우리 반 학생 독서 기록을 선생님이 볼 수 있는 앱이 필요해요."

그러면 AI가 네 가지 질문을 보여 줍니다. 한두 문장으로 답하면 되고, 막막하면 "예시 보여 줘"라고 하세요.

## 업데이트

설치한 스킬은 복사본이라서 저장소가 바뀌어도 저절로 바뀌지 않습니다. 새 내용을 받으려면 다시 설치하세요.

- **Claude Code · Codex**: 저장소를 다시 내려받거나 `git pull`한 뒤 설치 스크립트를 다시 실행하면 새 내용으로 바뀝니다.
- **Claude 앱·웹**: [Releases](https://github.com/duruyeofin-rgb/forstudent/releases)에서 최신 `forstudent.zip`을 받아 다시 올립니다. 같은 이름의 스킬이 이미 올라가 있으면 화면 안내에 따라 바꾸거나, 기존 스킬을 지운 뒤 올리세요.

## 안전 안내

- 이 저장소에는 **학생 정보와 비밀 값(비밀번호, 토큰, API 키)이 없습니다.** `npm run validate`가 비밀 값처럼 보이는 것과 특정 프로젝트의 주소·ID가 들어 있는지 검사합니다.
- `templates/schema-starter.sql`은 시작점입니다. 가상의 PostgreSQL(PGlite)에서 접근 규칙(비로그인 거부, 학생 본인만, 다른 학생·다른 교사 거부 등 35가지)을 시험했지만, **실제 운영 DB에 적용하기 전에 시험용 프로젝트에서 같은 시험을 다시 하세요.**
- 스킬은 AI에게 주는 지침입니다. AI가 만든 앱의 개인정보 보호와 학교 정책 준수는 **선생님이 최종 확인**해야 합니다. 학교의 정보 보호 담당자와 보호자 안내를 먼저 확인하세요.

## 개발자용 점검

```bash
npm install
npm run validate       # 스킬 구조 점검 (이름·설명·길이·네 질문·가리키는 파일·비밀 값)
npm run test:schema    # schema-starter.sql 적용과 접근 규칙 시험
npm run check          # 위 둘을 모두
npm run package        # dist/forstudent.zip 만들기 (Claude 앱·웹 업로드용, 맨 위 폴더 forstudent/)
```

**새 버전 내기**: 스킬을 고친 뒤 점검과 ZIP 만들기를 하고, 만든 ZIP을 Releases에 올립니다. 올리는 파일 이름은 항상 `forstudent.zip`이어야 위의 내려받기 링크가 계속 최신 파일을 가리킵니다.

```bash
npm run check && npm run package
gh release create v0.2.0 dist/forstudent.zip --title "forstudent v0.2.0" --notes "바뀐 점"
```

## 라이선스

[MIT 라이선스](LICENSE)입니다. 선생님들이 자유롭게 쓰고, 고치고, 다시 나눌 수 있습니다. 저작권 표시(연두부형)와 라이선스 문구만 함께 남겨 주세요.

이 스킬은 있는 그대로 제공되며 어떤 보증도 하지 않습니다. 이 스킬로 만든 앱의 개인정보 보호와 학교 정책 준수는 앱을 만드는 선생님이 최종 확인해 주세요.

이 스킬이 도움이 되었다면, 고치거나 보탠 점을 이슈나 풀 리퀘스트로 알려 주시면 함께 나아질 수 있습니다.
