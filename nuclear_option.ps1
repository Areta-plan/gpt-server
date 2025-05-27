# 핵 옵션: 모든 것을 날리고 완전 새로 시작
Write-Host "☢️ 핵 옵션: GitHub 완전 초기화 시작..." -ForegroundColor Red
Write-Host "⚠️ 이 스크립트는 모든 Git 히스토리를 완전히 삭제합니다!" -ForegroundColor Yellow
Write-Host ""

$confirm = Read-Host "정말로 모든 것을 날리고 새로 시작하시겠습니까? (yes/no)"
if ($confirm -ne "yes") {
    Write-Host "❌ 작업이 취소되었습니다." -ForegroundColor Red
    exit 1
}

Write-Host "💥 모든 Git 정보 삭제 중..." -ForegroundColor Red

# Git과 관련된 모든 것 삭제
$itemsToDelete = @(
    ".git",
    "node_modules", 
    "node_modules_backup",
    "*.log",
    "*.tmp",
    ".DS_Store",
    "Thumbs.db"
)

foreach ($item in $itemsToDelete) {
    if (Test-Path $item) {
        Remove-Item -Recurse -Force $item -ErrorAction SilentlyContinue
        Write-Host "🗑️ $item 삭제됨" -ForegroundColor Yellow
    }
}

# 완전 새로운 .gitignore
Write-Host "📝 새 .gitignore 생성..." -ForegroundColor Cyan
@"
node_modules/
*.log
.env
.DS_Store
Thumbs.db
*.tmp
.vscode/
.idea/
dist/
build/
coverage/
.nyc_output/
"@ | Out-File -FilePath ".gitignore" -Encoding UTF8

# 완전 새로운 Git 시작
Write-Host "🆕 완전 새로운 Git 시작..." -ForegroundColor Green
git init
git branch -M main
git add .
git commit -m "🎊 완전 새로운 시작 - 모든 히스토리 삭제됨"

Write-Host ""
Write-Host "🎉 핵 옵션 완료!" -ForegroundColor Green
Write-Host "💡 이제 GitHub에서 리포지토리를 삭제하고 새로 만든 후:" -ForegroundColor Cyan
Write-Host "   git remote add origin <NEW-GITHUB-URL>" -ForegroundColor White
Write-Host "   git push -u origin main" -ForegroundColor White
Write-Host ""
Write-Host "🔥 완전히 새로운 시작입니다!" -ForegroundColor Red