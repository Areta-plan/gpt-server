#!/bin/bash

echo "🔥 GitHub 완전 초기화 및 새로 업로드 시작..."

# 기존 Git 정보 완전 삭제
echo "🗑️ 기존 Git 히스토리 완전 삭제..."
if [ -d ".git" ]; then
    rm -rf .git
    echo "✅ .git 폴더 삭제 완료"
fi

# node_modules 삭제
echo "🗑️ node_modules 삭제..."
if [ -d "node_modules" ]; then
    rm -rf node_modules
    echo "✅ node_modules 삭제 완료"
fi

# 임시 파일들 정리
echo "🧹 임시 파일들 정리..."
rm -rf *.log *.tmp .DS_Store Thumbs.db node_modules_backup 2>/dev/null || true

# .gitignore 생성
echo "📝 새로운 .gitignore 생성..."
cat > .gitignore << 'EOF'
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
EOF

echo "✅ .gitignore 생성 완료"

# 새 Git 리포지토리 초기화
echo "🆕 새 Git 리포지토리 초기화..."
git init
git branch -M main

echo "📦 모든 파일 추가..."
git add .

COMMIT_MSG="초기 커밋: 완전 새로 시작 $(date +'%Y-%m-%d %H:%M:%S')"
echo "💾 초기 커밋: $COMMIT_MSG"
git commit -m "$COMMIT_MSG"

echo ""
echo "🎉 로컬 Git 리포지토리 준비 완료!"
echo ""
echo "📋 다음 단계:"
echo "1. GitHub에서 새 리포지토리 생성 (빈 리포지토리)"
echo "2. 아래 명령어로 원격 저장소 연결:"
echo ""
echo "   git remote add origin https://github.com/your-username/your-repo-name.git"
echo "   git push -u origin main"
echo ""
echo "또는 GitHub URL을 입력하시면 자동으로 연결합니다:"

read -p "GitHub 리포지토리 URL을 입력하세요 (엔터만 누르면 건너뛰기): " GITHUB_URL

if [ ! -z "$GITHUB_URL" ]; then
    echo "🔗 원격 저장소 연결 중..."
    if git remote add origin "$GITHUB_URL"; then
        echo "🚀 GitHub에 업로드 중..."
        if git push -u origin main; then
            echo "✅ GitHub 업로드 완료!"
        else
            echo "❌ 업로드 실패. 수동으로 다음 명령어를 실행하세요:"
            echo "git push -u origin main"
        fi
    else
        echo "❌ 원격 저장소 연결 실패. 수동으로 다음 명령어를 실행하세요:"
        echo "git remote add origin $GITHUB_URL"
        echo "git push -u origin main"
    fi
fi

echo ""
echo "🎊 완전 새로운 시작 완료!"
echo "이제 로컬과 GitHub가 완전히 동기화되었습니다."