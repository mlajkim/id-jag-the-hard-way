export type AthenzStep = "id_token_to_idjag" | "idjag_to_at";

type I18n = { en: string; ja: string; ko: string };

const STEP_LABELS: Record<AthenzStep, I18n> = {
  id_token_to_idjag: {
    en: "ID token → ID-JAG exchange",
    ja: "IDトークン → ID-JAG 交換",
    ko: "ID 토큰 → ID-JAG 교환",
  },
  idjag_to_at: {
    en: "ID-JAG → Athenz Access Token exchange",
    ja: "ID-JAG → Athenz アクセストークン 交換",
    ko: "ID-JAG → Athenz 액세스 토큰 교환",
  },
};

const STEP_HINTS: Record<AthenzStep, I18n[]> = {
  id_token_to_idjag: [
    {
      en: "Verify that the Keycloak token exchange provider is installed and the 'urn:ietf:params:oauth:token-type:id-jag' token type is enabled.",
      ja: "Keycloakのトークン交換プロバイダーがインストールされており、'urn:ietf:params:oauth:token-type:id-jag' トークンタイプが有効になっていることを確認してください。",
      ko: "Keycloak 토큰 교환 프로바이더가 설치되어 있고 'urn:ietf:params:oauth:token-type:id-jag' 토큰 타입이 활성화되어 있는지 확인하세요.",
    },
    {
      en: "Check that the ID token issuer matches what Athenz ZTS expects.",
      ja: "IDトークンの発行者（issuer）がAthenz ZTSの期待する値と一致しているか確認してください。",
      ko: "ID 토큰의 발급자(issuer)가 Athenz ZTS가 기대하는 값과 일치하는지 확인하세요.",
    },
    {
      en: "Ensure the requested scope is listed in the Athenz policy for this identity.",
      ja: "要求されたスコープがこのIDのAthenzポリシーに含まれていることを確認してください。",
      ko: "요청한 스코프가 이 ID에 대한 Athenz 정책에 포함되어 있는지 확인하세요.",
    },
  ],
  idjag_to_at: [
    {
      en: "Check that the Athenz policy grants the required scope to the AI Client Gateway service identity.",
      ja: "AIクライアントゲートウェイのサービスIDに対して、必要なスコープがAthenzポリシーで許可されているか確認してください。",
      ko: "AI 클라이언트 게이트웨이 서비스 ID에 대해 필요한 스코프가 Athenz 정책에서 허용되어 있는지 확인하세요.",
    },
    {
      en: "Verify that ZPU has pushed the latest policy to the resource server.",
      ja: "ZPUが最新のポリシーをリソースサーバーにプッシュ済みであることを確認してください。",
      ko: "ZPU가 최신 정책을 리소스 서버에 푸시했는지 확인하세요.",
    },
    {
      en: "Ensure the scope in the OpenAPI spec matches the Athenz role/resource exactly.",
      ja: "OpenAPIスペックのスコープがAthenzのロール/リソースと完全に一致しているか確認してください。",
      ko: "OpenAPI 스펙의 스코프가 Athenz 역할/리소스와 정확히 일치하는지 확인하세요.",
    },
  ],
};

export class AthenzError extends Error {
  readonly name = "AthenzError";
  readonly step: AthenzStep;
  readonly scope: string;
  readonly httpStatus: number;
  readonly athenzCode: number | undefined;
  readonly athenzMessage: string | undefined;

  constructor(
    message: string,
    step: AthenzStep,
    scope: string,
    httpStatus: number,
    athenzCode?: number,
    athenzMessage?: string,
  ) {
    super(message);
    this.step = step;
    this.scope = scope;
    this.httpStatus = httpStatus;
    this.athenzCode = athenzCode;
    this.athenzMessage = athenzMessage;
  }

  toResponseBody() {
    const labels = STEP_LABELS[this.step];
    const hints = STEP_HINTS[this.step];
    const athenzMsg = this.athenzMessage ?? this.message;
    return {
      error: "athenz_token_exchange_failed",
      step: this.step,
      step_description: labels.en,
      scope: this.scope,
      athenz_http_status: this.httpStatus,
      athenz_code: this.athenzCode ?? null,
      athenz_message: this.athenzMessage ?? null,
      message: {
        en: `Token exchange failed at "${labels.en}" for scope "${this.scope}". Athenz responded: ${athenzMsg}.`,
        ja: `スコープ "${this.scope}" の "${labels.ja}" でトークン交換に失敗しました。Athenzの応答: ${athenzMsg}`,
        ko: `스코프 "${this.scope}"에 대한 "${labels.ko}"에서 토큰 교환이 실패했습니다. Athenz 응답: ${athenzMsg}`,
      },
      troubleshooting: hints.map(h => ({ en: h.en, ja: h.ja, ko: h.ko })),
    };
  }
}

export function parseAthenzError(
  rawBody: string,
  httpStatus: number,
  step: AthenzStep,
  scope: string,
): AthenzError {
  let athenzCode: number | undefined;
  let athenzMessage: string | undefined;

  try {
    const parsed = JSON.parse(rawBody);
    athenzCode = typeof parsed.code === "number" ? parsed.code : undefined;
    athenzMessage = typeof parsed.message === "string" ? parsed.message : undefined;
  } catch {
    athenzMessage = rawBody.slice(0, 500);
  }

  const summary = athenzMessage
    ? `Athenz ZTS ${httpStatus}: ${athenzMessage}`
    : `Athenz ZTS ${httpStatus}: ${rawBody.slice(0, 200)}`;

  return new AthenzError(summary, step, scope, httpStatus, athenzCode, athenzMessage);
}
