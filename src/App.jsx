import { useState, useEffect } from 'react';
import { Sparkles, BookOpen, Download, User, GraduationCap, BrainCircuit, AlertCircle, Sun, Moon } from 'lucide-react';
import html2canvas from 'html2canvas';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Papa from 'papaparse';
// import { getTrackRecommendation } from './lib/gemini'; // 서버 이관으로 제거
import { fetchGoogleSheetAsCSV } from './lib/googleSheets';

// Static Data
import curriculum1 from '../primary_data/curriculum1.json';
import curriculum2 from '../primary_data/curriculum2.json';
import curriculum3 from '../primary_data/curriculum3.json';
import studentList from '../secondary_data/student_list.json';
import teacherCSV from '../certification/teacher.csv?raw';

// Google Sheets ID
const PROGRAMS_SHEET_ID = '1T8X-Zgp7QKciF3XTfe3JhcImZUSjkkqe4ZHY1WXYKRc';

function App() {
    const [isAuth, setIsAuth] = useState(false);
    const [userRole, setUserRole] = useState('student');
    const [userInfo, setUserInfo] = useState({ name: '', id: '', grade: '1', interest: '', style: 'activity' });
    const [recommendation, setRecommendation] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [authError, setAuthError] = useState('');
    const [programsRaw, setProgramsRaw] = useState(''); // Google Sheets 데이터
    const [isLoadingPrograms, setIsLoadingPrograms] = useState(true);
    const [apiCallsLeft, setApiCallsLeft] = useState(10); // 남은 API 호출 횟수
    const [showAbuseModal, setShowAbuseModal] = useState(false); // 비속어 경고 모달
    const [loadingProgress, setLoadingProgress] = useState(0); // 로딩 진행바 상태
    const [theme, setTheme] = useState(() => localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));

    // 테마 적용
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    // 로딩 진행바 상태 관리
    useEffect(() => {
        let interval;
        if (isLoading) {
            setLoadingProgress(0);
            // 약 60~120초 동안 서서히 채워지도록 설정 (Gemini 모델 응답 시간 고려)
            interval = setInterval(() => {
                setLoadingProgress(prev => {
                    if (prev >= 98) return prev; // 98%에서 멈춤 (완료 시점까지 대기)
                    // 초기에는 빠르게, 갈수록 조금씩 느려지는 진행 속도
                    const increment = prev < 30 ? 2 : (prev < 70 ? 0.8 : 0.2);
                    return parseFloat((prev + increment).toFixed(1));
                });
            }, 1000);
        } else {
            setLoadingProgress(0);
        }
        return () => clearInterval(interval);
    }, [isLoading]);

    // API 사용량 체크 로직 제거됨 (서버 측에서 처리)

    // 비속어 체크 로직
    const containsAbuse = (text) => {
        const abuseKeywords = ['C8', 'c8', '니미', '18', '씨팔', '시발', '개새끼', '병신', '존나', '엿', '닥쳐', '미친', '호로', '쌍놈', '쓰레기', '지랄', '엠창'];
        return abuseKeywords.some(keyword => text.includes(keyword));
    };

    // Google Sheets에서 프로그램 데이터 로드
    useEffect(() => {
        const loadProgramsData = async () => {
            try {
                setIsLoadingPrograms(true);
                const csvData = await fetchGoogleSheetAsCSV(PROGRAMS_SHEET_ID);
                setProgramsRaw(csvData);
                console.log('✅ 프로그램 데이터 로드 성공');
            } catch (error) {
                console.error('❌ 프로그램 데이터 로드 실패:', error);
                alert('프로그램 데이터를 불러오는데 실패했습니다. 페이지를 새로고침해주세요.');
            } finally {
                setIsLoadingPrograms(false);
            }
        };

        loadProgramsData();
    }, []);

    // [수정] PapaParse 라이브러리를 사용하여 CSV 파싱 문제(따옴표, 줄바꿈 등) 원천 해결
    const parseProgramCSV = (csv) => {
        if (!csv) return [];
        // PapaParse는 문자열을 바로 파싱해줍니다.
        const result = Papa.parse(csv, {
            header: true,         // 첫 줄을 헤더로 인식 -> JSON 객체 배열로 변환
            skipEmptyLines: true, // 빈 줄 건너뛰기
            dynamicTyping: false  // 모든 값을 문자열로 유지 (데이터 변형 방지)
        });

        // 파싱된 데이터(result.data)에 '프로그램명' 필드가 있는지 확인
        if (result.errors.length > 0) {
            console.error("CSV Parsing Errors:", result.errors);
        }

        return result.data;
    };

    // 교사 인증 로직 (성계 및 비밀번호 검증)
    const checkTeacherAuth = (name, password) => {
        const lines = teacherCSV.split('\n').filter(line => line.trim());
        // 1번째 줄은 헤더(구분,비번)이므로 2번째 줄부터 검사
        for (let i = 1; i < lines.length; i++) {
            const [csvName, csvPassword] = lines[i].split(',').map(v => v?.trim());
            if (csvName === name.trim() && csvPassword === password.trim()) {
                return true;
            }
        }
        return false;
    };

    // Normalize student ID (4자리 -> 5자리 변환)
    // 예: 1101 -> 10101, 1803 -> 10803
    const normalizeStudentId = (id) => {
        const trimmedId = id.trim();
        if (trimmedId.length === 4) {
            // 첫 번째 자리 + '0' + 나머지 3자리
            return trimmedId[0] + '0' + trimmedId.slice(1);
        }
        return trimmedId;
    };

    const handleAuth = (e) => {
        e.preventDefault();
        setAuthError('');

        if (userRole === 'teacher') {
            // Teacher Auth: Check against teacher.csv (Name & Password)
            if (checkTeacherAuth(userInfo.name, userInfo.id)) {
                setIsAuth(true);
                // 로그인 성공 직후 사용량 조회
                fetchUsage(userInfo, 'teacher');
            } else {
                setAuthError('학번(성명) 또는 비밀번호가 일치하지 않습니다.');
            }
        } else {
            // Student Auth: Check against student_list.json (4자리/5자리 모두 허용)
            const normalizedId = normalizeStudentId(userInfo.id);
            const student = studentList.find(s => s.id === normalizedId && s.name === userInfo.name);
            if (student) {
                // 학번의 첫 번째 숫자를 학년으로 사용 (사용자 요청 사항)
                const gradeFromId = normalizedId[0];
                setUserInfo({ ...userInfo, grade: gradeFromId, id: normalizedId });
                setIsAuth(true);
                // 로그인 성공 직후 사용량 조회
                fetchUsage({ ...userInfo, grade: gradeFromId, id: normalizedId }, 'student');
            } else {
                setAuthError('학번 또는 성명이 일치하지 않습니다. 본교 학생이 아닌 경우 접근이 제한됩니다.');
            }
        }
    };

    // [추가] 서버에서 현재 사용량 조회
    const fetchUsage = async (user, role) => {
        try {
            const response = await fetch('/api', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userData: { ...user, role: role },
                    action: 'getUsage'
                })
            });
            if (response.ok) {
                const data = await response.json();
                if (data && typeof data.usageCount === 'number') {
                    const left = Math.max(0, 10 - data.usageCount);
                    console.log(`📊 서버 사용량 조회 성공: ${data.usageCount}회 사용, 남은 횟수: ${left}회`);
                    setApiCallsLeft(left);
                }
            }
        } catch (err) {
            console.error("❌ 사용량 조회 오류:", err);
        }
    };

    const generateRecommendation = async () => {
        // --- 빈 값 체크 ---
        if (!userInfo.interest || !userInfo.interest.trim()) {
            alert("관심 진로나 희망 계열을 입력해주세요. 진로에 맞춰 최적화된 추천을 해드릴 수 있습니다(예: 컴퓨터공학과, 의예과, 경영학과 등).");
            return;
        }

        // --- 비속어 체크 ---
        if (containsAbuse(userInfo.interest)) {
            setShowAbuseModal(true);
            return;
        }

        // [추가] 클라이언트측 1차 한도 체크 (서버 부하 감소)
        if (apiCallsLeft <= 0) {
            alert("오늘 AI사용 한도를 모두 소진하셨습니다. 안타깝지만 내일 다시 시도해주세요");
            return;
        }

        setIsLoading(true);

        try {
            // 1. 구글 시트 데이터 실시간 인출
            const latestProgramsRaw = await fetchGoogleSheetAsCSV(PROGRAMS_SHEET_ID);
            setProgramsRaw(latestProgramsRaw);
            const programs = parseProgramCSV(latestProgramsRaw);

            // [낙관적 업데이트] AI 답변 요청을 시작하는 순간 카운트 차감
            setApiCallsLeft(prev => Math.max(0, prev - 1));
            console.log("🚀 AI 추천 API 호출 시작 (횟수 -1 반영)");

            // 2. AI 추천 생성 (서버 API 호출로 변경 - 보안 강화)
            const response = await fetch('/api', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // [수정] ID별 1일 제한을 위해 userRole 추가 전달
                body: JSON.stringify({
                    userData: { ...userInfo, role: userRole },
                    programData: programs,
                    curriculumData: userInfo.grade === '1' ? curriculum1 : (userInfo.grade === '2' ? curriculum2 : curriculum3)
                })
            });

            const contentType = response.headers.get("content-type");
            if (!response.ok) {
                let errorMessage = 'AI 추천 서버 오류';
                if (contentType && contentType.includes("application/json")) {
                    const errorData = await response.json();
                    errorMessage = errorData.error || errorMessage;
                } else {
                    const textError = await response.text();
                    console.error("Server HTML Error:", textError);
                    errorMessage = `서버 응답 오류 (${response.status}): 로컬 에뮬레이터가 실행 중인지 확인하세요.`;
                }
                throw new Error(errorMessage);
            }

            if (!contentType || !contentType.includes("application/json")) {
                const text = await response.text();
                console.error("Expected JSON but got:", text);
                throw new Error("서버가 올바른 JSON 형식을 반환하지 않았습니다. (에뮬레이터 실행 상태 확인 필요)");
            }

            const result = await response.json();
            if (result) {
                // [추가] 데이터 검증 및 정제
                const cleanedTracks = (result.recommended_track || []).map(track => ({
                    ...track,
                    year: track.grade || track.year || "학년 정보 없음",
                    activities: (track.activities || [])
                        .filter(item => item != null && item !== '')
                        .map(item => String(item)),
                    courses: (track.courses || [])
                        .filter(item => item != null && item !== '')
                        .map(item => String(item))
                }));

                const sanitizedResult = {
                    ...result,
                    // strategy 문자열 보장
                    strategy: typeof result.strategy === 'string'
                        ? result.strategy
                        : (result.description || JSON.stringify(result.strategy || "전문가 고도화 전략을 생성하지 못했습니다.")),
                    // recommended_track과 tracks 모두 제공 (호환성)
                    recommended_track: cleanedTracks,
                    tracks: cleanedTracks
                };
                console.log("✅ 정제된 추천 데이터:", sanitizedResult);

                // [수정] 사용 횟수 실시간 업데이트 (0보다 클 때만 반영하여 리셋 방지)
                if (typeof result.usageCount === 'number') {
                    const actualLeft = Math.max(0, 10 - result.usageCount);
                    console.log(`📊 서버 응답 반영 - 사용량: ${result.usageCount}, 남은 횟수: ${actualLeft}`);
                    setApiCallsLeft(actualLeft);
                }

                // [추가] 깊은 복사를 통해 모든 참조 제거 (React 상태 업데이트 안정화)
                const deepClonedResult = JSON.parse(JSON.stringify(sanitizedResult));
                setRecommendation(deepClonedResult);
            } else {
                alert("AI 추천 생성 중 오류가 발생했습니다.\n\n.env 파일에 VITE_GEMINI_API_KEY가 올바르게 설정되었는지 확인해주세요.\n\n브라우저 콘솔(F12)에서 자세한 오류를 확인할 수 있습니다.");
            }
        } catch (err) {
            console.error("AI 추천 생성 오류:", err);
            alert(`추천 시스템 오류:\n${err.message}\n\n브라우저 콘솔(F12)에서 자세한 내용을 확인하세요.`);
        } finally {
            setIsLoading(false);
        }
    };

    const downloadImage = () => {
        const target = document.getElementById('recommendation-result');
        html2canvas(target, {
            backgroundColor: '#0a0e17',
            scale: 2,
            useCORS: true
        }).then(canvas => {
            const link = document.createElement('a');
            link.download = `광양고_이수트랙_${userInfo.name}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        });
    };

    if (!isAuth) {
        return (
            <div className="auth-container" style={{ flexDirection: 'column', gap: '1rem', position: 'relative' }}>
                <button
                    onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                    style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', background: 'var(--card-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', padding: '0.6rem', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.3s ease' }}
                >
                    {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
                </button>
                <div className="mobile-notice" style={{ width: '90%', maxWidth: '450px', marginBottom: '0' }}>
                    <AlertCircle size={18} /> 모바일이 아닌 PC화면에 최적화 되어 있습니다.
                </div>
                <div className="glass-card" style={{ maxWidth: '450px', width: '90%', position: 'relative' }}>
                    <button
                        onClick={() => window.open('https://docs.google.com/spreadsheets/d/1T8X-Zgp7QKciF3XTfe3JhcImZUSjkkqe4ZHY1WXYKRc/edit?usp=sharing', '_blank')}
                        style={{
                            position: 'absolute',
                            top: '1.2rem',
                            right: '1.2rem',
                            padding: '0.5rem 0.8rem',
                            borderRadius: '10px',
                            background: 'linear-gradient(135deg, #FF512F 0%, #DD2476 100%)',
                            border: 'none',
                            boxShadow: '0 4px 12px rgba(221, 36, 118, 0.3)',
                            cursor: 'pointer',
                            zIndex: 10
                        }}
                    >
                        <div style={{ fontSize: '0.7rem', lineHeight: '1.2', color: 'white', fontWeight: 'bold', textAlign: 'center' }}>
                            학교 프로그램<br />전체 확인
                        </div>
                    </button>
                    <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                        <div style={{ background: 'linear-gradient(135deg, #00d2ff, #9d50bb)', width: '60px', height: '60px', borderRadius: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                            <GraduationCap size={32} color="white" />
                        </div>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>광양고 자공고 2.0<br /><span style={{ color: 'var(--accent-blue)' }}>AI 진로 설계 솔루션</span></h2>
                        {isLoadingPrograms && (
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                                📊 프로그램 데이터 로딩 중...
                            </p>
                        )}
                    </div>

                    <form onSubmit={handleAuth}>
                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>접속 권한</label>
                            <select value={userRole} onChange={(e) => { setUserRole(e.target.value); setAuthError(''); }}>
                                <option value="student">본교 학생 (학번/성명 인증)</option>
                                <option value="teacher">본교 교사 (마스터 코드 인증)</option>
                            </select>
                        </div>

                        {userRole === 'student' ? (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '1rem' }}>
                                <div style={{ marginBottom: '1rem' }}>
                                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>학번</label>
                                    <input type="text" placeholder="예: 1101 또는 10101" required onChange={(e) => setUserInfo({ ...userInfo, id: e.target.value })} />
                                </div>
                                <div style={{ marginBottom: '1rem' }}>
                                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>성명</label>
                                    <input type="text" placeholder="실명 입력" required onChange={(e) => setUserInfo({ ...userInfo, name: e.target.value })} />
                                </div>
                            </div>
                        ) : (
                            <>
                                <div style={{ marginBottom: '1rem' }}>
                                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>성명</label>
                                    <input type="text" placeholder="실명 입력" required onChange={(e) => setUserInfo({ ...userInfo, name: e.target.value })} />
                                </div>
                                <div style={{ marginBottom: '1rem' }}>
                                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>비밀번호</label>
                                    <input type="password" placeholder="비밀번호 입력" required onChange={(e) => setUserInfo({ ...userInfo, id: e.target.value })} />
                                </div>
                            </>
                        )}

                        {authError && (
                            <div style={{ marginBottom: '1rem', padding: '0.8rem', borderRadius: '8px', background: 'rgba(255, 75, 43, 0.1)', border: '1px solid rgba(255, 75, 43, 0.3)', color: '#ff4b2b', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <AlertCircle size={16} /> {authError}
                            </div>
                        )}

                        <button type="submit" className="btn-primary" style={{ width: '100%', padding: '1rem', marginTop: '0.5rem' }}>솔루션 입장하기</button>
                    </form>

                    <div style={{ marginTop: '1.5rem', padding: '1rem', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)' }}>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textAlign: 'center', lineHeight: 1.5 }}>
                            본 시스템은 광양고등학교 학생 및 교직원 전용입니다.<br />
                            학원 관계자 및 외부 컨설턴트의 무단 접근을 엄격히 금지합니다.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            <nav style={{ padding: '1.5rem 2rem', borderBottom: '1px solid var(--glass-border)', background: 'rgba(10, 14, 23, 0.8)', backdropFilter: 'blur(10px)', position: 'sticky', top: 0, zIndex: 100 }}>
                <div className="container" style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                        <BrainCircuit color="var(--accent-blue)" />
                        <span style={{ fontWeight: 700, fontSize: '1.1rem', letterSpacing: '-0.5px', color: '#ffffff' }}>광양고_자공고2.0 <span style={{ color: 'var(--accent-blue)' }}>이수트랙(AI 추천)</span></span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <button
                            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#ffffff', padding: '0.5rem', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            title={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
                        >
                            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                        </button>
                        <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.2)' }}></div>
                        <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.7)' }}>
                            <User size={14} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                            {userRole === 'teacher' ? '교직원 모드' : `${userInfo.name} (${userInfo.id})`}
                        </span>
                        <button onClick={() => setIsAuth(false)} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.8)', fontSize: '0.8rem', padding: '0.4rem 0.8rem', borderRadius: '8px', cursor: 'pointer' }}>로그아웃</button>
                    </div>
                </div>
            </nav>

            <main style={{ flex: 1, padding: '3rem 1rem', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
                <div className="mobile-notice">
                    <AlertCircle size={18} /> 모바일이 아닌 PC화면에 최적화 되어 있습니다.
                </div>

                <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
                    <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>미래를 설계하는 <span style={{ color: 'var(--accent-blue)' }}>AI 컨설팅</span></h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>학생의 진로와 성향을 분석하여 광양고 학생들만의 최적화된 교과+비교과 이수트랙을 제안합니다.</p>
                </div>

                <div className="main-grid" style={{ display: 'grid', gridTemplateColumns: recommendation ? '350px 1fr' : '1fr', gap: '2.5rem', alignItems: 'start' }}>
                    <section className="glass-card" style={{ padding: '2.5rem' }}>
                        <h3 style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Sparkles size={18} color="var(--accent-blue)" /> 개인 프로필 설정
                        </h3>

                        {userRole === 'teacher' && (
                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>시뮬레이션 대상 학년</label>
                                <select
                                    value={userInfo.grade}
                                    onChange={(e) => setUserInfo({ ...userInfo, grade: e.target.value })}
                                    style={{ width: '100%', padding: '0.8rem', borderRadius: '10px', background: 'var(--card-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-main)' }}
                                >
                                    <option value="1">1학년 적용</option>
                                    <option value="2">2학년 적용</option>
                                    <option value="3">3학년 적용</option>
                                </select>
                                <p style={{ fontSize: '0.75rem', color: 'var(--accent-blue)', marginTop: '0.5rem' }}>
                                    * 교사 모드에서는 분석할 학년을 직접 선택할 수 있습니다.
                                </p>
                            </div>
                        )}

                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>관심 진로 및 계열</label>
                            <input
                                type="text"
                                value={userInfo.interest}
                                onChange={(e) => setUserInfo({ ...userInfo, interest: e.target.value })}
                                placeholder="관심 진로나 희망 계열을 입력해주세요(예: 컴퓨터공학과, 의예과, 경영학과 등) 이상한 단어를 입력시 시스템 오류발생. "
                            />
                        </div>

                        <div style={{ marginBottom: '2rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>활동 집중도 설정</label>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                <button
                                    onClick={() => setUserInfo({ ...userInfo, style: 'activity' })}
                                    style={{
                                        padding: '0.8rem',
                                        borderRadius: '10px',
                                        border: '1px solid',
                                        fontSize: '0.85rem',
                                        borderColor: userInfo.style === 'activity' ? 'var(--accent-blue)' : 'var(--glass-border)',
                                        background: userInfo.style === 'activity' ? 'rgba(0, 210, 255, 0.1)' : 'none',
                                        color: userInfo.style === 'activity' ? 'var(--accent-blue)' : 'var(--text-muted)',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    탐구 몰입형
                                </button>
                                <button
                                    onClick={() => setUserInfo({ ...userInfo, style: 'grades' })}
                                    style={{
                                        padding: '0.8rem',
                                        borderRadius: '10px',
                                        border: '1px solid',
                                        fontSize: '0.85rem',
                                        borderColor: userInfo.style === 'grades' ? 'var(--accent-blue)' : 'var(--glass-border)',
                                        background: userInfo.style === 'grades' ? 'rgba(0, 210, 255, 0.1)' : 'none',
                                        color: userInfo.style === 'grades' ? 'var(--accent-blue)' : 'var(--text-muted)',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    학업 집중형
                                </button>
                            </div>
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                                {userInfo.style === 'activity' ? '* 시간적 여유가 많아 다양한 활동을 권장합니다.' : '* 내신 관리를 병행하며 핵심 활동 위주로 추천합니다.'}
                            </p>
                        </div>

                        <div style={{ position: 'relative' }}>
                            <button
                                onClick={generateRecommendation}
                                disabled={isLoading}
                                className="btn-primary"
                                style={{
                                    width: '100%',
                                    padding: isLoading ? '1.5rem 1rem' : '1rem',
                                    fontSize: '1rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.8rem',
                                    position: 'relative',
                                    overflow: 'hidden'
                                }}
                            >
                                {isLoading ? (
                                    <div style={{ width: '100%', zIndex: 1 }}>
                                        <div style={{ marginBottom: '0.8rem', fontWeight: 'bold', fontSize: '0.95rem' }}>
                                            AI가 추천 트랙을 생성 중입니다.<br />
                                            <span style={{ fontSize: '0.8rem', fontWeight: 'normal', opacity: 0.9 }}>
                                                Gemini 모델을 호출해 답변을 받아오므로 약 1분~2분 가량 소요됩니다.
                                            </span>
                                        </div>
                                        {/* 진행 바 컨테이너 */}
                                        <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden', marginBottom: '0.5rem' }}>
                                            <div
                                                style={{
                                                    width: `${loadingProgress}%`,
                                                    height: '100%',
                                                    background: 'linear-gradient(90deg, #00d2ff, #9d50bb)',
                                                    transition: 'width 0.5s ease-out'
                                                }}
                                            />
                                        </div>
                                        <div style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>
                                            분석 진행률: {loadingProgress}% (브라우저를 종료하면 안 돼요)
                                        </div>
                                    </div>
                                ) : (
                                    <><BrainCircuit size={20} /> AI 추천 트랙 생성</>
                                )}

                                {/* 배경 진행바 효과 (선택사항) */}
                                {isLoading && (
                                    <div
                                        style={{
                                            position: 'absolute',
                                            top: 0,
                                            left: 0,
                                            bottom: 0,
                                            width: `${loadingProgress}%`,
                                            background: 'rgba(255,255,255,0.05)',
                                            transition: 'width 0.5s ease-out',
                                            zIndex: 0
                                        }}
                                    />
                                )}
                            </button>
                        </div>
                        <div style={{ textAlign: 'center', marginTop: '0.8rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            ⏳ 오늘 남은 AI 사용 횟수: <span style={{ color: apiCallsLeft > 0 ? 'var(--accent-blue)' : '#ff4b2b', fontWeight: 'bold' }}>{apiCallsLeft}회</span> / 10회
                        </div>
                    </section>

                    {recommendation && (
                        <div id="recommendation-result">
                            <section className="glass-card" style={{ padding: '3rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem' }}>
                                    <div>
                                        <h2 style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>
                                            {userRole === 'teacher' ? (recommendation.title || "추천 이수 트랙").replace(/^\d+번 학생 - /, '') : (recommendation.title || `${userInfo.name}님의 맞춤형 이수 트랙`)}
                                        </h2>
                                        <p style={{ color: 'var(--text-muted)' }}>GYHS AI Consultant System v2.0</p>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.8rem' }}>
                                        <button
                                            onClick={() => window.open('https://docs.google.com/spreadsheets/d/1T8X-Zgp7QKciF3XTfe3JhcImZUSjkkqe4ZHY1WXYKRc/edit?usp=sharing', '_blank')}
                                            className="btn-primary"
                                            style={{
                                                padding: '0.7rem 1.5rem',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                gap: '0.3rem',
                                                borderRadius: '12px',
                                                background: 'linear-gradient(135deg, #FF512F 0%, #DD2476 100%)', // 강렬한 오렌지-마젠타
                                                border: 'none',
                                                boxShadow: '0 4px 15px rgba(221, 36, 118, 0.4)',
                                                minWidth: '130px'
                                            }}
                                        >
                                            <div style={{ fontSize: '0.85rem', lineHeight: '1.2', textAlign: 'center', color: 'white', fontWeight: 'bold' }}>
                                                학교 프로그램<br />전체 확인
                                            </div>
                                        </button>
                                        <button onClick={downloadImage} className="btn-primary" style={{ padding: '0.7rem 1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem', borderRadius: '12px', minWidth: '100px' }}>
                                            <div style={{ fontSize: '0.85rem', lineHeight: '1.2', textAlign: 'center' }}>
                                                고화질<br />저장하기
                                            </div>
                                        </button>
                                    </div>
                                </div>

                                <div className="timeline">
                                    {recommendation.tracks.map((track, idx) => (
                                        <div key={idx} className="timeline-item">
                                            <span className="grade-badge">{String(track.year || track.grade || "")}</span>
                                            <div className="track-grid" style={{
                                                display: 'grid',
                                                gridTemplateColumns: '1fr 1fr',
                                                gap: '2rem',
                                                background: theme === 'light' ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.15)',
                                                backdropFilter: 'blur(20px)',
                                                WebkitBackdropFilter: 'blur(20px)',
                                                padding: '2rem',
                                                borderRadius: '20px',
                                                border: '1px solid var(--glass-border)',
                                                boxShadow: theme === 'light' ? '0 8px 32px 0 rgba(31, 38, 135, 0.07)' : '0 8px 32px 0 rgba(0, 0, 0, 0.2)',
                                                transition: 'transform 0.3s ease'
                                            }}>
                                                <div>
                                                    <h4 style={{ color: 'var(--accent-blue)', marginBottom: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '1rem', fontWeight: '700' }}>
                                                        <Sparkles size={18} /> 자공고 2.0 프로그램
                                                    </h4>
                                                    <ul style={{ listStyle: 'none' }}>
                                                        {(track.activities || []).map((act, i) => (
                                                            <li key={i} style={{ marginBottom: '0.6rem', fontSize: '0.95rem', display: 'flex', alignItems: 'start', gap: '0.5rem' }}>
                                                                <span style={{ color: 'var(--accent-blue)', flexShrink: 0 }}>•</span> {String(act || "")}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                                <div>
                                                    <h4 style={{ color: 'var(--text-muted)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}>
                                                        <BookOpen size={16} /> 연계 추천 과목
                                                    </h4>
                                                    <ul style={{ listStyle: 'none' }}>
                                                        {(track.courses || []).map((course, i) => (
                                                            <li key={i} style={{ marginBottom: '0.6rem', fontSize: '0.95rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'start', gap: '0.5rem' }}>
                                                                <span style={{ color: 'var(--glass-border)', flexShrink: 0 }}>-</span> {String(course || "")}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div style={{ marginTop: '3rem', padding: '2rem', borderRadius: '20px', background: 'linear-gradient(145deg, rgba(0, 210, 255, 0.05), rgba(157, 80, 187, 0.05))', border: '1px solid var(--glass-border)' }}>
                                    <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                        <BrainCircuit size={20} color="var(--accent-purple)" /> 전문가 고도화 전략
                                    </h3>
                                    <div className="markdown-content" style={{ fontSize: '1rem', color: 'var(--text-main)', opacity: 0.9, lineHeight: '1.8' }}>
                                        <ReactMarkdown
                                            remarkPlugins={[remarkGfm]}
                                            components={{
                                                h1: ({ node, ...props }) => <h1 style={{ fontSize: '1.6rem', fontWeight: 'bold', marginTop: '1.5rem', marginBottom: '1rem' }} {...props} />,
                                                h2: ({ node, ...props }) => <h2 style={{ fontSize: '1.4rem', fontWeight: 'bold', marginTop: '1.5rem', marginBottom: '0.8rem', color: 'var(--accent-blue)' }} {...props} />,
                                                h3: ({ node, ...props }) => <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold', marginTop: '1.2rem', marginBottom: '0.6rem', color: 'var(--accent-purple)' }} {...props} />,
                                                p: ({ node, ...props }) => <p style={{ marginBottom: '1rem' }} {...props} />,
                                                ul: ({ node, ...props }) => <ul style={{ marginBottom: '1rem', paddingLeft: '1.5rem' }} {...props} />,
                                                li: ({ node, ...props }) => <li style={{ marginBottom: '0.5rem' }} {...props} />,
                                                table: ({ node, ...props }) => <div style={{ overflowX: 'auto', marginBottom: '1.5rem' }}><table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid var(--glass-border)' }} {...props} /></div>,
                                                th: ({ node, ...props }) => <th style={{ background: 'rgba(255,255,255,0.05)', padding: '0.8rem', border: '1px solid var(--glass-border)', textAlign: 'left' }} {...props} />,
                                                td: ({ node, ...props }) => <td style={{ padding: '0.8rem', border: '1px solid var(--glass-border)' }} {...props} />,
                                                strong: ({ node, ...props }) => <strong style={{ color: 'var(--accent-blue)', fontWeight: 'bold' }} {...props} />,
                                            }}
                                        >
                                            {String(recommendation.strategy || recommendation.description || "").replace(/\\n/g, '\n')}
                                        </ReactMarkdown>
                                    </div>
                                </div>

                                <div style={{ marginTop: '2.5rem', background: 'rgba(255,255,255,0.03)', padding: '1.2rem', borderRadius: '12px', textAlign: 'center' }}>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                        ※ 모든 활동은 본인의 관심과 역량에 따라 선택적으로 참여하시기 바랍니다. <br />
                                        특히 R&E 등 심화 활동은 사전 준비와 학업 계획이 필요하므로 담임 선생님과 반드시 상담하세요.
                                    </p>
                                </div>
                            </section>
                        </div>
                    )}
                </div>
            </main>

            <footer style={{ padding: '3rem', borderTop: '1px solid var(--glass-border)', textAlign: 'center', color: 'var(--text-muted)' }}>
                <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                    <p style={{ marginBottom: '0.5rem', fontWeight: 600 }}>
                        광양고등학교 자공고 2.0 교육력제고부 <span style={{ opacity: 0.6, fontWeight: 400 }}>|</span> Made by Yangphago
                    </p>
                    <p style={{ marginBottom: '0.5rem', fontWeight: 600 }}>
                        문의: roughkyo@gmail.com 또는 교무실
                    </p>
                    <p style={{ fontSize: '0.8rem', opacity: 0.5 }}>
                        © 2026 Gwangyang High School AI Roadmapping Service. All rights reserved.
                    </p>
                </div>
            </footer>

            {/* 비속어 경고 모달 */}
            {showAbuseModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div className="glass-card" style={{ maxWidth: '400px', width: '90%', padding: '2.5rem', textAlign: 'center', border: '1px solid rgba(255, 75, 43, 0.3)' }}>
                        <div style={{ background: 'rgba(255, 75, 43, 0.1)', width: '60px', height: '60px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
                            <AlertCircle size={32} color="#ff4b2b" />
                        </div>
                        <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: '#ff4b2b' }}>비속어 감지 알림</h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '2rem' }}>
                            욕설이나 비속어 사용은 금지되어 있습니다.<br />
                            관심 진로나 계열을 올바르게 입력해야<br />
                            AI 컨설팅이 작동합니다.
                        </p>
                        <button
                            onClick={() => setShowAbuseModal(false)}
                            className="btn-primary"
                            style={{ width: '100%', padding: '0.8rem', background: '#ff4b2b', border: 'none' }}
                        >
                            확인했습니다
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
