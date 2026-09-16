import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import { createClient } from "@supabase/supabase-js";

/**
 * ------------------------------------------------------------
 * Supabase 클라이언트 초기화 (파일 추가 생성 없이 라우트 내에서 처리)
 * ------------------------------------------------------------
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * ------------------------------------------------------------
 * HANDOFF 문서 읽기 및 환경변수 동적 치환
 * ------------------------------------------------------------
 */
function getHandoffContent(): string {
  const possiblePaths = [
    path.join(process.cwd(), "public", "HANDOFF_TASK_05.md"),
    path.join(process.cwd(), "HANDOFF_TASK_05.md"),
    path.join(process.cwd(), "HANDOFF_TASK_05.MD"),
  ];

  for (const filePath of possiblePaths) {
    if (fs.existsSync(filePath)) {
      let content = fs.readFileSync(filePath, "utf-8");

      const envVersion = process.env.TASK05_VERSION_ID?.trim() || "";
      if (envVersion) {
        content = content.replaceAll("${TASK05_VERSION_ID}", envVersion);
      }

      return content;
    }
  }

  return "HANDOFF_TASK_05.md 파일이 존재하지 않습니다.";
}

/**
 * ------------------------------------------------------------
 * HANDOFF에서 Version ID 추출
 * ------------------------------------------------------------
 */
function getHandoffVersionId(handoffContent: string): string | null {
  const patterns = [
    /Git Commit Version ID\s*:\s*`([^`]+)`/i,
    /Git Version ID\s*:\s*`([^`]+)`/i,
    /Version ID\s*:\s*`([^`]+)`/i,
    /Current Git Version ID\s*:\s*`([^`]+)`/i,
  ];

  for (const pattern of patterns) {
    const match = handoffContent.match(pattern);

    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

/**
 * ------------------------------------------------------------
 * HANDOFF 7개 섹션 검증
 * ------------------------------------------------------------
 */
function validateHandoffSections(handoffContent: string) {
  const sections = {
    goal: /(?:^|\n)#{1,3}\s*1\.\s*목표\s*\(Goal\)/i.test(handoffContent),
    currentStatus: /(?:^|\n)#{1,3}\s*2\.\s*현재 상태\s*\(Current Status\)/i.test(handoffContent),
    executionCommands: /(?:^|\n)#{1,3}\s*3\.\s*실행 명령\s*\(Execution Commands\)/i.test(handoffContent),
    passingTests: /(?:^|\n)#{1,3}\s*4\.\s*(통과 테스트|Passing Tests)/i.test(handoffContent),
    remainingIssues: /(?:^|\n)#{1,3}\s*5\.\s*(남은 문제|Remaining Issues)/i.test(handoffContent),
    nextAction: /(?:^|\n)#{1,3}\s*6\.\s*(다음 작업|Next Action)/i.test(handoffContent),
    doNotTouch: /(?:^|\n)#{1,3}\s*7\.\s*(건드리지 말아야 할 것|Do Not Touch)/i.test(handoffContent),
  };

  return {
    sections,
    allPassed: Object.values(sections).every(Boolean),
  };
}

/**
 * ------------------------------------------------------------
 * AI JSON 파싱
 * ------------------------------------------------------------
 */
function parseAiJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");

    if (start === -1 || end === -1) {
      throw new Error("AI 응답에서 JSON을 찾을 수 없습니다.");
    }

    return JSON.parse(text.substring(start, end + 1));
  }
}

/**
 * ------------------------------------------------------------
 * 문자열 길이 제한
 * ------------------------------------------------------------
 */
function limitText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return text.substring(0, maxLength) + "\n\n...[SOURCE TRUNCATED]...";
}

/**
 * ------------------------------------------------------------
 * page.tsx에서 TASK-05 검증에 필요한 부분만 추출
 * ------------------------------------------------------------
 */
function extractPageVerificationSource(source: string): string {
  const sections: string[] = [];

  const fixedTestMatch = source.match(
    /(?:const|let)\s+(?:fixedTests|FIXED_TESTS)[\s\S]{0,7000}/
  );

  if (fixedTestMatch) {
    sections.push("### FIXED TEST DEFINITIONS\n" + limitText(fixedTestMatch[0], 5000));
  }

  const retryConstantMatch = source.match(
    /(?:const|let)\s+MAX_RETRIES[\s\S]{0,1200}/
  );

  if (retryConstantMatch) {
    sections.push("### RETRY CONSTANT\n" + limitText(retryConstantMatch[0], 1200));
  }

  const fetchMetricMatch = source.match(
    /(?:async\s+)?function\s+fetchMetricData[\s\S]{0,6000}/
  );

  if (fetchMetricMatch) {
    sections.push("### fetchMetricData\n" + limitText(fetchMetricMatch[0], 5000));
  }

  const aiBMatch = source.match(
    /(?:async\s+)?function\s+runAiBAutomatedHandoff[\s\S]{0,4500}/
  );

  if (aiBMatch) {
    sections.push("### AI B HANDOFF\n" + limitText(aiBMatch[0], 3500));
  }

  const keywordLines = source
    .split("\n")
    .filter((line) =>
      /retryLogs|attemptCount|fixedTests|aiBRunning|aiBResultSummary|RAW|STORED|DISPLAY|PREV_DAY_DIFF/i.test(
        line
      )
    )
    .slice(0, 100);

  if (keywordLines.length > 0) {
    sections.push("### RELATED STATE / LOGIC\n" + keywordLines.join("\n"));
  }

  if (sections.length === 0) {
    return limitText(source, 5000);
  }

  return limitText(sections.join("\n\n"), 10000);
}

/**
 * ------------------------------------------------------------
 * metric/route.ts에서 TASK-05 관련 부분만 추출
 * ------------------------------------------------------------
 */
function extractMetricVerificationSource(source: string): string {
  const sections: string[] = [];

  const fixtureMatches = source.match(
    /(?:fixture|timeout|auth_denied|rate_limit|offline|schema_changed|T04-RECOVER-D2)[\s\S]{0,6000}/gi
  );

  if (fixtureMatches) {
    sections.push(
      "### FIXTURES\n" + limitText(fixtureMatches.slice(0, 10).join("\n"), 5000)
    );
  }

  const getMatch = source.match(
    /export\s+async\s+function\s+GET[\s\S]{0,7000}/
  );

  if (getMatch) {
    sections.push("### GET API\n" + limitText(getMatch[0], 5500));
  }

  const errorLines = source
    .split("\n")
    .filter((line) =>
      /401|429|500|503|504|ERR_HTTP_401|ERR_HTTP_429|ERR_OFFLINE|ERR_SCHEMA_CHANGED|STALE|FRESH/i.test(
        line
      )
    )
    .slice(0, 100);

  if (errorLines.length > 0) {
    sections.push("### ERROR / STATUS LOGIC\n" + errorLines.join("\n"));
  }

  if (sections.length === 0) {
    return limitText(source, 5000);
  }

  return limitText(sections.join("\n\n"), 8000);
}

export async function POST() {
  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;
    const task05VersionId = process.env.TASK05_VERSION_ID?.trim() || "";

    if (!geminiKey || !groqKey) {
      return NextResponse.json(
        {
          success: false,
          error: "GEMINI_API_KEY 또는 GROQ_API_KEY가 .env.local에 설정되지 않았습니다.",
        },
        { status: 400 }
      );
    }

    const handoffContent = getHandoffContent();
    const handoffValidation = validateHandoffSections(handoffContent);
    const handoffVersionId = getHandoffVersionId(handoffContent);

    const versionConfigured = Boolean(task05VersionId);
    const versionExistsInHandoff = Boolean(handoffVersionId);
    const versionMatched =
      versionConfigured &&
      versionExistsInHandoff &&
      task05VersionId === handoffVersionId;

    const pageCodePath = path.join(process.cwd(), "src/app/page.tsx");
    if (!fs.existsSync(pageCodePath)) {
      return NextResponse.json(
        {
          success: false,
          error: "src/app/page.tsx 파일이 존재하지 않습니다.",
        },
        { status: 404 }
      );
    }

    const pageCodeContent = fs.readFileSync(pageCodePath, "utf-8");
    const metricCodePath = path.join(process.cwd(), "src/app/api/metric/route.ts");
    let metricCodeContent = "";

    if (fs.existsSync(metricCodePath)) {
      metricCodeContent = fs.readFileSync(metricCodePath, "utf-8");
    }

    const pageVerificationSource = extractPageVerificationSource(pageCodeContent);
    const metricVerificationSource = extractMetricVerificationSource(metricCodeContent);

    const promptText = `
TASK_05 코드 교차 검증을 수행하라.

검증 대상:
TEST-01 ~ TEST-10

규칙:
- 실제 구현된 코드만 근거로 판단한다.
- 구현되지 않았거나 불일치하면 FAILED.
- TEST-10은 HANDOFF 7개 섹션 존재 여부와 Version ID 일치 여부를 확인한다.

환경변수 TASK05_VERSION_ID:
${task05VersionId || "(미설정)"}

HANDOFF Version ID:
${handoffVersionId || "(없음)"}

HANDOFF:
${limitText(handoffContent, 4500)}

PAGE TASK-05 관련 코드:
${pageVerificationSource}

METRIC API TASK-05 관련 코드:
${metricVerificationSource}

반드시 JSON만 반환하라.

{
  "testResults": [
    { "id": "TEST-01", "status": "PASSED", "reason": "판정 이유" },
    { "id": "TEST-02", "status": "PASSED", "reason": "판정 이유" },
    { "id": "TEST-03", "status": "PASSED", "reason": "판정 이유" },
    { "id": "TEST-04", "status": "PASSED", "reason": "판정 이유" },
    { "id": "TEST-05", "status": "PASSED", "reason": "판정 이유" },
    { "id": "TEST-06", "status": "PASSED", "reason": "판정 이유" },
    { "id": "TEST-07", "status": "PASSED", "reason": "판정 이유" },
    { "id": "TEST-08", "status": "PASSED", "reason": "판정 이유" },
    { "id": "TEST-09", "status": "PASSED", "reason": "판정 이유" },
    { "id": "TEST-10", "status": "PASSED", "reason": "판정 이유" }
  ]
}
`;

    // 1. Gemini 모델 초기화
    const genAI = new GoogleGenerativeAI(geminiKey);
    const geminiModel = genAI.getGenerativeModel({
      model: "gemini-3.6-flash",
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    // 2. Groq 모델 초기화
    const groq = new Groq({ apiKey: groqKey });
    const groqModelName = process.env.GROQ_MODEL_NAME || "openai/gpt-oss-120b";

    // 3. AI 교차 검증 병렬 호출
    const [geminiRes, groqRes] = await Promise.all([
      geminiModel.generateContent(promptText),
      groq.chat.completions.create({
        messages: [{ role: "user", content: promptText }],
        model: groqModelName,
        temperature: 0,
        max_tokens: 1200,
        response_format: { type: "json_object" },
      }),
    ]);

    const geminiData = parseAiJson(geminiRes.response.text());
    const groqData = parseAiJson(groqRes.choices[0]?.message?.content || "{}");

    const geminiResults = Array.isArray(geminiData.testResults) ? geminiData.testResults : [];
    const groqResults = Array.isArray(groqData.testResults) ? groqData.testResults : [];

    let isConsensus = true;

    // Gemini 및 Groq 결과 비교 및 병합
    const finalResults = geminiResults.map((gItem: any) => {
      const groqItem = groqResults.find((item: any) => item.id === gItem.id);
      const isMatched = Boolean(groqItem) && groqItem.status === gItem.status;

      if (!isMatched) {
        isConsensus = false;
      }

      return {
        id: gItem.id,
        geminiStatus: gItem.status,
        geminiReason: gItem.reason,
        gptOssStatus: groqItem ? groqItem.status : "ERROR",
        gptOssReason: groqItem ? groqItem.reason : "응답 없음",
        status: isMatched ? gItem.status : "DISAGREEMENT",
      };
    });

    // TEST-10 최종 검증 반영
    const test10Passed = handoffValidation.allPassed && versionMatched;
    const test10Index = finalResults.findIndex((item: any) => item.id === "TEST-10");

    if (test10Index !== -1) {
      finalResults[test10Index] = {
        ...finalResults[test10Index],
        status: test10Passed ? "PASSED" : "FAILED",
        reason: test10Passed
          ? `HANDOFF 문서 7개 섹션 구조 검증 및 Version ID(${task05VersionId}) 일치 확인 완료`
          : `검증 실패 (섹션 검증: ${handoffValidation.allPassed ? "성공" : "실패"}, Version ID 일치: ${versionMatched ? "성공" : "실패"})`,
        handoffValidation: {
          sections: handoffValidation.sections,
          allSectionsPassed: handoffValidation.allPassed,
          version: {
            environment: task05VersionId || null,
            handoff: handoffVersionId,
            configured: versionConfigured,
            existsInHandoff: versionExistsInHandoff,
            matched: versionMatched,
          },
        },
      };
    }

    const finalConsensus = isConsensus && test10Passed;
    const summaryText = finalConsensus
      ? "✅ Gemini와 Groq(GPT-OSS) 검증 결과가 일치하고 HANDOFF 검증도 통과했습니다."
      : "⚠️ AI 판정 불일치 또는 HANDOFF 검증 실패 항목이 존재합니다.";

    // -------------------------------------------------------------
    // 💡 Supabase DB 자동 저장 (기존 로직 100% 보존 후 추가)
    // -------------------------------------------------------------
    let savedLogId: string | null = null;
    let dbSaveError: string | null = null;

    if (supabaseUrl && supabaseKey) {
      try {
        // 1. 메인 로그 INSERT (test_execution_logs)
        const { data: logData, error: logErr } = await supabase
          .from("test_execution_logs")
          .insert({
            task_version_id: task05VersionId || "UNKNOWN",
            executed_by: `Dual AI Strict Cross-Checker (Gemini + ${groqModelName})`,
            consensus: finalConsensus,
            all_sections_passed: handoffValidation.allPassed,
            summary: summaryText,
          })
          .select("id")
          .single();

        if (logErr) throw logErr;
        savedLogId = logData.id;

        // 2. 세부 항목 TEST-01~TEST-10 Bulk INSERT (test_item_results)
        if (finalResults.length > 0 && savedLogId) {
          const itemInserts = finalResults.map((item: any) => ({
            log_id: savedLogId,
            test_id: item.id,
            test_name: item.id,
            status: item.status,
            reason:
              item.status === "PASSED"
                ? `[Gemini] ${item.geminiReason || ""}`
                : `[Gemini] ${item.geminiReason || ""} | [Groq] ${item.gptOssReason || ""}`,
            details: {
              geminiStatus: item.geminiStatus,
              geminiReason: item.geminiReason,
              gptOssStatus: item.gptOssStatus,
              gptOssReason: item.gptOssReason,
              handoffValidation: item.handoffValidation || null,
            },
          }));

          const { error: itemsErr } = await supabase
            .from("test_item_results")
            .insert(itemInserts);

          if (itemsErr) {
            console.error("💥 [Supabase Item Save Error]:", itemsErr.message);
          }
        }
      } catch (dbErr: any) {
        console.error("💥 [Supabase DB Save Error]:", dbErr.message);
        dbSaveError = dbErr.message;
      }
    }

    // -------------------------------------------------------------
    // 기존 JSON 응답 구조 유지 (+ Supabase 저장 상태 파라미터 추가)
    // -------------------------------------------------------------
    return NextResponse.json({
      success: true,
      executedBy: `Dual AI Strict Cross-Checker (Gemini + ${groqModelName})`,
      consensus: finalConsensus,
      savedToSupabase: !!savedLogId,
      supabaseLogId: savedLogId,
      dbSaveError,
      version: {
        environmentVariable: "TASK05_VERSION_ID",
        configured: versionConfigured,
        environmentVersion: task05VersionId || null,
        handoffVersion: handoffVersionId,
        matched: versionMatched,
      },
      handoffValidation: {
        sections: handoffValidation.sections,
        allSectionsPassed: handoffValidation.allPassed,
        versionConfigured,
        versionExistsInHandoff,
        versionMatched,
        test10Passed,
      },
      data: {
        summary: summaryText,
        testResults: finalResults,
      },
    });
  } catch (error: any) {
    console.error("💥 [VERIFY_ERROR]:", error?.message || error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "교차 검증 수행 실패",
      },
      { status: 500 }
    );
  }
}