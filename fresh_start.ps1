# GitHub 완전 초기화 후 새로 업로드 스크립트
Write-Host "🔥 GitHub 완전 초기화 및 새로 업로드 시작..." -ForegroundColor Yellow

# 기존 Git 정보 완전 삭제
Write-Host "🗑️ 기존 Git 히스토리 완전 삭제..." -ForegroundColor Cyan
if (Test-Path ".git") {
    Remove-Item -Recurse -Force ".git" -ErrorAction SilentlyContinue
    Write-Host "✅ .git 폴더 삭제 완료" -ForegroundColor Green
}

# node_modules 삭제
Write-Host "🗑️ node_modules 삭제..." -ForegroundColor Cyan
if (Test-Path "node_modules") {
    Remove-Item -Recurse -Force "node_modules" -ErrorAction SilentlyContinue
    Write-Host "✅ node_modules 삭제 완료" -ForegroundColor Green
}

# 임시 파일들 정리
Write-Host "🧹 임시 파일들 정리..." -ForegroundColor Cyan
$tempFiles = @("*.log", "*.tmp", ".DS_Store", "Thumbs.db", "node_modules_backup")
foreach ($pattern in $tempFiles) {
    Remove-Item -Recurse -Force $pattern -ErrorAction SilentlyContinue
}

# .gitignore 생성
Write-Host "📝 새로운 .gitignore 생성..." -ForegroundColor Cyan
@"
# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage/
.nyc_output/

# Grunt intermediate storage
.grunt

# node-waf configuration
.lock-wscript

# Compiled binary addons
build/Release

# Dependency directories
jspm_packages/

# TypeScript v1 declaration files
typings/

# Optional npm cache directory
.npm

# Optional eslint cache
.eslintcache

# Optional REPL history
.node_repl_history

# Output of 'npm pack'
*.tgz

# Yarn Integrity file
.yarn-integrity

# dotenv environment variables file
.env
.env.test
.env.production

# parcel-bundler cache
.cache
.parcel-cache

# next.js build output
.next

# nuxt.js build output
.nuxt

# vuepress build output
.vuepress/dist

# Serverless directories
.serverless

# FuseBox cache
.fusebox/

# DynamoDB Local files
.dynamodb/

# TernJS port file
.tern-port

# OS generated files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# IDE files
.vscode/
.idea/
*.swp
*.swo
*~

# Logs
logs
*.log

# Backup files
*.backup
*.bak
*.tmp
"@ | Out-File -FilePath ".gitignore" -Encoding UTF8

Write-Host "✅ .gitignore 생성 완료" -ForegroundColor Green

# 새 Git 리포지토리 초기화
Write-Host "🆕 새 Git 리포지토리 초기화..." -ForegroundColor Cyan
git init
git branch -M main

Write-Host "📦 모든 파일 추가..." -ForegroundColor Cyan
git add .

$commitMsg = "초기 커밋: 완전 새로 시작 $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host "💾 초기 커밋: $commitMsg" -ForegroundColor Cyan
git commit -m $commitMsg

Write-Host ""
Write-Host "🎉 로컬 Git 리포지토리 준비 완료!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 다음 단계:" -ForegroundColor Yellow
Write-Host "1. GitHub에서 새 리포지토리 생성 (빈 리포지토리)" -ForegroundColor White
Write-Host "2. 아래 명령어로 원격 저장소 연결:" -ForegroundColor White
Write-Host ""
Write-Host "   git remote add origin https://github.com/your-username/your-repo-name.git" -ForegroundColor Cyan
Write-Host "   git push -u origin main" -ForegroundColor Cyan
Write-Host ""
Write-Host "또는 GitHub URL을 입력하시면 자동으로 연결합니다:" -ForegroundColor Yellow

$githubUrl = Read-Host "GitHub 리포지토리 URL을 입력하세요 (엔터만 누르면 건너뛰기)"
if ($githubUrl -and $githubUrl.Trim() -ne "") {
    Write-Host "🔗 원격 저장소 연결 중..." -ForegroundColor Cyan
    try {
        git remote add origin $githubUrl.Trim()
        Write-Host "🚀 GitHub에 업로드 중..." -ForegroundColor Cyan
        git push -u origin main
        Write-Host "✅ GitHub 업로드 완료!" -ForegroundColor Green
    } catch {
        Write-Host "❌ 업로드 실패. 수동으로 다음 명령어를 실행하세요:" -ForegroundColor Red
        Write-Host "git remote add origin $($githubUrl.Trim())" -ForegroundColor Cyan
        Write-Host "git push -u origin main" -ForegroundColor Cyan
    }
}

Write-Host ""
Write-Host "🎊 완전 새로운 시작 완료!" -ForegroundColor Green
Write-Host "이제 로컬과 GitHub가 완전히 동기화되었습니다." -ForegroundColor White