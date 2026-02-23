import {
  corsHeaders,
  getServiceClient,
  getSettingsByEnv,
  getAppToken,
  logAppmax,
  logHandshake,
  extractSafeHeaders,
  encrypt,
  maskSecret,
  requireAdmin,
  errorResponse,
  jsonResponse,
} from "../_shared/appmax.ts";

type ContentType = "json" | "form";
type TokenSource = "request" | "installation";

interface GenerateAttempt {
  name: string;
  payload: Record<string, string>;
  contentType: ContentType;
  tokenSource: TokenSource;
}

function normalizePayload(payload: Record<string, string | null | undefined>) {
  return Object.fromEntries(
    Object.entries(payload)
      .filter(([, value]) => typeof value === "string" && value.trim().length > 0)
      .map(([key, value]) => [key, String(value)])
  ) as Record<string, string>;
}

function extractApiErrorMessage(response: any): string {
  const rawMessage =
    response?.errors?.message ??
    response?.message ??
    response?.error ??
    response?.error_description ??
    null;

  if (!rawMessage) return "Falha ao gerar credenciais";
  if (typeof rawMessage === "string") return rawMessage;
  if (Array.isArray(rawMessage)) return rawMessage.join(", ");

  try {
    return JSON.stringify(rawMessage);
  } catch {
    return "Falha ao gerar credenciais";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = getServiceClient();
  const requestId = crypto.randomUUID();
  const safeHeaders = extractSafeHeaders(req);

  // Auth check — admin only
  const authResult = await requireAdmin(req, supabase);
  if (authResult instanceof Response) return authResult;

  try {
    const body = await req.json();
    const { external_key, token, environment } = body;

    if (!external_key || !token) {
      return errorResponse("external_key e token são obrigatórios", 400);
    }

    const env = environment || "sandbox";
    const settings = await getSettingsByEnv(supabase, env);
    if (!settings) {
      return errorResponse(`Nenhuma configuração encontrada para ambiente '${env}'`, 400);
    }

    if (!settings.base_api_url) {
      return errorResponse(`base_api_url não configurado para ambiente '${env}'`, 400);
    }

    // Get app token
    const accessToken = await getAppToken(supabase, settings);
    const generateUrl = `${settings.base_api_url}/app/client/generate`;

    // Fallback token source: installation.authorize_token
    const { data: installation } = await supabase
      .from("appmax_installations")
      .select("authorize_token")
      .eq("external_key", external_key)
      .eq("environment", env)
      .maybeSingle();

    const candidateTokens = Array.from(
      new Set(
        [token, installation?.authorize_token]
          .filter((value) => typeof value === "string" && value.trim().length > 0)
          .map((value) => value.trim())
      )
    ) as string[];

    if (candidateTokens.length === 0) {
      return errorResponse("Nenhum token válido disponível para gerar credenciais", 400);
    }

    const attempts: GenerateAttempt[] = [];
    for (const candidate of candidateTokens) {
      const tokenSource: TokenSource = candidate === token ? "request" : "installation";

      attempts.push(
        {
          name: "token_json",
          payload: normalizePayload({ token: candidate }),
          contentType: "json",
          tokenSource,
        },
        {
          name: "token_form",
          payload: normalizePayload({ token: candidate }),
          contentType: "form",
          tokenSource,
        },
        {
          name: "token_external_key_json",
          payload: normalizePayload({ token: candidate, external_key }),
          contentType: "json",
          tokenSource,
        },
        {
          name: "token_external_key_form",
          payload: normalizePayload({ token: candidate, external_key }),
          contentType: "form",
          tokenSource,
        },
        {
          name: "token_app_id_json",
          payload: normalizePayload({ token: candidate, app_id: settings.app_id }),
          contentType: "json",
          tokenSource,
        },
        {
          name: "token_app_id_external_key_json",
          payload: normalizePayload({ token: candidate, app_id: settings.app_id, external_key }),
          contentType: "json",
          tokenSource,
        },
        {
          name: "install_token_json",
          payload: normalizePayload({ install_token: candidate }),
          contentType: "json",
          tokenSource,
        },
        {
          name: "hash_json",
          payload: normalizePayload({ hash: candidate }),
          contentType: "json",
          tokenSource,
        }
      );
    }

    let successData:
      | {
          merchantClientId: string;
          merchantClientSecret: string;
          payloadKeys: string[];
          attemptName: string;
          tokenSource: TokenSource;
          externalId: string | null;
        }
      | null = null;

    let lastResponse: any = null;
    let lastRawText = "";
    let lastStatus = 0;

    const attemptResults: Array<Record<string, unknown>> = [];

    for (const attempt of attempts) {
      try {
        const bodyPayload =
          attempt.contentType === "form"
            ? new URLSearchParams(attempt.payload).toString()
            : JSON.stringify(attempt.payload);

        const generateRes = await fetch(generateUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type":
              attempt.contentType === "form"
                ? "application/x-www-form-urlencoded"
                : "application/json",
          },
          body: bodyPayload,
        });

        lastStatus = generateRes.status;
        lastRawText = await generateRes.text();

        let parsed: any;
        try {
          parsed = JSON.parse(lastRawText);
        } catch {
          parsed = { raw: lastRawText.slice(0, 1000) };
        }
        lastResponse = parsed;

        const attemptResult = {
          name: attempt.name,
          token_source: attempt.tokenSource,
          content_type: attempt.contentType,
          payload_keys: Object.keys(attempt.payload),
          status: generateRes.status,
          ok: generateRes.ok,
          response_preview: lastRawText.slice(0, 300),
        };
        attemptResults.push(attemptResult);

        await logAppmax(
          supabase,
          "info",
          `generate attempt: ${attempt.name}`,
          {
            ...attemptResult,
            request_id: requestId,
          }
        );

        if (!generateRes.ok) {
          continue;
        }

        const merchantClientId =
          parsed?.client_id || parsed?.data?.client_id || parsed?.merchant_client_id || parsed?.data?.merchant_client_id;
        const merchantClientSecret =
          parsed?.client_secret || parsed?.data?.client_secret || parsed?.merchant_client_secret || parsed?.data?.merchant_client_secret;
        const externalId = parsed?.external_id || parsed?.data?.external_id || null;

        if (merchantClientId && merchantClientSecret) {
          successData = {
            merchantClientId,
            merchantClientSecret,
            payloadKeys: Object.keys(attempt.payload),
            attemptName: attempt.name,
            tokenSource: attempt.tokenSource,
            externalId,
          };
          break;
        }
      } catch (fetchErr: any) {
        const fetchMessage = fetchErr?.message || "Erro de rede ao gerar credenciais";
        attemptResults.push({
          name: attempt.name,
          token_source: attempt.tokenSource,
          content_type: attempt.contentType,
          payload_keys: Object.keys(attempt.payload),
          ok: false,
          status: 0,
          response_preview: fetchMessage,
        });

        await logAppmax(
          supabase,
          "error",
          `generate attempt fetch error: ${attempt.name}`,
          {
            request_id: requestId,
            message: fetchMessage,
            payload_keys: Object.keys(attempt.payload),
            token_source: attempt.tokenSource,
          }
        );
      }
    }

    if (successData) {
      const encryptedSecret = await encrypt(successData.merchantClientSecret);

      const updatePayload: Record<string, unknown> = {
        merchant_client_id: successData.merchantClientId,
        merchant_client_secret: null,
        merchant_client_secret_encrypted: encryptedSecret,
        status: "connected",
        last_error: null,
      };

      if (successData.externalId) {
        updatePayload.external_id = successData.externalId;
      }

      const { error: updateError } = await supabase
        .from("appmax_installations")
        .update(updatePayload)
        .eq("external_key", external_key)
        .eq("environment", env);

      if (updateError) {
        throw new Error(updateError.message);
      }

      await logHandshake(supabase, {
        environment: env,
        stage: "callback",
        external_key,
        request_id: requestId,
        ok: true,
        http_status: 200,
        message: `Credenciais geradas com sucesso (${env})`,
        payload: {
          merchant_client_id: successData.merchantClientId,
          attempt_name: successData.attemptName,
          used_payload_keys: successData.payloadKeys,
          token_source: successData.tokenSource,
          total_attempts: attemptResults.length,
        },
        headers: safeHeaders,
      });

      return jsonResponse({ success: true, status: "connected", environment: env });
    }

    const errMsg = extractApiErrorMessage(lastResponse);
    const fullDiag = {
      api_status: lastStatus,
      api_response: typeof lastResponse === "object" ? lastResponse : { raw: lastRawText.slice(0, 1000) },
      generate_url: generateUrl,
      token_preview: maskSecret(token),
      candidate_token_count: candidateTokens.length,
      attempted_count: attemptResults.length,
      attempt_results: attemptResults,
    };

    await logHandshake(supabase, {
      environment: env,
      stage: "callback",
      external_key,
      request_id: requestId,
      ok: false,
      http_status: lastStatus || 500,
      message: `Todas as tentativas falharam em /app/client/generate: ${errMsg}`,
      payload: fullDiag,
      headers: safeHeaders,
    });

    await logAppmax(supabase, "error", `Falha definitiva em /app/client/generate (${env})`, fullDiag);

    await supabase
      .from("appmax_installations")
      .update({
        status: "error",
        last_error: `HTTP ${lastStatus || 500}: ${errMsg}`,
      })
      .eq("external_key", external_key)
      .eq("environment", env);

    return errorResponse(`HTTP ${lastStatus || 500}: ${errMsg}`);
  } catch (err: any) {
    await logHandshake(supabase, {
      environment: "unknown",
      stage: "callback",
      external_key: null,
      request_id: requestId,
      ok: false,
      http_status: 500,
      message: `Erro em appmax-generate-merchant-keys: ${err.message}`,
      headers: safeHeaders,
      error_stack: err.stack || null,
    });
    return errorResponse(err.message);
  }
});
