#!/usr/bin/env bash
# forstudent 스킬 설치 (macOS / Linux / Git Bash)
#
# 사용법 (이 폴더에서):
#   ./install.sh              # Claude 와 Codex 에 모두 설치 (설치되어 있는 것만)
#   ./install.sh claude       # Claude 에만
#   ./install.sh codex        # Codex 에만
#
# skills/forstudent 폴더를 ~/.claude/skills/forstudent, ~/.codex/skills/forstudent 로 복사합니다.
# 이미 있으면 새 내용으로 바꿉니다. 설치한 뒤에는 Claude / Codex 를 새로 시작하세요.
set -euo pipefail

src="$(cd "$(dirname "$0")" && pwd)/skills/forstudent"
[ -f "$src/SKILL.md" ] || { echo "SKILL.md 를 찾지 못했어요: $src" >&2; exit 1; }

which="${1:-all}"
install_to() {
  local name="$1" base="$2"
  if [ ! -d "$base" ]; then
    echo "건너뜀: $name 설정 폴더가 없어요 ($base). 설치되어 있지 않은 것 같아요."
    return
  fi
  local dest="$base/skills/forstudent"
  mkdir -p "$base/skills"
  rm -rf "$dest"
  cp -R "$src" "$dest"
  echo "설치했어요 ($name): $dest"
}

[ "$which" = "all" ] || [ "$which" = "claude" ] && install_to "Claude" "$HOME/.claude"
[ "$which" = "all" ] || [ "$which" = "codex" ] && install_to "Codex" "$HOME/.codex"
echo "끝. Claude / Codex 를 새로 시작한 뒤 새 대화에서 '학생용 웹앱을 만들고 싶어요'라고 말해 보세요."
