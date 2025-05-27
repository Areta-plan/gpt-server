#!/bin/bash

# 빠른 로컬 강제 푸시 스크립트
echo "🚀 빠른 로컬 → GitHub 강제 업데이트"

# 현재 브랜치 가져오기
BRANCH=$(git branch --show-current 2>/dev/null || echo "main")

# 모든 변경사항 추가 및 커밋
git add . && \
git commit -m "로컬 업데이트 $(date +'%Y-%m-%d %H:%M:%S')" && \
git push --force-with-lease origin $BRANCH

if [ $? -eq 0 ]; then
    echo "✅ 로컬 변경사항이 GitHub에 강제 반영되었습니다!"
else
    echo "❌ 실패. 수동으로 다음 명령어 실행:"
    echo "git push --force origin $BRANCH"
fi