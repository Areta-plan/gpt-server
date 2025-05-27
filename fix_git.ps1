# PowerShell Git 응급 복구 스크립트
Write-Host "🚨 Git 응급 복구 시작..." -ForegroundColor Yellow

# node_modules 문제 해결
Write-Host "🗑️ 문제 있는 node_modules 제거..." -ForegroundColor Cyan
if (Test-Path "node_modules") {
    Remove-Item -Recurse -Force "node_modules" -ErrorAction SilentlyContinue
}
if (Test-Path "node_modules_backup") {
    Remove-Item -Recurse -Force "node_modules_backup" -ErrorAction SilentlyContinue
}

# Git 브랜치 복구
Write-Host "🔄 Git 브랜치 복구..." -ForegroundColor Cyan
try {
    git checkout main 2>$null
} catch {
    try {
        git checkout master 2>$null
    } catch {
        git checkout -b main 2>$null
    }
}

# .gitignore 생성
Write-Host "📝 .gitignore 생성..." -ForegroundColor Cyan
@"
node_modules/
*.log
.env
.DS_Store
Thumbs.db
*.tmp
.vscode/
"@ | Out-File -FilePath ".gitignore" -Encoding UTF8

# 중요 파일들만 추가
Write-Host "📦 중요 파일들 Git에 추가..." -ForegroundColor Cyan
$importantFiles = @(
    "server.js",
    "package.json", 
    "package-lock.json",
    "lib/",
    "routes/",
    "services/",
    "chatgpt-client/",
    "auto_classified/",
    "training_data/",
    "training_examples/",
    "system_prompts/",
    "scripts/",
    ".gitignore",
    "*.sh",
    "*.ps1",
    "*.md"
)

foreach ($file in $importantFiles) {
    git add $file 2>$null
}

# 커밋
Write-Host "💾 응급 커밋 생성..." -ForegroundColor Cyan
$commitMsg = "응급 복구: 로컬 우선 강제 업데이트 $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
git commit -m $commitMsg 2>$null

# 현재 브랜치 확인
$branch = git branch --show-current 2>$null
if (-not $branch) { $branch = "main" }

# 강제 푸시
Write-Host "🚀 로컬 → GitHub 강제 업데이트..." -ForegroundColor Yellow
Write-Host "⚠️ 이 작업은 GitHub의 모든 변경사항을 로컬로 덮어씁니다!" -ForegroundColor Red

$confirm = Read-Host "계속하시겠습니까? (y/N)"
if ($confirm -eq "y" -or $confirm -eq "Y") {
    try {
        git push --force origin $branch 2>$null
        Write-Host "✅ 성공! 로컬이 GitHub에 강제 반영되었습니다!" -ForegroundColor Green
    } catch {
        Write-Host "❌ 푸시 실패 - 인터넷 연결 또는 GitHub 권한을 확인하세요" -ForegroundColor Red
    }
} else {
    Write-Host "❌ 푸시가 취소되었습니다" -ForegroundColor Red
}

# npm 재설치
Write-Host "📦 npm 의존성 재설치..." -ForegroundColor Cyan
try {
    npm install 2>$null
    Write-Host "✅ npm 재설치 완료!" -ForegroundColor Green
} catch {
    Write-Host "⚠️ npm 재설치 실패 - 나중에 수동으로 'npm install' 실행하세요" -ForegroundColor Yellow
}

Write-Host "🎉 Git 응급 복구 완료!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 복구 요약:" -ForegroundColor Cyan
Write-Host "- detached HEAD 상태 해결" -ForegroundColor White
Write-Host "- node_modules 파일시스템 오류 해결" -ForegroundColor White  
Write-Host "- 로컬 변경사항을 GitHub에 강제 반영" -ForegroundColor White
Write-Host "- npm 의존성 재설치" -ForegroundColor White