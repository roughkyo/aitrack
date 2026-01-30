const { onRequest } = require("firebase-functions/v2/https");
const { GoogleGenerativeAI, SchemaType } = require("@google/generative-ai");
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true });

admin.initializeApp();
const db = admin.firestore();

// --- AI Logic (Migrated from src/lib/gemini.js) ---

function parseTargetGrades(gradeStr, periodStr) {
  const str = String(gradeStr || "").trim();
  const ps = String(periodStr || "").trim();
  if (!str || str.includes("전학년") || str.includes("전 학년") || str.includes("공통")) {
    const extracted = new Set();
    if (ps.includes("1학년")) extracted.add(1);
    if (ps.includes("2학년")) extracted.add(2);
    if (ps.includes("3학년")) extracted.add(3);
    return extracted.size > 0 ? Array.from(extracted).sort() : [1, 2, 3];
  }
  const grades = new Set();
  if (str.includes("1")) grades.add(1);
  if (str.includes("2")) grades.add(2);
  if (str.includes("3")) grades.add(3);
  return grades.size > 0 ? Array.from(grades).sort((a, b) => a - b) : [1, 2, 3];
}

function isSafeFor3rdGrade(periodStr) {
  if (!periodStr) return true;
  const p = String(periodStr).trim();
  const unsafe = ["2학기", "9월", "10월", "11월", "12월", "겨울"];
  return !unsafe.some(u => p.includes(u));
}

function preprocessProgramData(rawPrograms) {
  const map = new Map();
  if (!Array.isArray(rawPrograms) || rawPrograms.length === 0) return map;
  const keys = Object.keys(rawPrograms[0]);
  const findKey = (candidates) => keys.find(k => candidates.some(c => k.trim().includes(c)));

  let nameKey = findKey(["프로그램명", "활동명"]) || keys[1];
  let gradeKey = findKey(["대상학년", "학년"]) || keys[2];
  let periodKey = findKey(["운영기간", "시기"]) || keys[3];
  let themeKey = findKey(["연계테마", "테마"]) || keys[4];

  rawPrograms.forEach(p => {
    const name = (p[nameKey] || "").trim();
    if (!name) return;
    const rawPeriod = p[periodKey] || "";
    map.set(name, {
      name,
      targetGrades: parseTargetGrades(p[gradeKey], rawPeriod),
      isSafeFor3rd: isSafeFor3rdGrade(rawPeriod),
      fullPeriod: rawPeriod,
      theme: p[themeKey] || ""
    });
  });
  return map;
}

// [Step 1] AI Selects candidates
async function selectInitialCandidates(selectionModel, userData, detailedPrograms, validCourseNames) {
  const isActivityStyle = userData.style === 'activity';
  const targetCount = isActivityStyle ? 15 : 10;
  const isUndecided = /(몰라|모름|미정|미확정|결정안함|추천좀|아무거나)/.test(userData.interest);

  const systemInstruction = `당신은 대한민국 최고의 교육 컨설턴트입니다. 학생의 진로 키워드를 분석하여 가장 적합한 활동과 과목 후보군을 선별하십시오.
규칙:
1. 활동(activities): 제공된 [Activities List]에서 학생의 전공(Major)과 관련된 것을 최소 ${targetCount}개 이상 넉넉히 선별하십시오.
${isUndecided ? "⚠️ **특별 지시**: 학생이 진로를 결정하지 못했습니다. 인문사회 분야 활동과 수리과학 분야 활동을 5:5 비율로 균형 있게 섞어서 '무전공/자유전공' 설계 트랙을 만드십시오." : "학생의 진로 분야와 융합 가능성을 고려하여 학년별 균형 있게 선별하십시오."}
2. 지역과 함께하는 깊이있는 체험활동: 학생의 키워드가 특정 분야에 집중되어 있다면 관련 분과를, 미정이라면 가장 대중적인 분과(지속가능발전 등)를 후보로 선택하십시오.
3. 과목(courses): 제공된 [Courses List]에서 적합성이 높은 것 15개를 선별하십시오.
4. 전문가 전략은 작성하지 마십시오. 오직 리스트만 JSON으로 반환하십시오.`;

  const prompt = `
[Student Info]
Name: ${userData.name}, Major: ${userData.interest}${isUndecided ? " (진로 미정 - 밸런스형 추천 필요)" : ""}, Type: ${userData.style}

[Activities List]
${JSON.stringify(detailedPrograms)}

[Courses List]
${validCourseNames}
`;

  const result = await selectionModel.generateContent([systemInstruction, prompt]);
  const text = result.response.text().replace(/```json|```/g, "").trim();
  return JSON.parse(text);
}

// [Step 2] Hardcoded Finalization
function finalizeTrack(candidates, userData, programMap, courseGradeMap) {
  const isActivityStyle = userData.style === 'activity';
  const minCount = isActivityStyle ? 4 : 2;
  const maxCount = isActivityStyle ? 5 : 3;

  const buckets = { 1: { activities: [], courses: [] }, 2: { activities: [], courses: [] }, 3: { activities: [], courses: [] } };
  const globalUsed = new Set();

  const pInmu = "인문사회주제탐구 프로젝트";
  const pSuri = "수리과학주제탐구 프로젝트";

  const rawActivities = candidates.activities || [];
  const validProgramNames = Array.from(programMap.keys());

  const activityCandidates = rawActivities.map(act => {
    const matchedName = validProgramNames.find(n => act.includes(n) || n.includes(act));
    return matchedName ? programMap.get(matchedName) : null;
  }).filter(p => p !== null);

  const inmuInfo = activityCandidates.find(p => p.name === pInmu);
  const suriInfo = activityCandidates.find(p => p.name === pSuri);

  if (inmuInfo && suriInfo) {
    const gInmu = inmuInfo.targetGrades.includes(1) ? 1 : (inmuInfo.targetGrades.includes(3) ? 3 : null);
    const gSuri = suriInfo.targetGrades.includes(3) ? 3 : (suriInfo.targetGrades.includes(1) ? 1 : null);
    if (gInmu && gSuri && gInmu !== gSuri) {
      buckets[gInmu].activities.push({ ...inmuInfo, assignedGrade: gInmu });
      buckets[gSuri].activities.push({ ...suriInfo, assignedGrade: gSuri });
      globalUsed.add(pInmu); globalUsed.add(pSuri);
    }
  } else if (inmuInfo) {
    const g = inmuInfo.targetGrades.includes(1) ? 1 : (inmuInfo.targetGrades.includes(3) ? 3 : null);
    if (g) {
      buckets[g].activities.push({ ...inmuInfo, assignedGrade: g });
      globalUsed.add(pInmu);
    }
  } else if (suriInfo) {
    const g = suriInfo.targetGrades.includes(3) ? 3 : (suriInfo.targetGrades.includes(1) ? 1 : null);
    if (g) {
      buckets[g].activities.push({ ...suriInfo, assignedGrade: g });
      globalUsed.add(pSuri);
    }
  }

  activityCandidates.forEach(info => {
    if (globalUsed.has(info.name)) return;
    const validGrades = info.targetGrades.filter(g => {
      if (g === 3 && !info.isSafeFor3rd) return false;
      return buckets[g].activities.length < maxCount;
    });
    if (validGrades.length === 0) return;
    validGrades.sort((a, b) => buckets[a].activities.length - buckets[b].activities.length);
    const assigned = validGrades[0];

    let finalInfo = { ...info, assignedGrade: assigned };
    if (info.name.includes("지역과 함께하는")) {
      let branch = "지속가능발전";
      const int = userData.interest;
      // 1. AI융합 (소프트웨어/지능형 기술)
      if (/AI|인공지능|빅데이터|머신러닝|딥러닝|알고리즘|파이썬|코딩|SW|소프트웨어|IT|컴퓨터|프로그래밍|정보보안|지능형|메타버스|가상현실|VR|AR|챗봇/.test(int)) {
        branch = "AI융합";
      }
      // 2. 이차전지 (전기/전자/화학/신소재 - 기계공학보다 먼저 체크)
      else if (/이차전지|배터리|리튬|전기|전자|반도체|신소재|재료공학|화학|화공|화학공학|에너지공학|양극재|음극재|전해질|에너지저장|ESS|전기차배터리|고분자|광물|에너지/.test(int)) {
        branch = "이차전지";
      }
      // 3. 기계공학 (물리적 장치/역학)
      else if (/기계|물리|로봇|자동화|제어공학|메카트로닉스|자동차|모빌리티|자율주행|엔진|스마트팩토리|생산공학|나노|드론|비행체|조선|제조|산업공학|역학/.test(int)) {
        branch = "기계공학";
      }
      // 4. 우주과학(나로호 등) (천문/우주)
      else if (/우주|항공|나로호|누리호|위성|천체|천문|행성|로켓|우주정거장|우주탐사|천체물리|망원경|별자리/.test(int)) {
        branch = "우주과학(나로호 등)";
      }
      // 5. 공간 예술/건축 (미학/공간설계)
      else if (/건축|도시|인테리어|공간|예술|미술|디자인|조형|설계|공예|시각디자인|조경|입체|전시기획|큐레이터/.test(int)) {
        branch = "공간 예술/건축";
      }
      // 6. 지역역사문화 (인문/사회/경영/경제 통합)
      else if (/역사|인문|철학|전통|박물관|문화재|고고학|사료|기록물|지역학|향토|답사|유적|민속|성읍|광양학|경영|경제|창업|마케팅|금융|무역|회계|광고|홍보|언론|미디어|콘텐츠|브랜딩|사회학|심리|호텔|관광|축제|유통/.test(int)) {
        branch = "지역역사문화";
      }
      // 7. 지속가능발전 (생명/환경/보건/기타)
      else {
        branch = "지속가능발전";
      }
      finalInfo.name = `지역과 함께하는 깊이있는 체험활동(${branch})`;
    }
    buckets[assigned].activities.push(finalInfo);
    globalUsed.add(info.name);
  });

  [1, 2, 3].forEach(g => {
    const FALLBACK_READING_PROGRAMS = ["희양사제동행독서프로젝트", "희양도서관 페스티벌", "희양 인문쉼터(마음의 길을 묻다)"];
    let reading = [...FALLBACK_READING_PROGRAMS];
    while (buckets[g].activities.length < minCount && reading.length > 0) {
      const r = reading.shift();
      if (!globalUsed.has(r)) {
        const info = programMap.get(r);
        if (info) {
          buckets[g].activities.push({ ...info, assignedGrade: g });
          globalUsed.add(r);
        }
      }
    }
  });

  [1, 2, 3].forEach(g => {
    buckets[g].activities = buckets[g].activities.map(item => {
      let name = item.name;
      let fullPeriod = item.fullPeriod || "";
      const periodParts = fullPeriod.split(",").map(p => p.trim());
      const relevantPeriod = periodParts.find(p => p.includes(g + "학년")) || periodParts[0];
      let periodLabel = relevantPeriod ? ` (${relevantPeriod})` : " (연중)";
      return (name + periodLabel).replace(/예약|특구|연계|사실상|마지막|수순|정도로|변경|예정/g, "").replace(/\(\s*\)/g, "").trim();
    });
  });

  const rawCourses = candidates.courses || [];
  rawCourses.forEach(c => {
    const matched = Array.from(courseGradeMap.keys()).find(v => c.includes(v) || v.includes(c));
    if (!matched || globalUsed.has(matched)) return;
    const grade = courseGradeMap.get(matched) || 2;
    if (buckets[grade].courses.length < 5) {
      buckets[grade].courses.push(matched);
      globalUsed.add(matched);
    }
  });

  return [1, 2, 3].map(g => ({ grade: g + "학년", activities: buckets[g].activities, courses: buckets[g].courses }));
}

// [Step 3] AI Strategy
async function generateExpertStrategy(strategyModel, userData, finalTracks) {
  const systemInstruction = `당신은 대한민국 최고의 교육 컨설턴트입니다. 
제시된 [최종 이수 트랙]의 'activities' 리스트만을 활용하여 학생의 3개년 성장 서사를 Markdown으로 작성하십시오.

⚠️ **마크다운 작성 규칙 (반드시 준수)**:
1. **가독성을 위한 줄바꿈**: 각 학년별 제목(###) 앞에는 반드시 **두 번의 빈 줄(Enter)**을 넣어 내용을 명확히 구분하십시오.
2. **교과목 언급 금지**: 'activities' 항목의 활동명만 설명하십시오. 'courses'(교과목)는 본문에 절대 포함하지 마십시오.
3. **문장 스타일**: 미래 지향적인 현재형 또는 추천형('~합니다', '~하는 것을 추천합니다')을 사용하여 부드럽고 전문적인 어조로 작성하십시오.
4. **결과 형식**: 오직 {"strategy": "Markdown 내용"} 형식의 JSON 데이터만 출력하십시오.`;

  const prompt = `[Student Info] Name: ${userData.name}, Major: ${userData.interest}\n[최종 트랙]:\n${JSON.stringify(finalTracks, null, 2)}\n위 'activities' 명칭을 기반으로 학년별 서사를 작성하세요.`;
  const result = await strategyModel.generateContent([systemInstruction, prompt]);
  const parsed = JSON.parse(result.response.text());

  // 리터럴 \n(문자열 그대로의 \n)이 포함된 경우 실제 개행 문자로 변환
  if (parsed.strategy && typeof parsed.strategy === 'string') {
    parsed.strategy = parsed.strategy.replace(/\\n/g, '\n');
  }

  return parsed;
}

// --- Main Cloud Function ---

exports.api = onRequest({ secrets: ["GEMINI_API_KEY"] }, async (req, res) => {
  cors(req, res, async () => {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

    const { userData, programData, curriculumData, action } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) return res.status(500).json({ error: "API Key not configured." });

    try {
      // 1. Rate Limiting Check (Firestore)
      const userId = userData.role === 'teacher' ? `teacher_${userData.name}` : `student_${userData.id}`;
      // 한국 시간(KST) 기준 날짜 문자열 생성 (YYYY-MM-DD)
      const kstDate = new Date(new Date().getTime() + (9 * 60 * 60 * 1000)).toISOString().split('T')[0];
      const usageRef = db.collection('usage').doc(`${userId}_${kstDate}`);

      let usageCount = 0;

      // 사용량 확인 전용 액션인 경우
      if (action === 'getUsage') {
        const doc = await usageRef.get();
        usageCount = doc.exists ? doc.data().count : 0;
        return res.json({ usageCount });
      }

      try {
        await db.runTransaction(async (t) => {
          const doc = await t.get(usageRef);
          usageCount = (doc.exists ? doc.data().count : 0) + 1;
          if (usageCount > 10) {
            throw new Error("LIMIT_EXCEEDED");
          }
          t.set(usageRef, {
            count: usageCount,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        });
      } catch (e) {
        if (e.message === "LIMIT_EXCEEDED") {
          return res.status(429).json({ error: "오늘 AI사용 한도를 모두 소진하셨습니다. 안타깝지만 내일 다시 시도해주세요" });
        }
        console.error("Rate limit DB error (proceeding):", e);
        // Firestore 연결 문제 등 DB 에러 시에는 서비스 안정을 위해 일단 진행 허용
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const selectionModel = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" }, { apiVersion: "v1beta" });
      selectionModel.generationConfig = {
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            activities: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
            courses: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } }
          },
          required: ["activities", "courses"]
        }
      };

      const strategyModel = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" }, { apiVersion: "v1beta" });
      strategyModel.generationConfig = {
        responseMimeType: "application/json",
        responseSchema: { type: SchemaType.OBJECT, properties: { strategy: { type: SchemaType.STRING } }, required: ["strategy"] }
      };

      // Execution
      const programMap = preprocessProgramData(programData);
      const courseGradeMap = new Map();
      if (curriculumData.curriculum) {
        Object.entries(curriculumData.curriculum).forEach(([gK, terms]) => {
          const g = parseInt(gK.replace("Grade", ""));
          Object.values(terms).forEach(t => {
            if (Array.isArray(t)) t.forEach(c => courseGradeMap.set(c, g));
            else Object.values(t).forEach(group => group.forEach(c => courseGradeMap.set(c, g)));
          });
        });
      }
      if (curriculumData.joint_curriculum) curriculumData.joint_curriculum.forEach(c => courseGradeMap.set(c.name, c.grade));

      const detailedPrograms = Array.from(programMap.values()).map(p => ({
        name: p.name, grades: p.targetGrades.join(","), period: p.fullPeriod
      }));

      const candidates = await selectInitialCandidates(selectionModel, userData, detailedPrograms, Array.from(courseGradeMap.keys()).join(", "));
      const finalTracks = finalizeTrack(candidates, userData, programMap, courseGradeMap);
      const strategyResult = await generateExpertStrategy(strategyModel, userData, finalTracks);

      res.json({
        recommended_track: finalTracks,
        strategy: strategyResult.strategy,
        usageCount: usageCount // 실시간 사용 횟수 반환
      });
    } catch (error) {
      console.error("Critical Error", error);
      res.status(500).json({ error: "API Error: " + error.message });
    }
  });
});
