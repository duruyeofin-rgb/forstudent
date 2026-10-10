# forstudent 스킬 설치 (Windows PowerShell)
#
# 사용법 (이 폴더에서):
#   .\install.ps1              # Claude 와 Codex 에 모두 설치 (설치되어 있는 것만)
#   .\install.ps1 -Claude      # Claude 에만
#   .\install.ps1 -Codex       # Codex 에만
#   .\install.ps1 -DryRun      # 복사하지 않고 어디에 설치할지만 보여 줌
#
# 하는 일: skills\forstudent 폴더를 아래 위치로 복사합니다. (이미 있으면 새 내용으로 바꿉니다)
#   Claude : %USERPROFILE%\.claude\skills\forstudent
#   Codex  : %USERPROFILE%\.codex\skills\forstudent
# 설치한 뒤에는 Claude / Codex 를 새로 시작해서 새 대화에서 쓰세요.
param(
  [switch]$Claude,
  [switch]$Codex,
  [switch]$DryRun
)
$ErrorActionPreference = 'Stop'

$src = Join-Path $PSScriptRoot 'skills\forstudent'
if (-not (Test-Path (Join-Path $src 'SKILL.md'))) { throw "SKILL.md 를 찾지 못했어요: $src" }
if (-not $Claude -and -not $Codex) { $Claude = $true; $Codex = $true }

$targets = @()
if ($Claude) { $targets += [pscustomobject]@{ Name = 'Claude'; Root = (Join-Path $HOME '.claude\skills') } }
if ($Codex)  { $targets += [pscustomobject]@{ Name = 'Codex';  Root = (Join-Path $HOME '.codex\skills') } }

foreach ($t in $targets) {
  $home_dir = Split-Path $t.Root -Parent
  if (-not (Test-Path $home_dir)) {
    Write-Host "건너뜀: $($t.Name) 설정 폴더가 없어요 ($home_dir). 설치되어 있지 않은 것 같아요."
    continue
  }
  $dest = Join-Path $t.Root 'forstudent'
  if ((Split-Path $dest -Leaf) -ne 'forstudent') { throw "설치 위치가 이상해요: $dest" }
  if ($DryRun) { Write-Host "[미리보기] $($t.Name): $src  ->  $dest"; continue }
  New-Item -ItemType Directory -Force -Path $t.Root | Out-Null
  if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
  Copy-Item -Recurse -Force $src $dest
  Write-Host "설치했어요 ($($t.Name)): $dest"
}
Write-Host "끝. Claude / Codex 를 새로 시작한 뒤 새 대화에서 '학생용 웹앱을 만들고 싶어요'라고 말해 보세요."
