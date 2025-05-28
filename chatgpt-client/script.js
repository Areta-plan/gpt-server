// Modern GPT Blog Generator Client Script

// 전역 변수
let selectedKnowledgeFiles = [];
let availableKnowledgeFiles = [];

// 전역 변수 - 평가 시스템
let evaluationData = {
    files: {},
    currentFile: null,
    evaluations: {},
    totalFiles: 0,
    completedFiles: 0,
    finalSubmitted: false  // 최종 RLHF 제출 완료 여부
};


// 평가 데이터 저장/로드 함수들
function saveEvaluationData() {
    try {
        localStorage.setItem('evaluationData', JSON.stringify(evaluationData));
    } catch (error) {
    }
}

function loadEvaluationData() {
    try {
        const saved = localStorage.getItem('evaluationData');
        console.log('💾 localStorage 데이터 로드:', saved);
        if (saved) {
            const parsedData = JSON.parse(saved);
            console.log('💾 파싱된 데이터:', parsedData);
            // 기존 데이터와 병합 (files 정보는 서버에서 새로 가져오고, evaluations만 복원)
            evaluationData.evaluations = parsedData.evaluations || {};
            evaluationData.completedFiles = parsedData.completedFiles || 0;
            evaluationData.finalSubmitted = parsedData.finalSubmitted || false;
            console.log('💾 복원된 evaluationData:', evaluationData);
            
            // 최종 제출 완료된 경우 리셋 버튼 비활성화
            if (evaluationData.finalSubmitted) {
                setTimeout(() => {
                    const resetBtn = document.getElementById('resetBtn');
                    if (resetBtn) {
                        resetBtn.disabled = true;
                        resetBtn.style.opacity = '0.5';
                        resetBtn.style.cursor = 'not-allowed';
                        resetBtn.title = '최종 제출 완료 후에는 초기화할 수 없습니다';
                    }
                }, 100);
            }
            
            return true;
        }
    } catch (error) {
    }
    return false;
}

function clearEvaluationData() {
    localStorage.removeItem('evaluationData');
    evaluationData.evaluations = {};
    evaluationData.completedFiles = 0;
}

// 완료된 파일 상태를 UI에 복원
function restoreCompletedFileStatus() {
    
    for (const [filename, evaluation] of Object.entries(evaluationData.evaluations)) {
        if (evaluation.completed) {
            // 파일이 속한 카테고리 찾기
            let fileCategory = null;
            for (const [category, files] of Object.entries(evaluationData.files)) {
                if (files.some(file => file.filename === filename)) {
                    fileCategory = category;
                    break;
                }
            }
            
            if (fileCategory) {
                updateFileItemStatus(fileCategory, filename);
            }
        }
    }
    
    console.log('🔄 완료된 파일 상태 복원 완료');
}

// 모든 평가 데이터 초기화 (사용자 요청)
function resetAllEvaluations() {
    // 최종 제출 후에는 리셋 불가
    if (evaluationData.finalSubmitted) {
        alert('⚠️ 이미 최종 RLHF 제출이 완료되어 평가 데이터를 초기화할 수 없습니다.\n\n새로운 평가를 시작하려면 페이지를 새로고침하세요.');
        return;
    }
    
    const confirmReset = confirm('⚠️ 정말로 모든 평가 데이터를 초기화하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.');
    
    if (confirmReset) {
        clearEvaluationData();
        
        // UI에서 모든 완료 표시 제거
        document.querySelectorAll('.file-item').forEach(item => {
            item.classList.remove('evaluated');
            const statusSpan = item.querySelector('.file-status');
            if (statusSpan) {
                statusSpan.textContent = '';
            }
        });
        
        // 통계 업데이트
        updateEvaluationStats();
        
        // 현재 평가 상태 초기화
        if (evaluationData.currentFile) {
            resetEvaluationState();
        }
        
        alert('✅ 모든 평가 데이터가 초기화되었습니다.');
        console.log('🗑️ 사용자 요청으로 모든 평가 데이터 초기화 완료');
    }
}

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🚀 애플리케이션 초기화 시작...');
    
    // 저장된 평가 데이터 로드
    loadEvaluationData();
    
    // 시스템 상태 체크
    const systemStatus = await checkSystemStatus();
    if (systemStatus) {
        console.log('✅ 시스템 상태 정상:', systemStatus);
    } else {
        console.warn('⚠️ 시스템 상태 체크 실패');
        showErrorMessage('시스템 상태를 확인할 수 없습니다. 서버 연결을 확인하세요.');
    }
    
    // 기본 초기화
    loadKnowledgeFiles();
    setupDragDrop();
    loadUnratedFiles();
    
    console.log('🎉 애플리케이션 초기화 완료');
});

// 블로그 추출 함수
async function extractBlog() {
    const urlInput = document.getElementById('blogUrlInput');
    const extractBtn = document.getElementById('extractBtn');
    const statusDiv = document.getElementById('extractStatus');
    
    const url = urlInput.value.trim();
    
    if (!url) {
        showExtractStatus('URL을 입력해주세요.', 'error');
        return;
    }
    
    // URL 유효성 검사
    try {
        new URL(url);
    } catch (error) {
        showExtractStatus('유효한 URL을 입력해주세요.', 'error');
        return;
    }
    
    // 버튼 비활성화 및 로딩 상태
    extractBtn.disabled = true;
    extractBtn.textContent = '추출 중...';
    showExtractStatus('', 'loading');
    
    try {
        const response = await fetch('/extract-blog', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url })
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            showExtractStatus(`✅ 추출 완료! ${result.newFiles}개의 새로운 파일이 생성되었습니다.`, 'success');
            
            // URL 입력창 비우기
            urlInput.value = '';
            
            // 새로운 블로그 추출 시 평가 데이터 리셋 (중요!)
            console.log('🔄 새 블로그 추출 - 평가 데이터 리셋');
            evaluationData = {
                files: {},
                currentFile: null,
                evaluations: {},
                totalFiles: 0,
                completedFiles: 0,
                finalSubmitted: false,
                currentEvaluation: null
            };
            localStorage.removeItem('evaluationData');
            
            // 파일 목록 새로고침
            setTimeout(() => {
                loadUnratedFiles();
            }, 1000);
            
        } else {
            showExtractStatus(`❌ 추출 실패: ${result.error || '알 수 없는 오류'}`, 'error');
        }
        
    } catch (error) {
        console.error('블로그 추출 오류:', error);
        showExtractStatus(`❌ 네트워크 오류: ${error.message}`, 'error');
    } finally {
        // 버튼 상태 복원
        extractBtn.disabled = false;
        extractBtn.textContent = '추출';
    }
}

// 추출 상태 표시 함수
function showExtractStatus(message, type) {
    const statusDiv = document.getElementById('extractStatus');
    
    if (type === 'loading') {
        // 로딩 상태: 스피닝 아이콘 + 텍스트 (텍스트는 회전하지 않음)
        statusDiv.innerHTML = '<div class="loading"><span class="loading-text">블로그 내용을 추출하고 분류하는 중...</span></div>';
    } else {
        statusDiv.textContent = message;
    }
    
    statusDiv.className = `extract-status ${type}`;
    
    // 성공/오류 메시지는 5초 후 자동 제거
    if (type === 'success' || type === 'error') {
        setTimeout(() => {
            statusDiv.textContent = '';
            statusDiv.className = 'extract-status';
        }, 5000);
    }
}

// 탭 전환 함수
function showTab(tabName) {
    // 모든 탭 버튼과 컨텐츠 비활성화
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    // 선택된 탭 활성화
    event.target.classList.add('active');
    document.getElementById(tabName).classList.add('active');
    
    // 지식 검색 탭 선택 시 파일 로드
    if (tabName === 'knowledge') {
        loadKnowledgeFiles();
    }
    
    // 자동 분류 탭 선택 시 미평가 파일 로드
    if (tabName === 'classification') {
        loadUnratedFiles();
    }
}

// 1. 일반 채팅
async function sendChat() {
    const message = document.getElementById('chatMessage').value.trim();
    if (!message) {
        alert('메시지를 입력하세요.');
        return;
    }
    
    const resultDiv = document.getElementById('chatResult');
    resultDiv.innerHTML = '<div class="loading"></div> 응답 생성 중...';
    
    try {
        const response = await fetch('/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            resultDiv.textContent = data.answer;
        } else {
            resultDiv.textContent = `오류: ${data.error}`;
        }
    } catch (error) {
        resultDiv.textContent = `네트워크 오류: ${error.message}`;
    }
}

// 2. 블로그 생성
async function generateBlog() {
    const topic = document.getElementById('blogTopic').value.trim();
    const target = document.getElementById('blogTarget').value.trim();
    const tone = document.getElementById('blogTone').value;
    const brand = document.getElementById('blogBrand').value.trim();
    const style = document.querySelector('input[name="blogStyle"]:checked').value;
    
    if (!topic || !target || !brand) {
        alert('필수 항목을 모두 입력하세요.');
        return;
    }
    
    const resultDiv = document.getElementById('blogResult');
    resultDiv.innerHTML = '<div class="loading"></div> 블로그 생성 중...';
    
    // 업로드된 파일들 처리
    const formData = new FormData();
    formData.append('topic', topic);
    formData.append('target', target);
    formData.append('tone', tone);
    formData.append('brand', brand);
    formData.append('style', style);
    
    // 업로드된 파일들 추가
    const uploadedFiles = document.getElementById('blogFiles').files;
    for (let i = 0; i < uploadedFiles.length; i++) {
        formData.append('files', uploadedFiles[i]);
    }
    
    try {
        const response = await fetch('/blog', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (response.ok) {
            resultDiv.textContent = data.blog;
        } else {
            resultDiv.textContent = `오류: ${data.error}`;
        }
    } catch (error) {
        resultDiv.textContent = `네트워크 오류: ${error.message}`;
    }
}

// 파일 업로드 관련 함수들
let uploadedFiles = [];

function handleFileSelect(event) {
    const files = Array.from(event.target.files);
    
    // 최대 5개 파일 제한
    if (uploadedFiles.length + files.length > 5) {
        alert('최대 5개 파일까지만 업로드할 수 있습니다.');
        return;
    }
    
    files.forEach(file => {
        if (file.size > 10 * 1024 * 1024) { // 10MB 제한
            alert(`${file.name}은 10MB를 초과합니다.`);
            return;
        }
        
        uploadedFiles.push(file);
    });
    
    updateFileList();
}

function updateFileList() {
    const fileList = document.getElementById('fileList');
    
    if (uploadedFiles.length === 0) {
        fileList.style.display = 'none';
        return;
    }
    
    fileList.style.display = 'block';
    fileList.innerHTML = uploadedFiles.map((file, index) => `
        <div class="file-item">
            <span>📄 ${file.name} (${(file.size / 1024).toFixed(1)}KB)</span>
            <button class="file-remove" onclick="removeFile(${index})">삭제</button>
        </div>
    `).join('');
}

function removeFile(index) {
    uploadedFiles.splice(index, 1);
    updateFileList();
    
    // input 파일 목록도 업데이트
    const input = document.getElementById('blogFiles');
    const dt = new DataTransfer();
    uploadedFiles.forEach(file => dt.items.add(file));
    input.files = dt.files;
}

// 드래그 앤 드롭 기능
function setupDragDrop() {
    const dropZone = document.getElementById('fileDropZone');
    
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });
    
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        
        const files = Array.from(e.dataTransfer.files);
        const input = document.getElementById('blogFiles');
        
        const dt = new DataTransfer();
        Array.from(input.files).forEach(file => dt.items.add(file));
        files.forEach(file => dt.items.add(file));
        input.files = dt.files;
        
        handleFileSelect({ target: input });
    });
}

// 미평가 파일 로드
async function loadUnratedFiles() {
    try {
        console.log('📋 미평가 파일 로드 시작...');
        
        const response = await fetch('/classification/unrated');
        console.log('📋 서버 응답 상태:', response.status, response.statusText);
        
        if (response.ok) {
            const data = await response.json();
            console.log('📋 받은 데이터:', data);
            
            if (data.success) {
                // 서버에서 받은 미평가 파일들
                const unratedFiles = data.data.unrated;
                
                // localStorage에 저장된 완료된 파일들을 추가
                const allFiles = { ...unratedFiles };
                
                // 완료된 평가들을 파일 목록에 추가
                Object.entries(evaluationData.evaluations).forEach(([filename, evaluation]) => {
                    if (evaluation.completed && evaluation.category) {
                        const category = evaluation.category;
                        if (!allFiles[category]) {
                            allFiles[category] = [];
                        }
                        
                        // 해당 파일이 미평가 목록에 없으면 추가
                        const existsInUnrated = allFiles[category].some(f => f.filename === filename);
                        if (!existsInUnrated) {
                            allFiles[category].push({
                                filename: filename,
                                content: evaluation.content || '',
                                category: category
                            });
                        }
                    }
                });
                
                evaluationData.files = allFiles;
                
                // 총 파일 수 계산 (미평가 + 완료된 파일)
                const totalFileCount = Object.values(allFiles).reduce((sum, files) => sum + files.length, 0);
                evaluationData.totalFiles = totalFileCount;
                
                // 저장된 완료 상태 개수 계산
                evaluationData.completedFiles = Object.values(evaluationData.evaluations).filter(e => e.completed).length;
                
                console.log('📋 로드된 총 파일 수:', evaluationData.totalFiles);
                console.log('📋 완료된 평가:', evaluationData.completedFiles);
                console.log('📋 카테고리별 파일:', Object.keys(evaluationData.files).map(cat => `${cat}: ${evaluationData.files[cat].length}`));
                
                renderFileList();
                updateEvaluationStats();
                
                // 저장된 평가 상태를 UI에 반영
                restoreCompletedFileStatus();
            } else {
                console.error('❌ 데이터 로드 실패:', data.error);
                showErrorMessage('미평가 파일 데이터 로드에 실패했습니다.');
            }
        } else {
            console.error('❌ 서버 응답 오류:', response.status);
            showErrorMessage(`서버 오류: ${response.status} - 미평가 파일을 불러올 수 없습니다.`);
        }
    } catch (error) {
        console.error('❌ 미평가 파일 로드 오류:', error);
        showErrorMessage(`네트워크 오류: ${error.message}`);
    }
}

// 시스템 상태 체크 (디버깅용)
async function checkSystemStatus() {
    try {
        console.log('🔍 시스템 상태 체크 시작...');
        
        const response = await fetch('/debug/system-status');
        if (response.ok) {
            const status = await response.json();
            console.log('🔍 시스템 상태:', status);
            return status;
        } else {
            console.error('❌ 시스템 상태 체크 실패:', response.status);
            return null;
        }
    } catch (error) {
        console.error('❌ 시스템 상태 체크 오류:', error);
        return null;
    }
}

// 에러 메시지 표시
function showErrorMessage(message) {
    // 기존 에러 메시지가 있다면 제거
    const existingError = document.getElementById('errorMessage');
    if (existingError) {
        existingError.remove();
    }
    
    // 새 에러 메시지 생성
    const errorDiv = document.createElement('div');
    errorDiv.id = 'errorMessage';
    errorDiv.className = 'error-message';
    errorDiv.innerHTML = `
        <div class="error-content">
            <span class="error-icon">⚠️</span>
            <span class="error-text">${message}</span>
            <button class="error-close" onclick="this.parentElement.parentElement.remove()">×</button>
        </div>
    `;
    
    // 분류 탭에 에러 메시지 추가
    const classificationTab = document.getElementById('classification');
    if (classificationTab) {
        classificationTab.insertBefore(errorDiv, classificationTab.firstChild);
    }
    
    // 5초 후 자동 제거
    setTimeout(() => {
        if (errorDiv && errorDiv.parentNode) {
            errorDiv.remove();
        }
    }, 5000);
}

// 파일 목록 렌더링
function renderFileList() {
    const categories = ['title', 'firstparagraph', 'closing', 'story', 'usp'];
    
    categories.forEach(category => {
        const container = document.getElementById(`${category}Files`);
        const files = evaluationData.files[category] || [];
        
        if (files.length === 0) {
            container.innerHTML = '<p class="no-files">평가할 파일이 없습니다</p>';
            return;
        }
        
        // 최종 RLHF 제출 완료 시에만 파일 목록 숨김 (디버깅)
        console.log('🔍 파일 목록 표시 체크:', {
            finalSubmitted: evaluationData.finalSubmitted,
            evaluationsCount: Object.keys(evaluationData.evaluations).length,
            evaluations: evaluationData.evaluations
        });
        
        if (evaluationData.finalSubmitted && Object.keys(evaluationData.evaluations).length === 0) {
            console.log('❌ 파일 목록 숨김 - 최종 제출 완료');
            container.innerHTML = '<p class="no-files">평가 완료 - RLHF 제출이 완료되었습니다</p>';
            return;
        }
        
        container.innerHTML = files.map(file => {
            const evaluation = evaluationData.evaluations[file.filename];
            const isEvaluated = evaluation && evaluation.completed;
            
            let statusIcon = '⏳'; // 기본: 평가 대기
            let statusClass = '';
            let resetButton = '';
            
            if (isEvaluated) {
                // 평가 완료 (제안하기 눌름) - 초록색 체크, 열람 가능
                statusIcon = '✅';
                statusClass = 'evaluated';
                resetButton = `<button class="reset-btn" onclick="event.stopPropagation(); resetFileEvaluation('${file.filename}')" title="평가 초기화">🔄</button>`;
            }
            
            const clickHandler = `onclick="selectFile('${category}', '${file.filename}')"`;
            
            return `
                <div class="file-item ${statusClass}" 
                     ${clickHandler}
                     data-category="${category}" 
                     data-filename="${file.filename}">
                    <span>${file.filename}</span>
                    <div class="file-actions">
                        <span class="file-status">${statusIcon}</span>
                        ${resetButton}
                    </div>
                </div>
            `;
        }).filter(item => item !== '').join('');
    });
}

// 개별 파일 평가 초기화
function resetFileEvaluation(filename) {
    if (confirm(`${filename}의 평가를 초기화하시겠습니까?`)) {
        // localStorage에서 해당 파일 평가 데이터 제거
        if (evaluationData.evaluations[filename]) {
            delete evaluationData.evaluations[filename];
            saveEvaluationData();
            
            // UI 새로고침
            loadUnratedFiles();
            
            // 현재 선택된 파일이면 평가 섹션 초기화
            if (evaluationData.currentFile?.filename === filename) {
                resetEvaluationState();
            }
            
            console.log(`📝 ${filename} 평가 초기화 완료`);
        }
    }
}

// 파일 선택
async function selectFile(category, filename) {
    
    // 최종 제출 완료 시에는 파일 목록이 숨겨지므로 이 함수 호출되지 않음
    
    // 이전 선택 해제
    document.querySelectorAll('.file-item').forEach(item => {
        item.classList.remove('selected');
    });
    
    // 새로운 파일 선택
    const selectedItem = document.querySelector(`[data-category="${category}"][data-filename="${filename}"]`);
    if (selectedItem) {
        selectedItem.classList.add('selected');
    }
    
    evaluationData.currentFile = { category, filename };
    
    // 저장된 평가 상태가 있으면 복원, 없으면 초기화
    const savedEvaluation = evaluationData.evaluations[filename];
    
    // currentEvaluation 초기화 (중요!)
    if (!evaluationData.evaluations[filename]) {
        evaluationData.evaluations[filename] = {};
    }
    evaluationData.currentEvaluation = evaluationData.evaluations[filename];
    
    if (savedEvaluation && savedEvaluation.completed) {
        // 평가 완료된 경우: 평가 결과 복원 (다시 열람 가능)
        restoreEvaluationState(savedEvaluation);
    } else {
        // 새 파일이거나 미평가 파일: 초기화
        resetEvaluationState();
    }
    
    // 파일 내용 로드
    await loadFileContent(category, filename);
    
    // 평가 섹션 표시
    showEvaluationSection();
}

// 평가 상태 복원
function restoreEvaluationState(savedEvaluation) {
    // 별점 복원
    if (savedEvaluation.classificationScore) {
        setStarRating('classification', savedEvaluation.classificationScore);
    }
    if (savedEvaluation.taggingScore) {
        setStarRating('tagging', savedEvaluation.taggingScore);
    }
    
    // 개선 사항 복원
    const improvementTextarea = document.getElementById('improvementText');
    if (improvementTextarea && savedEvaluation.improvement) {
        improvementTextarea.value = savedEvaluation.improvement;
    }
    
    // 제안하기 버튼 활성화
    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = '재제출';
    }
    
    console.log('📋 평가 상태 복원됨:', savedEvaluation);
}

// 별점 설정 헬퍼 함수
function setStarRating(type, score) {
    const stars = document.querySelectorAll(`#${type}Stars .star`);
    stars.forEach((star, index) => {
        if (index < score) {
            star.classList.add('selected');
        } else {
            star.classList.remove('selected');
        }
    });
    
    // 점수 저장 (안전장치 추가)
    if (evaluationData.currentEvaluation) {
        if (type === 'classification') {
            evaluationData.currentEvaluation.classificationScore = score;
        } else if (type === 'tagging') {
            evaluationData.currentEvaluation.taggingScore = score;
        }
    }
}

// 파일 내용 로드
async function loadFileContent(category, filename) {
    const viewer = document.getElementById('fileContentViewer');
    viewer.innerHTML = '<div class="loading"></div> 파일 내용을 불러오는 중...';
    
    try {
        // 여기서는 실제 파일 내용을 가져오는 API 호출을 해야 합니다
        // 현재는 샘플 데이터로 대체
        const fileData = evaluationData.files[category]?.find(f => f.filename === filename);
        
        if (fileData) {
            // 파일 내용을 평가 데이터에 저장 (완료된 파일 복원용)
            const filename = evaluationData.currentFile.filename;
            if (!evaluationData.evaluations[filename]) {
                evaluationData.evaluations[filename] = {};
            }
            evaluationData.evaluations[filename].content = fileData.content || '';
            evaluationData.evaluations[filename].category = category;
            
            // user와 assistant 부분을 분리하여 표시
            const userContent = fileData.classification || '';
            const assistantContent = fileData.content || '';
            
            viewer.innerHTML = `
                <div class="file-content">
                    <div class="content-header">
                        <h5>📄 ${filename} (${category})</h5>
                    </div>
                    
                    <div class="content-section">
                        <div class="section-header">
                            <h6>👤 User (원본 텍스트)</h6>
                        </div>
                        <div class="content-body user-content">${userContent || '원본 텍스트를 불러올 수 없습니다.'}</div>
                    </div>
                    
                    <div class="content-section">
                        <div class="section-header">
                            <h6>🤖 Assistant (Claude 분류 결과)</h6>
                        </div>
                        <div class="content-body assistant-content">${assistantContent || 'Claude 분류 결과를 불러올 수 없습니다.'}</div>
                    </div>
                </div>
            `;
        } else {
            viewer.innerHTML = `
                <div class="content-placeholder">
                    <div class="placeholder-icon">❌</div>
                    <p>파일을 찾을 수 없습니다.</p>
                </div>
            `;
        }
    } catch (error) {
        viewer.innerHTML = `
            <div class="content-placeholder">
                <div class="placeholder-icon">❌</div>
                <p>파일 로드 중 오류가 발생했습니다.</p>
            </div>
        `;
    }
}

// 평가 섹션 표시
function showEvaluationSection() {
    const evaluationSection = document.getElementById('evaluationSection');
    evaluationSection.style.display = 'block';
    
    // 삭제 섹션도 표시 (파일이 선택되었으므로)
    const deletionSection = document.getElementById('deletionSection');
    if (deletionSection) {
        deletionSection.style.display = 'block';
    }
    
    // 기존 평가가 있다면 복원
    const currentEval = evaluationData.evaluations[evaluationData.currentFile.filename];
    if (currentEval) {
        if (currentEval.classificationScore) {
            setClassificationScore(currentEval.classificationScore, false);
            document.getElementById('taggingEvaluation').style.display = 'block';
        }
        if (currentEval.taggingScore) {
            setTaggingScore(currentEval.taggingScore, false);
            document.getElementById('improvementSuggestion').style.display = 'block';
        }
        if (currentEval.improvement !== undefined) {
            document.getElementById('improvementText').value = currentEval.improvement || '';
            document.getElementById('completionSection').style.display = 'block';
        }
    } else {
        // 새로운 평가 시작
        resetEvaluationSteps();
    }
}

// 평가 단계 초기화
function resetEvaluationSteps() {
    document.getElementById('classificationEvaluation').style.display = 'block';
    document.getElementById('taggingEvaluation').style.display = 'none';
    document.getElementById('improvementSuggestion').style.display = 'none';
    
    // 별점 초기화
    document.querySelectorAll('.star-btn').forEach(btn => {
        btn.classList.remove('selected', 'filled', 'preview');
    });
    
    document.getElementById('improvementText').value = '';
}

// 평가 상태 완전 초기화 (파일 전환 시)
function resetEvaluationState() {
    resetEvaluationSteps();
    
    // 현재 파일의 평가 데이터도 UI에서 제거 (완료되지 않은 경우)
    if (evaluationData.currentFile) {
        const filename = evaluationData.currentFile.filename;
        const evaluation = evaluationData.evaluations[filename];
        
        // 완료되지 않은 평가는 UI에서만 초기화 (데이터는 유지)
        if (evaluation && !evaluation.completed) {
            resetEvaluationSteps();
        }
    }
}

// 분류 점수 설정
function setClassificationScore(score, proceed = true) {
    if (!evaluationData.currentFile) return;
    
    const filename = evaluationData.currentFile.filename;
    if (!evaluationData.evaluations[filename]) {
        evaluationData.evaluations[filename] = {};
    }
    
    evaluationData.evaluations[filename].classificationScore = score;
    
    // 별점 UI 업데이트
    updateStarRating('#classificationEvaluation', score);
    
    if (proceed) {
        // 다음 단계로 진행
        setTimeout(() => {
            document.getElementById('taggingEvaluation').style.display = 'block';
        }, 500);
    }
}

// 태깅 점수 설정
function setTaggingScore(score, proceed = true) {
    if (!evaluationData.currentFile) return;
    
    const filename = evaluationData.currentFile.filename;
    evaluationData.evaluations[filename].taggingScore = score;
    
    // 별점 UI 업데이트
    updateStarRating('#taggingEvaluation', score);
    
    if (proceed) {
        // 다음 단계로 진행
        setTimeout(() => {
            document.getElementById('improvementSuggestion').style.display = 'block';
        }, 500);
    }
}

// 별점 UI 업데이트 함수
function updateStarRating(sectionSelector, score) {
    const section = document.querySelector(sectionSelector);
    if (!section) return;
    
    const stars = section.querySelectorAll('.star-btn');
    
    stars.forEach((star, index) => {
        star.classList.remove('selected', 'filled', 'preview');
        
        if (index + 1 <= score) {
            star.classList.add('filled');
        }
        
        if (index + 1 === score) {
            star.classList.add('selected');
        }
    });
}

// 별점 미리보기 (호버 효과)
function previewStars(type, score) {
    const sectionId = type === 'classification' ? 'classificationStarRating' : 'taggingStarRating';
    const section = document.getElementById(sectionId);
    if (!section) return;
    
    const stars = section.querySelectorAll('.star-btn');
    
    stars.forEach((star, index) => {
        star.classList.remove('preview');
        
        if (index + 1 <= score) {
            star.classList.add('preview');
        }
    });
}

// 별점 미리보기 초기화
function resetStarPreview(type) {
    const sectionId = type === 'classification' ? 'classificationStarRating' : 'taggingStarRating';
    const section = document.getElementById(sectionId);
    if (!section) return;
    
    const stars = section.querySelectorAll('.star-btn');
    stars.forEach(star => {
        star.classList.remove('preview');
    });
}

// 개선 제안 건너뛰고 완료
function skipImprovementAndComplete() {
    if (!evaluationData.currentFile) return;
    
    const filename = evaluationData.currentFile.filename;
    evaluationData.evaluations[filename].improvement = '';
    
    // 즉시 평가 완료
    completeEvaluation();
}

// 개선 제안 제출하고 완료
function submitImprovementAndComplete() {
    if (!evaluationData.currentFile) return;
    
    const filename = evaluationData.currentFile.filename;
    const improvementText = document.getElementById('improvementText').value.trim();
    
    evaluationData.evaluations[filename].improvement = improvementText;
    
    // 반복 문구 피드백 자동 감지 및 처리
    detectAndProcessRepetitiveFeedback(improvementText, evaluationData.currentFile.category);
    
    // 즉시 평가 완료
    completeEvaluation();
}

// 반복 문구 피드백 자동 감지 및 처리
async function detectAndProcessRepetitiveFeedback(improvementText, category) {
    if (!improvementText) return;
    
    // 반복 문구 관련 키워드 체크
    const repetitiveKeywords = ['반복', '똑같', '계속', '매번', '또', '다시', '뻔한', '진부한', '중복'];
    const hasRepetitiveComplaint = repetitiveKeywords.some(keyword => 
        improvementText.includes(keyword)
    );
    
    if (hasRepetitiveComplaint) {
        try {
            // RLHF 시스템에 반복 문구 피드백 자동 제출
            const feedbackData = {
                type: 'repetitive_complaint',
                classification: evaluationData.currentFile.content || '',
                userFeedback: improvementText,
                category: category,
                timestamp: new Date().toISOString(),
                source: 'improvement_suggestion',
                filename: evaluationData.currentFile.filename
            };
            
            await fetch('/api/classification/repetitive/feedback', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    content: feedbackData.classification,
                    feedback: feedbackData.userFeedback,
                    category: feedbackData.category
                })
            });
            
            console.log('🚫 반복 문구 피드백 자동 처리됨:', improvementText);
            
        } catch (error) {
            console.error('❌ 반복 문구 피드백 자동 처리 실패:', error);
        }
    }
}

// 개별 파일 평가 완료
async function completeEvaluation() {
    if (!evaluationData.currentFile) return;
    
    const filename = evaluationData.currentFile.filename;
    const evaluation = evaluationData.evaluations[filename];
    
    // 필수 점수가 있는지 확인
    if (!evaluation.classificationScore || !evaluation.taggingScore) {
        showErrorMessage('분류 점수와 태깅 점수를 모두 입력해주세요.');
        return;
    }
    
    try {
        // RLHF 피드백 제출
        await submitRLHFFeedback(evaluation);
        
        // 평가 완료 마크 (제안하기 단계)
        evaluation.completed = true;
        evaluation.completedAt = new Date().toISOString();
        // submitted는 최종 RLHF 제출에서만 true로 설정
        
        // 평가 데이터 저장 (localStorage)
        saveEvaluationData();
        
        // UI 업데이트 (파일 목록 새로고침하여 체크마크 표시)
        loadUnratedFiles();
        updateEvaluationStats();
        
        // 평가 UI 초기화
        resetEvaluationState();
        
        // 자동으로 다음 파일로 이동
        setTimeout(() => {
            moveToNextFile();
        }, 500);
        
    } catch (error) {
        console.error('평가 완료 중 오류:', error);
        showErrorMessage('평가 제출 중 오류가 발생했습니다: ' + error.message);
    }
}

// 파일 아이템 상태 업데이트
function updateFileItemStatus(category, filename) {
    const fileItem = document.querySelector(`[data-category="${category}"][data-filename="${filename}"]`);
    if (fileItem) {
        fileItem.classList.add('evaluated');
        const statusSpan = fileItem.querySelector('.file-status');
        if (statusSpan) {
            statusSpan.textContent = '✅';
        }
    }
}

// 평가 통계 업데이트
function updateEvaluationStats() {
    const completed = Object.values(evaluationData.evaluations).filter(e => e.completed).length;
    evaluationData.completedFiles = completed;
    
    document.getElementById('evaluationProgress').textContent = `평가 진행: ${completed}/${evaluationData.totalFiles}`;
    document.getElementById('completedCount').textContent = `완료: ${completed}개`;
    
    // 모든 파일 평가 완료 시에만 제출 버튼 활성화
    const submitBtn = document.getElementById('submitAllBtn');
    if (completed === evaluationData.totalFiles && completed > 0) {
        submitBtn.disabled = false;
        submitBtn.textContent = `🚀 ${completed}개 평가 완료 - RLHF 제출`;
    } else {
        submitBtn.disabled = true;
        submitBtn.textContent = `🚀 모든 평가 완료 후 RLHF 제출 (${completed}/${evaluationData.totalFiles})`;
    }
}

// RLHF 피드백 개별 제출
async function submitRLHFFeedback(evaluation) {
    if (!evaluationData.currentFile) return;
    
    const { category, filename } = evaluationData.currentFile;
    
    // RLHF 피드백 데이터 구성
    const feedbackData = {
        type: 'individual_evaluation',
        filename: filename,
        category: category,
        classificationScore: evaluation.classificationScore,
        taggingScore: evaluation.taggingScore,
        improvement: evaluation.improvement || '',
        timestamp: new Date().toISOString()
    };
    
    try {
        const response = await fetch('/rlhf-feedback', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(feedbackData)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        console.log('✅ RLHF 피드백 제출 완료:', result);
        
        return result;
    } catch (error) {
        console.error('❌ RLHF 피드백 제출 실패:', error);
        throw error;
    }
}

// 다음 파일로 이동
function moveToNextFile() {
    const categories = ['title', 'firstparagraph', 'closing', 'story', 'usp'];
    
    for (const category of categories) {
        const files = evaluationData.files[category] || [];
        for (const file of files) {
            const evaluation = evaluationData.evaluations[file.filename];
            if (!evaluation || !evaluation.completed) {
                selectFile(category, file.filename);
                return;
            }
        }
    }
    
    // 모든 파일 완료
    alert('🎉 모든 파일 평가가 완료되었습니다! 이제 RLHF 제출이 가능합니다.');
}

// 모든 평가 제출
async function submitAllEvaluations() {
    const completedEvaluations = Object.entries(evaluationData.evaluations)
        .filter(([_, eval]) => eval.completed)
        .map(([filename, eval]) => ({
            filename,
            ...eval
        }));
    
    if (completedEvaluations.length === 0) {
        alert('제출할 평가가 없습니다.');
        return;
    }
    
    try {
        const response = await fetch('/rlhf-feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'bulk_evaluation',
                evaluations: completedEvaluations,
                timestamp: new Date().toISOString(),
                totalEvaluations: completedEvaluations.length
            })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            alert(`✅ ${completedEvaluations.length}개 평가가 성공적으로 제출되어 RLHF 시스템에 반영되었습니다!`);
            
            // 최종 제출 완료 마킹
            evaluationData.finalSubmitted = true;
            
            // 평가 데이터 초기화 (파일 목록 숨김을 위해)
            evaluationData.evaluations = {};
            evaluationData.completedFiles = 0;
            evaluationData.currentFile = null;
            
            // 제출 완료 상태 저장
            saveEvaluationData();
            
            // 리셋 버튼 비활성화
            const resetBtn = document.getElementById('resetBtn');
            if (resetBtn) {
                resetBtn.disabled = true;
                resetBtn.style.opacity = '0.5';
                resetBtn.style.cursor = 'not-allowed';
                resetBtn.title = '최종 제출 완료 후에는 초기화할 수 없습니다';
            }
            
            // UI 재로드 (파일 목록 숨김)
            loadUnratedFiles();
            
            // 평가 섹션 숨김
            const evaluationSection = document.getElementById('evaluationSection');
            if (evaluationSection) {
                evaluationSection.style.display = 'none';
            }
        } else {
            alert(`❌ 제출 실패: ${result.error || '알 수 없는 오류'}`);
        }
    } catch (error) {
        alert(`❌ 네트워크 오류: ${error.message}`);
    }
}

// 파일 삭제 확인
function confirmDeleteFile() {
    if (!evaluationData.currentFile) {
        alert('선택된 파일이 없습니다.');
        return;
    }
    
    const { category, filename } = evaluationData.currentFile;
    
    const confirmMessage = `정말로 이 파일을 삭제하시겠습니까?\n\n파일: ${filename}\n카테고리: ${category}\n\n⚠️ 삭제된 파일은 복구할 수 없습니다.`;
    
    if (confirm(confirmMessage)) {
        deleteFile(category, filename);
    }
}

// 파일 삭제 실행
async function deleteFile(category, filename) {
    try {
        console.log('🗑️ 파일 삭제 요청 시작:', { category, filename });
        
        const response = await fetch('/classification/delete-file', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                category, 
                filename,
                reason: 'incorrect_classification'
            })
        });
        
        console.log('🗑️ 서버 응답 상태:', response.status, response.statusText);
        console.log('🗑️ 응답 헤더 Content-Type:', response.headers.get('content-type'));
        
        if (response.ok) {
            const result = await response.json();
            console.log('✅ 삭제 성공 응답:', result);
            
            // 성공 메시지
            alert(`✅ 파일 "${filename}"이 성공적으로 삭제되었습니다.`);
            
            // 로컬 데이터에서 파일 제거
            removeFileFromLocalData(category, filename);
            
            // UI 업데이트
            renderFileList();
            updateEvaluationStats();
            
            // 파일 뷰어 초기화
            resetFileViewer();
            
        } else {
            console.error('❌ 삭제 실패 - 응답 상태:', response.status);
            
            // 응답이 JSON인지 확인
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                const error = await response.json();
                alert(`❌ 파일 삭제 실패: ${error.error || '알 수 없는 오류'}`);
            } else {
                // HTML 또는 다른 형식의 응답
                const text = await response.text();
                console.error('❌ 비JSON 응답:', text.substring(0, 200));
                alert(`❌ 서버 오류: HTTP ${response.status} - 관리자에게 문의하세요.`);
            }
        }
    } catch (error) {
        console.error('파일 삭제 오류:', error);
        alert(`❌ 네트워크 오류: ${error.message}`);
    }
}

// 로컬 데이터에서 파일 제거
function removeFileFromLocalData(category, filename) {
    if (evaluationData.files[category]) {
        evaluationData.files[category] = evaluationData.files[category].filter(
            file => file.filename !== filename
        );
    }
    
    // 평가 데이터에서도 제거
    if (evaluationData.evaluations[filename]) {
        delete evaluationData.evaluations[filename];
    }
    
    // 현재 선택된 파일이 삭제된 파일이면 초기화
    if (evaluationData.currentFile && evaluationData.currentFile.filename === filename) {
        evaluationData.currentFile = null;
    }
    
    // 총 파일 수 업데이트
    evaluationData.totalFiles = Object.values(evaluationData.files)
        .reduce((total, files) => total + files.length, 0);
}

// 파일 뷰어 초기화
function resetFileViewer() {
    const viewer = document.getElementById('fileContentViewer');
    viewer.innerHTML = `
        <div class="content-placeholder">
            <div class="placeholder-icon">📁</div>
            <p>왼쪽에서 평가할 파일을 선택하세요</p>
        </div>
    `;
    
    // 평가 섹션 숨기기
    document.getElementById('evaluationSection').style.display = 'none';
    
    // 삭제 섹션도 숨기기
    const deletionSection = document.getElementById('deletionSection');
    if (deletionSection) {
        deletionSection.style.display = 'none';
    }
}

// 4. 지식 베이스 로드
async function loadKnowledgeFiles() {
    const container = document.getElementById('knowledgeFiles');
    if (!container) {
        console.log('📚 knowledgeFiles 엘리먼트가 없습니다. 건너뜁니다.');
        return;
    }
    container.innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon">📚</div>
            <p>지식 베이스를 로딩 중입니다...</p>
        </div>
    `;
    
    try {
        const response = await fetch('/ask'); // RAG 파일 목록을 가져오는 엔드포인트
        if (response.ok) {
            // 임시 데이터 - 실제로는 서버에서 가져와야 함
            availableKnowledgeFiles = [
                { id: 'patent_guide', name: '특허 출원 가이드', description: '특허 출원 절차와 주의사항에 대한 종합 가이드' },
                { id: 'trademark_law', name: '상표법 해설', description: '상표 등록 및 보호에 관한 법률 정보' },
                { id: 'ip_strategy', name: 'IP 전략 수립', description: '지식재산권 전략 수립을 위한 실무 가이드' },
                { id: 'design_patent', name: '디자인 특허', description: '디자인 특허 출원과 심사 기준' },
                { id: 'utility_model', name: '실용신안', description: '실용신안 등록 절차와 요건' },
                { id: 'copyright_guide', name: '저작권 보호', description: '저작권 등록과 침해 대응 방법' }
            ];
            renderKnowledgeFiles();
        } else {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">⚠️</div>
                    <p>지식 베이스를 로드할 수 없습니다.</p>
                </div>
            `;
        }
    } catch (error) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">❌</div>
                <p>네트워크 오류가 발생했습니다.</p>
            </div>
        `;
    }
}

// 지식 파일 렌더링
function renderKnowledgeFiles() {
    const container = document.getElementById('knowledgeFiles');
    
    if (availableKnowledgeFiles.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📚</div>
                <p>사용 가능한 지식 베이스가 없습니다.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = availableKnowledgeFiles.map(file => `
        <div class="knowledge-item" onclick="toggleKnowledgeFile('${file.id}')">
            <div class="knowledge-title">${file.name}</div>
            <div class="knowledge-description">${file.description}</div>
        </div>
    `).join('');
    
    updateSelectedCount();
}

// 지식 파일 선택/해제
function toggleKnowledgeFile(fileId) {
    const index = selectedKnowledgeFiles.indexOf(fileId);
    
    if (index === -1) {
        // 선택
        if (selectedKnowledgeFiles.length >= 3) {
            alert('최대 3개까지만 선택할 수 있습니다.');
            return;
        }
        selectedKnowledgeFiles.push(fileId);
    } else {
        // 해제
        selectedKnowledgeFiles.splice(index, 1);
    }
    
    updateKnowledgeUI();
}

// 지식 파일 UI 업데이트
function updateKnowledgeUI() {
    // 선택된 파일들 하이라이트
    document.querySelectorAll('.knowledge-item').forEach((item, index) => {
        const fileId = availableKnowledgeFiles[index].id;
        if (selectedKnowledgeFiles.includes(fileId)) {
            item.classList.add('selected');
        } else {
            item.classList.remove('selected');
        }
    });
    
    updateSelectedCount();
}

// 선택된 파일 수 업데이트
function updateSelectedCount() {
    document.getElementById('selectedCount').textContent = selectedKnowledgeFiles.length;
}

// 선택 초기화
function clearSelection() {
    selectedKnowledgeFiles = [];
    updateKnowledgeUI();
}

// 5. 지식 검색
async function askWithKnowledge() {
    const query = document.getElementById('knowledgeQuery').value.trim();
    
    if (!query) {
        alert('질문을 입력하세요.');
        return;
    }
    
    if (selectedKnowledgeFiles.length === 0) {
        alert('최소 1개의 지식 베이스를 선택하세요.');
        return;
    }
    
    const resultDiv = document.getElementById('knowledgeResult');
    resultDiv.innerHTML = '<div class="loading"></div> 지식 검색 중...';
    
    try {
        const response = await fetch('/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                message: query,
                knowledgeFiles: selectedKnowledgeFiles 
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            resultDiv.innerHTML = `
                <div style="background: #e3f2fd; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                    <strong>📚 참고한 지식 베이스:</strong><br>
                    ${selectedKnowledgeFiles.map(id => {
                        const file = availableKnowledgeFiles.find(f => f.id === id);
                        return file ? file.name : id;
                    }).join(', ')}
                </div>
                ${data.answer}
            `;
        } else {
            resultDiv.textContent = `오류: ${data.error}`;
        }
    } catch (error) {
        resultDiv.textContent = `네트워크 오류: ${error.message}`;
    }
}

// 새로운 평가 시스템으로 교체됨 - 기존 분류 함수들 제거됨


// Enter 키 이벤트 처리
document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && e.ctrlKey) {
        const activeTab = document.querySelector('.tab-content.active');
        const activeTabId = activeTab.id;
        
        switch(activeTabId) {
            case 'chat':
                sendChat();
                break;
            case 'blog':
                generateBlog();
                break;
            case 'classification':
                // 자동분류 탭에서는 Enter 키 동작 없음 (평가 인터페이스)
                break;
            case 'knowledge':
                askWithKnowledge();
                break;
        }
    }
});