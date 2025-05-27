#!/bin/bash

echo "🚨 Git 응급 복구 시작..."
echo "⚠️  현재 상태: detached HEAD + node_modules 오류"
echo ""

# 1. node_modules 문제 해결 (심볼릭 링크 오류)
echo "🔧 1단계: node_modules 정리 중..."
if [ -d "node_modules" ]; then
    echo "node_modules 백업 및 재설치..."
    mv node_modules node_modules_backup 2>/dev/null || true
    npm install --no-package-lock 2>/dev/null || echo "npm install 실패 - 나중에 수동 설치 필요"
fi

# 2. Git 상태 확인
echo ""
echo "🔧 2단계: Git 상태 복구 중..."

# 현재 브랜치 확인
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null)
if [ -z "$CURRENT_BRANCH" ]; then
    echo "⚠️ detached HEAD 상태 확인됨"
    
    # main/master 브랜치 중 어느 것이 존재하는지 확인
    if git show-ref --verify --quiet refs/heads/main; then
        TARGET_BRANCH="main"
    elif git show-ref --verify --quiet refs/heads/master; then
        TARGET_BRANCH="master"
    else
        # 브랜치가 없으면 새로 생성
        TARGET_BRANCH="main"
        echo "🆕 새 브랜치 '$TARGET_BRANCH' 생성..."
        git checkout -b $TARGET_BRANCH
    fi
    
    echo "🔄 '$TARGET_BRANCH' 브랜치로 체크아웃..."
    git checkout $TARGET_BRANCH 2>/dev/null || git checkout -b $TARGET_BRANCH
else
    TARGET_BRANCH=$CURRENT_BRANCH
    echo "✅ 현재 브랜치: $TARGET_BRANCH"
fi

# 3. 중요한 파일들만 선별적으로 커밋
echo ""
echo "🔧 3단계: 중요 파일들만 선별 커밋..."

# node_modules 제외하고 중요 파일들만 추가
git add --ignore-errors \
    server.js \
    package.json \
    lib/ \
    routes/ \
    services/ \
    chatgpt-client/ \
    auto_classified/ \
    training_data/ \
    training_examples/ \
    system_prompts/ \
    scripts/ \
    *.js \
    *.json \
    *.md \
    *.sh \
    2>/dev/null || true

# .gitignore가 없으면 생성
if [ ! -f ".gitignore" ]; then
    echo "📝 .gitignore 생성..."
    cat > .gitignore << 'EOF'
node_modules/
*.log
.env
.DS_Store
Thumbs.db
*.tmp
*.swp
*.swo
.vscode/
.idea/
dist/
build/
coverage/
.nyc_output/
EOF
    git add .gitignore
fi

# 커밋
COMMIT_MSG="응급 복구: Git detached HEAD 해결 $(date +'%Y-%m-%d %H:%M:%S')"
echo "💾 커밋 생성: $COMMIT_MSG"
git commit -m "$COMMIT_MSG" 2>/dev/null || echo "⚠️ 커밋할 변경사항 없음"

# 4. 원격 저장소 확인 및 설정
echo ""
echo "🔧 4단계: 원격 저장소 설정 확인..."

# 원격 저장소 URL 확인
REMOTE_URL=$(git remote get-url origin 2>/dev/null)
if [ $? -ne 0 ] || [ -z "$REMOTE_URL" ]; then
    echo "❌ 원격 저장소(origin)가 설정되지 않음"
    echo "수동으로 설정하세요:"
    echo "git remote add origin <your-github-url>"
    echo ""
else
    echo "✅ 원격 저장소: $REMOTE_URL"
    
    # 5. 안전한 강제 푸시
    echo ""
    echo "🔧 5단계: 로컬 → GitHub 강제 업데이트..."
    echo "⚠️ 이 작업은 GitHub의 모든 변경사항을 로컬로 덮어씁니다!"
    
    read -p "계속하시겠습니까? (y/N): " confirm
    if [[ $confirm == [yY] || $confirm == [yY][eE][sS] ]]; then
        echo "🚀 강제 푸시 시작..."
        
        # 안전한 강제 푸시 시도
        git push --force-with-lease origin $TARGET_BRANCH 2>/dev/null || \
        git push --force origin $TARGET_BRANCH 2>/dev/null || \
        echo "❌ 푸시 실패 - 인터넷 연결 또는 권한 확인 필요"
        
        if [ $? -eq 0 ]; then
            echo "✅ 성공적으로 강제 푸시됨!"
        fi
    else
        echo "❌ 푸시 취소됨"
    fi
fi

echo ""
echo "📋 최종 상태:"
echo "브랜치: $(git branch --show-current 2>/dev/null || echo 'detached HEAD')"
echo "커밋: $(git log --oneline -1 2>/dev/null || echo '없음')"
echo ""
echo "🎉 응급 복구 완료!"
echo ""
echo "📝 추가 작업이 필요한 경우:"
echo "1. npm install (node_modules 재설치)"
echo "2. git remote add origin <URL> (원격 저장소 미설정시)"
echo "3. 누락된 파일 확인 및 복구"