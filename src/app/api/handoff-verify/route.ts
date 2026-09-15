import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";

function getHandoffContent(): string {
  const possiblePaths = [
    path.join(process.cwd(), "HANDOFF_TASK_05.md"),
    path.join(process.cwd(), "HANDOFF_TASK_05.MD"),
  ];

  for (const filePath of possiblePaths) {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, "utf-8");
    }
  }

  return "HANDOFF_TASK_05.md 파일이 존재하지 않습니다.";
}

export async function POST() {
  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;

    if (!geminiKey || !groqKey) {
      return NextResponse.json(
        { success: false, error: "GEMINI_API_KEY 또는 GROQ_API_KEY가 .env.local에 설정되지 않았습니다." },
        { status: 400 }
      );
    }

    const handoffContent = getHandoffContent();
    const pageCodePath = path.join(process.cwd(), "src/app/page.tsx");

    if (!fs.existsSync(pageCodePath)) {
      return NextResponse.json(
        { success: false, error: "src/app/page.tsx 파일이 존재하지 않습니다." },
        { status: 404 }
      );
    }

    const pageCodeContent = fs.readFileSync(pageCodePath, "utf-8");

    const promptText = `너는 TASK_05 코드 교차 검증 심사관이다.
아래 제공된 [HANDOFF DOCUMENT] 요구사항과 [SOURCE CODE IN IMPLEMENTATION]의 실제 구현 코드를 엄격하게 대조 분석하라.

검사 규칙:
1. TEST-01부터 TEST-10까지 각 항목에 대하여, 실제 소스코드에 해당 로직이 정확히 구현되어 동작하는지 판정하라.
2. 요구사항이 완벽히 구현되어 있으면 "PASSED", 구현되어 있지 않거나 미흡하면 반드시 "FAILED"로 평가하라. 절대로 무조건 PASSED로 처리하지 마라.
3. 특히 자동 재시도, Exponential Backoff 관련 로직(TEST-09, TEST-10 등)이 소스코드에 실제로 존재하지 않는다면 반드시 "FAILED"로 판정하라.

반드시 아래 JSON 스키마 규격으로만 응답하라:
{
  "testResults": [
    { "id": "TEST-01", "status": "PASSED 또는 FAILED", "reason": "판정 이유 한 줄 요약" },
    { "id": "TEST-02", "status": "PASSED 또는 FAILED", "reason": "판정 이유 한 줄 요약" },
    { "id": "TEST-03", "status": "PASSED 또는 FAILED", "reason": "판정 이유 한 줄 요약" },
    { "id": "TEST-04", "status": "PASSED 또는 FAILED", "reason": "판정 이유 한 줄 요약" },
    { "id": "TEST-05", "status": "PASSED 또는 FAILED", "reason": "판정 이유 한 줄 요약" },
    { "id": "TEST-06", "status": "PASSED 또는 FAILED", "reason": "판정 이유 한 줄 요약" },
    { "id": "TEST-07", "status": "PASSED 또는 FAILED", "reason": "판정 이유 한 줄 요약" },
    { "id": "TEST-08", "status": "PASSED 또는 FAILED", "reason": "판정 이유 한 줄 요약" },
    { "id": "TEST-09", "status": "PASSED 또는 FAILED", "reason": "판정 이유 한 줄 요약" },
    { "id": "TEST-10", "status": "PASSED 또는 FAILED", "reason": "판정 이유 한 줄 요약" }
  ]
}

[HANDOFF DOCUMENT]
${handoffContent}

[SOURCE CODE IN IMPLEMENTATION]
${pageCodeContent}`;

    // 1. Gemini API 설정 (권장 모델명인 gemini-3.6-flash 지정)
    const genAI = new GoogleGenerativeAI(geminiKey);
    const geminiModel = genAI.getGenerativeModel({
      model: "gemini-3.6-flash",
      generationConfig: { responseMimeType: "application/json" },
    });

    // 2. Groq API 설정
    const groq = new Groq({ apiKey: groqKey });
    const groqModelName = process.env.GROQ_MODEL_NAME || "openai/gpt-oss-120b";

    const [geminiRes, groqRes] = await Promise.all([
      geminiModel.generateContent(promptText),
      groq.chat.completions.create({
        messages: [{ role: "user", content: promptText }],
        model: groqModelName,
        response_format: { type: "json_object" },
      }),
    ]);

    const geminiData = JSON.parse(geminiRes.response.text());
    const groqData = JSON.parse(groqRes.choices[0]?.message?.content || "{}");

    // 3. AI 교차 검증 비교
    let isConsensus = true;
    const finalResults = (geminiData.testResults || []).map((gItem: any) => {
      const lItem = (groqData.testResults || []).find((l: any) => l.id === gItem.id);
      const isMatched = lItem && lItem.status === gItem.status;

      if (!isMatched) isConsensus = false;

      return {
        id: gItem.id,
        geminiStatus: gItem.status,
        geminiReason: gItem.reason,
        llamaStatus: lItem ? lItem.status : "ERROR",
        llamaReason: lItem ? lItem.reason : "응답 없음",
        status: isMatched ? gItem.status : "DISAGREEMENT",
      };
    });

    return NextResponse.json({
      success: true,
      executedBy: `Dual AI Strict Cross-Checker (Gemini + ${groqModelName})`,
      consensus: isConsensus,
      data: {
        summary: isConsensus
          ? "✅ Gemini와 Groq Llama의 검증 결과가 일치합니다."
          : "⚠️ 두 AI간 판정이 불일치하는 항목이 존재합니다.",
        testResults: finalResults,
      },
    });
  } catch (error: any) {
    console.error("💥 [VERIFY_ERROR]:", error.message);
    return NextResponse.json(
      { success: false, error: error.message || "교차 검증 수행 실패" },
      { status: 500 }
    );
  }
}