#!/bin/bash

echo "⚡ 즉시 Git 복구 시작..."

# node_modules 제거 (문제의 원인)
echo "🗑️ 문제가 있는 node_modules 제거..."
rm -rf node_modules node_modules_backup 2>/dev/null || true

# Git 브랜치 복구
echo "🔄 브랜치 복구..."
git checkout main 2>/dev/null || git checkout master 2>/dev/null || git checkout -b main

# .gitignore 생성
echo "📝 .gitignore 업데이트..."
cat > .gitignore << 'EOF'
node_modules/
*.log
.env
.DS_Store
Thumbs.db
*.tmp
.vscode/
EOF

# 중요 파일들만 추가
echo "📦 중요 파일들 추가..."
git add --ignore-errors \
    server.js \
    package.json \
    package-lock.json \
    lib/ \
    routes/ \
    services/ \
    chatgpt-client/ \
    auto_classified/ \
    training_data/ \
    training_examples/ \
    system_prompts/ \
    scripts/ \
    .gitignore \
    *.sh \
    *.md \
    2>/dev/null

# 커밋
echo "💾 응급 커밋..."
git commit -m "응급 복구: 로컬 우선 강제 업데이트 $(date +'%Y-%m-%d %H:%M:%S')" 2>/dev/null

# 브랜치 확인
BRANCH=$(git branch --show-current 2>/dev/null || echo "main")

# 강제 푸시
echo "🚀 로컬 → GitHub 강제 업데이트..."
git push --force origin $BRANCH 2>/dev/null && \
echo "✅ 성공! 로컬이 GitHub에 강제 반영됨" || \
echo "❌ 실패 - 인터넷/권한 확인 필요"

# npm 재설치
echo "📦 npm 재설치..."
npm install --no-package-lock 2>/dev/null && \
echo "✅ npm 재설치 완료" || \
echo "⚠️ npm 재설치 실패 - 나중에 수동 실행"

echo "🎉 즉시 복구 완료!"