#!/bin/bash

# 로컬 중심 Git 워크플로우 스크립트
# 로컬이 무조건 최신이며, 이를 GitHub에 강제로 반영합니다.

echo "🔥 로컬 중심 Git 강제 업데이트 시작..."
echo "⚠️  경고: 이 스크립트는 로컬 변경사항을 GitHub에 강제로 반영합니다."
echo "⚠️  GitHub의 변경사항은 무시되고 덮어써집니다."
echo ""

# 사용자 확인
read -p "계속하시겠습니까? (y/N): " confirm
if [[ $confirm != [yY] && $confirm != [yY][eE][sS] ]]; then
    echo "❌ 취소되었습니다."
    exit 1
fi

echo "📋 현재 상태 확인 중..."

# Git 상태 확인
git status --porcelain > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "❌ Git 리포지토리가 아니거나 문제가 있습니다."
    exit 1
fi

# 현재 브랜치 확인
CURRENT_BRANCH=$(git branch --show-current)
echo "🌿 현재 브랜치: $CURRENT_BRANCH"

# 변경사항 추가
echo "📦 변경사항 스테이징 중..."
git add .

# 커밋 메시지 생성
COMMIT_MESSAGE="로컬 업데이트 강제 반영 $(date +'%Y-%m-%d %H:%M:%S')"

# 커밋
echo "💾 커밋 생성 중: $COMMIT_MESSAGE"
git commit -m "$COMMIT_MESSAGE" || echo "⚠️ 커밋할 변경사항이 없습니다."

# 원격 정보 확인
REMOTE_URL=$(git remote get-url origin 2>/dev/null)
if [ $? -ne 0 ] || [ -z "$REMOTE_URL" ]; then
    echo "❌ 원격 리포지토리(origin)가 설정되지 않았습니다."
    echo "원격 리포지토리를 설정하려면:"
    echo "git remote add origin <GitHub-URL>"
    exit 1
fi

echo "🌍 원격 리포지토리: $REMOTE_URL"

# 강제 푸시 (로컬을 기준으로 원격을 덮어씀)
echo "🚀 강제 푸시 시작..."
echo "⚠️  이 작업은 GitHub의 모든 변경사항을 로컬로 덮어씁니다!"

git push --force-with-lease origin $CURRENT_BRANCH

if [ $? -eq 0 ]; then
    echo "✅ 성공적으로 강제 푸시되었습니다!"
    echo "📊 로컬 변경사항이 GitHub에 반영되었습니다."
else
    echo "❌ 강제 푸시 실패!"
    echo "💡 다음 명령어로 수동 시도:"
    echo "   git push --force origin $CURRENT_BRANCH"
fi

echo ""
echo "📋 최종 상태:"
git log --oneline -5