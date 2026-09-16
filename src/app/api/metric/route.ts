import { NextResponse } from "next/server";

const KOREAEXIM_AUTH_KEY =
  process.env.KOREAEXIM_AUTHKEY || "";

function formatDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(
    date.getMonth() + 1
  ).padStart(2, "0");
  const d = String(
    date.getDate()
  ).padStart(2, "0");

  return `${y}${m}${d}`;
}

function formatDateISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(
    date.getMonth() + 1
  ).padStart(2, "0");
  const d = String(
    date.getDate()
  ).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

async function fetchKoreaEximSingle(
  searchDateStr: string
) {
  if (!KOREAEXIM_AUTH_KEY) {
    console.log(
      "[KOREAEXIM] AUTH_KEY가 설정되지 않았습니다."
    );

    return null;
  }

  try {
    const controller =
      new AbortController();

    const timeoutId =
      setTimeout(
        () => controller.abort(),
        3500
      );

    const apiUrl =
      `https://www.koreaexim.go.kr/site/program/financial/exchangeJSON` +
      `?authkey=${KOREAEXIM_AUTH_KEY}` +
      `&searchdate=${searchDateStr}` +
      `&data=AP01`;

    const res = await fetch(
      apiUrl,
      {
        cache: "no-store",
        signal:
          controller.signal,

        headers: {
          "User-Agent":
            "Mozilla/5.0",
          Accept:
            "application/json",
        },
      }
    );

    clearTimeout(timeoutId);

    if (res.ok) {
      const rawList =
        await res.json();

      if (
        Array.isArray(rawList) &&
        rawList.length > 0
      ) {
        const usdItem =
          rawList.find(
            (item: any) =>
              item.cur_unit === "USD"
          );

        if (usdItem?.deal_bas_r) {
          const formattedSourceDate =
            `${searchDateStr.slice(
              0,
              4
            )}-${searchDateStr.slice(
              4,
              6
            )}-${searchDateStr.slice(
              6,
              8
            )}`;

          return {
            value: parseFloat(
              usdItem.deal_bas_r.replace(
                /,/g,
                ""
              )
            ),

            unit: "KRW / USD",

            sourceName:
              "한국수출입은행 환율 정보",

            sourceUrl:
              "https://www.koreaexim.go.kr",

            sourceTime:
              `${formattedSourceDate} 11:00:00`,

            rawJsonStr:
              JSON.stringify(
                usdItem
              ),
          };
        }
      }
    }

    return null;
  } catch (err: any) {
    console.log(
      "[KOREAEXIM ERROR]",
      err?.message || err
    );

    return null;
  }
}

export async function GET(
  request: Request
) {
  const {
    searchParams,
  } = new URL(
    request.url
  );

  const fixture =
    searchParams.get(
      "fixture"
    );

  /*
   * ============================================================
   * TASK_05 ERROR FIXTURES
   * ============================================================
   */

  if (fixture === "timeout") {
    return NextResponse.json(
      {
        error_code:
          "ERR_TIMEOUT",

        message:
          "외부 원천 응답 시간 초과 (504 Gateway Timeout)",
      },
      {
        status: 504,
      }
    );
  }

  if (fixture === "auth_denied") {
    return NextResponse.json(
      {
        error_code:
          "ERR_AUTH_DENIED",

        message:
          "외부 원천 인증 실패 (401/403 Access Denied)",
      },
      {
        status: 401,
      }
    );
  }

  if (fixture === "rate_limit") {
    return NextResponse.json(
      {
        error_code:
          "ERR_RATE_LIMIT",

        message:
          "외부 원천 호출 한도 초과 (429 Too Many Requests)",
      },
      {
        status: 429,
      }
    );
  }

  if (fixture === "offline") {
    return NextResponse.json(
      {
        error_code:
          "ERR_OFFLINE",

        message:
          "네트워크 연결 끊김 (Offline / Disconnected)",
      },
      {
        status: 503,
      }
    );
  }

  if (fixture === "schema_changed") {
    return NextResponse.json(
      {
        error_code:
          "ERR_SCHEMA_CHANGED",

        message:
          "응답 규격/필드 구조 변경 오류 (Invalid Schema)",
      },
      {
        status: 500,
      }
    );
  }

  /*
   * ============================================================
   * T04-RECOVER-D2
   * ============================================================
   */
  if (
    fixture ===
    "T04-RECOVER-D2"
  ) {
    return NextResponse.json({
      status: "success",

      data: {
        value: 1385.5,

        unit: "KRW / USD",

        sourceName:
          "한국수출입은행 환율 정보",

        sourceUrl:
          "https://www.koreaexim.go.kr",

        sourceTime:
          "2026-09-11 11:00:00",

        fetchedTime:
          "2026-09-11 15:30:00",

        timezone:
          "Asia/Seoul",

        rawJsonStr:
          JSON.stringify({
            deal_bas_r:
              "1,385.50",

            cur_unit:
              "USD",
          }),
      },

      previousData: {
        value: 1370,

        unit: "KRW / USD",

        sourceName:
          "한국수출입은행 환율 정보",

        sourceUrl:
          "https://www.koreaexim.go.kr",

        sourceTime:
          "2026-09-10 11:00:00",

        fetchedTime:
          "2026-09-10 15:30:00",

        timezone:
          "Asia/Seoul",

        rawJsonStr:
          JSON.stringify({
            deal_bas_r:
              "1,370.00",

            cur_unit:
              "USD",
          }),
      },
    });
  }

  /*
   * ============================================================
   * LIVE DATA
   * ============================================================
   */

  const nowTimeStr =
    new Date().toLocaleString(
      "sv-SE",
      {
        timeZone:
          "Asia/Seoul",
      }
    );

  const today =
    new Date();

  const fetchedList: any[] =
    [];

  /*
   * 최근 14일 탐색
   */
  for (
    let i = 0;
    i < 14;
    i++
  ) {
    const targetDate =
      new Date(today);

    targetDate.setDate(
      today.getDate() - i
    );

    const searchDateStr =
      formatDateStr(
        targetDate
      );

    const data =
      await fetchKoreaEximSingle(
        searchDateStr
      );

    if (data) {
      fetchedList.push({
        ...data,

        fetchedTime:
          nowTimeStr,

        timezone:
          "Asia/Seoul",
      });

      if (
        fetchedList.length >= 2
      ) {
        break;
      }
    }
  }

  /*
   * ============================================================
   * Korea Exim 2일 확보
   * ============================================================
   */
  if (
    fetchedList.length >= 2
  ) {
    return NextResponse.json({
      status: "success",

      data:
        fetchedList[0],

      previousData:
        fetchedList[1],
    });
  }

  /*
   * ============================================================
   * Frankfurter fallback
   * ============================================================
   */
  try {
    const endDate =
      formatDateISO(
        today
      );

    const startDateObj =
      new Date(today);

    startDateObj.setDate(
      today.getDate() - 10
    );

    const startDate =
      formatDateISO(
        startDateObj
      );

    const res =
      await fetch(
        `https://api.frankfurter.app/${startDate}..${endDate}?from=USD&to=KRW`,
        {
          cache:
            "no-store",
        }
      );

    if (res.ok) {
      const json =
        await res.json();

      const ratesObj =
        json.rates || {};

      const dates =
        Object.keys(
          ratesObj
        ).sort();

      if (
        dates.length >= 2
      ) {
        const latestDate =
          dates[
            dates.length - 1
          ];

        const prevDate =
          dates[
            dates.length - 2
          ];

        return NextResponse.json({
          status:
            "success",

          data: {
            value:
              ratesObj[
                latestDate
              ].KRW,

            unit:
              "KRW / USD",

            sourceName:
              "ECB Exchange Rates (Fallback)",

            sourceUrl:
              "https://www.frankfurter.app",

            sourceTime:
              `${latestDate} 00:00:00`,

            fetchedTime:
              nowTimeStr,

            timezone:
              "Asia/Seoul",

            rawJsonStr:
              JSON.stringify({
                date:
                  latestDate,

                rate:
                  ratesObj[
                    latestDate
                  ],
              }),
          },

          previousData: {
            value:
              ratesObj[
                prevDate
              ].KRW,

            unit:
              "KRW / USD",

            sourceName:
              "ECB Exchange Rates (Fallback)",

            sourceUrl:
              "https://www.frankfurter.app",

            sourceTime:
              `${prevDate} 00:00:00`,

            fetchedTime:
              nowTimeStr,

            timezone:
              "Asia/Seoul",

            rawJsonStr:
              JSON.stringify({
                date:
                  prevDate,

                rate:
                  ratesObj[
                    prevDate
                  ],
              }),
          },
        });
      }
    }
  } catch (error: any) {
    console.log(
      "[FALLBACK ERROR]",
      error?.message ||
        error
    );
  }

  /*
   * ============================================================
   * 데이터가 1개라도 있으면 반환
   * ============================================================
   */
  if (
    fetchedList.length === 1
  ) {
    return NextResponse.json({
      status:
        "success",

      data:
        fetchedList[0],

      previousData:
        null,
    });
  }

  /*
   * ============================================================
   * 최종 실패
   * ============================================================
   */
  return NextResponse.json(
    {
      error_code:
        "ERR_TIMEOUT",

      message:
        "모든 외부 원천 응답 수신 실패",
    },
    {
      status: 504,
    }
  );
}