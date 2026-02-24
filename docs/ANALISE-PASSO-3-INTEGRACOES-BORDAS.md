# Passo 3 — Auditoria das integrações (Appmax, Yampi, Bling) nas bordas

## 1. Appmax

### 1.1 Pontos de entrada
- **process-payment** (Edge Function): ações `get_payment_config`, `tokenize_card`, `process_payment`, `get_order_status`.
- **appmax-authorize**: inicia OAuth; usa `appmaxRequest` (retry).
- **appmax-healthcheck**: GET/POST; recebe credenciais da Appmax; grava em `appmax_installations` e tokens.
- **appmax-webhook**: notificações de status do pedido (PIX pago, reembolso, etc.).
- **appmax-get-app-token**: retorna token de app (cache criptografado).

### 1.2 Segurança e validação
| Aspecto | Implementação |
|---------|----------------|
| Autenticação process-payment | Bearer JWT (usuário logado) ou `order_id` + `order_access_token` (convidado). Validação de pedido no Supabase. |
| Rate limit | Por IP: 10 requisições de pagamento por minuto (`payment:${clientIP}`). Limpeza do mapa ao passar de 10k chaves. |
| Webhook Appmax | `APPMAX_WEBHOOK_SECRET` no query string (`?token=`). Rejeita se não configurado ou diferente. |
| Credenciais | Preferência: `appmax_settings` (DB) com `client_secret` criptografado (APP_ENC_KEY). Fallback: env `APPMAX_CLIENT_ID` / `APPMAX_CLIENT_SECRET`. |
| Logs | `appmax_logs` com metadados mascarados (secret/token/password/key). |

### 1.3 Regras de negócio (process-payment)
- **Valor**: total recalculado no servidor (itens + cupom + frete); desconto PIX aplicado; tolerância de 1% para arredondamento; rejeita se divergência.
- **Estoque**: `decrement_stock` por item; em falha de pagamento ou estoque, faz rollback (increment_stock) dos já debitados.
- **Idempotência**: não há idempotency_key no process-payment; a idempotência é garantida no front (Checkout.tsx com `idempotency_key` ao criar o pedido e uma única chamada de process_payment por pedido).
- **Resposta**: retorno com PIX (qrcode, emv, expiration) ou sucesso; erros com mensagem e, quando aplicável, `error_code` e `available_stock`.

### 1.4 Resiliência
- **appmaxRequest** (_shared/appmax.ts): até 3 tentativas; retry em 429 e 5xx com backoff exponencial (2^attempt * 500 ms).
- **getAppToken**: usa cache criptografado em `appmax_tokens_cache`; refresh OAuth quando expirado.
- **Sem timeout**: chamadas `fetch` para a API Appmax não usam `AbortController`/timeout; dependem do limite da Edge Function.

### 1.5 Config (Supabase)
- `verify_jwt = false` em process-payment, appmax-webhook, appmax-healthcheck, appmax-get-app-token, appmax-authorize (intencional: webhooks e fluxo de pagamento/conexão).

---

## 2. Yampi

### 2.1 Pontos de entrada
- **checkout-create-session**: monta sessão de checkout; se provider Yampi, cria link de pagamento e retorna `redirect_url` + `session_id`.
- **yampi-webhook**: eventos de pagamento/pedido (approved, paid, cancelled, shipped, delivered).

### 2.2 Segurança e validação
| Aspecto | Implementação |
|---------|----------------|
| Webhook Yampi | `YAMPI_WEBHOOK_SECRET` em variável de ambiente; validação via query string (`?token=`). Rejeita com 401 se ausente ou inválido; 500 se secret não configurado. |
| checkout-create-session | Sem autenticação obrigatória (público). Valida `items` (existência, estoque). Credenciais Yampi vêm de `integrations_checkout_providers` (alias, user_token, user_secret_key). |

### 2.3 Regras de negócio
- **checkout-create-session**: valida variantes e estoque; registra `abandoned_carts` com `session_id` e UTM; se Yampi, opcionalmente sincroniza SKUs (preço/estoque) quando `sync_enabled`; monta `linkSkus` com `yampi_sku_id`; tenta `/checkout/payment-link` e depois `/payments/links`; envia `metadata.session_id` para o webhook poder vincular o pedido; em erro, insere em `integrations_checkout_test_logs` e fallback para `/checkout` se configurado.
- **yampi-webhook**: idempotência por `external_reference` (yampi order id) — se pedido já existe, retorna 200 com `duplicate: true`; cria `orders` com `checkout_session_id`; cria `order_items` e debita estoque (`decrement_stock` + `inventory_movements`); preenche UTMs a partir de `abandoned_carts` por `session_id`; upsert em `customers`; insere `payments` e `email_automation_logs`; eventos shipped/delivered atualizam status e tracking; eventos cancelled atualizam status e devolvem estoque (release/refund).

### 2.4 Resiliência
- **checkout-create-session**: duas URLs de criação de link (payment-link e payments/links); em 404 tenta a próxima; sem retry explícito; sem timeout nas chamadas à API Yampi.
- **yampi-webhook**: sem retry; responde sempre 200 com corpo JSON (evita reenvio cego pela Yampi); idempotência evita duplicar pedido.

### 2.5 Borda crítica (checkout-create-session)
- Se alguma variante não tiver `yampi_sku_id`, o array `linkSkus` pode conter `id: undefined`; a API Yampi pode falhar ou criar link incorreto. O código não valida que todos os itens tenham `yampi_sku_id` antes de chamar a Yampi. **Sugestão**: validar que todo `item.variant_id` tenha variante com `yampi_sku_id` quando provider for Yampi; caso contrário, retornar erro claro ou fallback para checkout nativo.

---

## 3. Bling

### 3.1 Pontos de entrada
- **bling-webhook**: recebe callbacks do Bling (estoque, produto, etc.) e modo cron (`?action=cron_stock_sync` ou body `action: "cron_stock_sync"`).
- **bling-sync**, **bling-sync-single-stock**: sincronização sob demanda (admin).

### 3.2 Segurança e validação
| Aspecto | Implementação |
|---------|----------------|
| Webhook Bling | Quando `X-Bling-Signature-256` (ou `x-bling-signature-256`) está presente, valida HMAC-SHA256 com `store_settings.bling_client_secret`. Rejeita com 401 se inválido. Se o header não for enviado, não valida (comportamento legado). |
| Cron | Acionado por query ou body; não há autenticação adicional (qualquer um que conheça a URL pode disparar). Recomendação: proteger com secret em query ou usar Supabase cron com env. |
| Token | Token OAuth em `store_settings`; refresh automático quando expira (margem 5 min). |

### 3.3 Regras de negócio
- **Config**: `bling_sync_config` define o que sincronizar (sync_stock, sync_titles, sync_prices, etc.). Após primeira importação, por padrão só estoque é sincronizado; título/preço etc. só se toggles ativos.
- **Idempotência**: tabela `bling_webhook_events` com `event_id` único; inserção falha com 23505 (duplicata) → evento ignorado.
- **Produto**: produto inativo no site é ignorado (não atualiza estoque/título). Produto excluído no Bling → `is_active = false` no site (único caso em que o webhook altera is_active).
- **Estoque**: atualização por `bling_variant_id` ou fallback por SKU (busca no Bling e vincula `bling_variant_id`). Respeita `sync_stock` da config.

### 3.4 Resiliência
- **batchStockSync**: lotes de 50 IDs; `sleep(350)` entre lotes para evitar throttling.
- **syncSingleProduct**: usa `getConfigAwareUpdateFields`; nunca altera `is_active` exceto no caso “produto deletado no Bling”.
- **Sem timeout**: chamadas `fetch` ao Bling sem timeout explícito.

---

## 4. Resumo de achados

### 4.1 Pontos positivos
- Appmax: rate limit, validação de valor (tolerância 1%), rollback de estoque em falha, webhook com secret, token em cache criptografado, retry em 429/5xx.
- Yampi: webhook com secret em query; idempotência por external_reference; UTMs e customers preenchidos; cancelamento devolve estoque.
- Bling: HMAC quando secret configurado; idempotência por event_id; config por toggles; produto inativo ignorado; único toque em is_active é “deletado no Bling”.

### 4.2 Melhorias sugeridas (prioridade)

| Prioridade | Integração | Achado | Status |
|------------|------------|--------|--------|
| P1 | Yampi (checkout-create-session) | Variantes sem `yampi_sku_id` podem gerar link inválido | **Implementado**: validação de `yampi_sku_id` em todos os itens; se faltar, fallback para `/checkout` (se configurado) ou 400 com mensagem clara. |
| P2 | Todas | Chamadas HTTP externas sem timeout | Pendente: usar `AbortController` + timeout (ex.: 25–30 s) nas chamadas externas. |
| P2 | Bling (cron) | Cron stock sync sem autenticação | **Implementado**: se `BLING_CRON_SECRET` estiver definido nas env da Edge, exige `?secret=` ou `body.secret` igual; se não estiver definido, o cron segue aberto (retrocompat). |
| P3 | Yampi webhook | Resposta sempre 200 | Mantido de propósito; opcional: logar corpo em falha. |

**Uso do cron Bling com secret**: Defina `BLING_CRON_SECRET` nas variáveis da função (Supabase Dashboard → Edge Functions → bling-webhook → Secrets). Invoque com `?action=cron_stock_sync&secret=SEU_SECRET` ou `POST` com body `{ "action": "cron_stock_sync", "secret": "SEU_SECRET" }`.

### 4.3 Variáveis de ambiente (bordas)

- **Appmax**: `APPMAX_CLIENT_ID`, `APPMAX_CLIENT_SECRET` (fallback), `APPMAX_WEBHOOK_SECRET`, `APP_ENC_KEY` (32 bytes base64).
- **Yampi**: `YAMPI_WEBHOOK_SECRET` (obrigatório no webhook).
- **Bling**: credenciais em `store_settings`; webhook opcionalmente validado com `bling_client_secret` (HMAC).

Documentação de onde configurar o token/secret do webhook Yampi (painel Yampi + variável no Supabase) já foi feita em passo anterior.

---

## 5. Conclusão

As integrações estão consistentes com o desenho atual: validação de valor e estoque no process-payment, idempotência nos webhooks, segredos para webhooks Appmax/Yampi e HMAC para Bling quando configurado. As melhorias sugeridas são principalmente: validação de `yampi_sku_id` no checkout Yampi (P1), timeouts nas chamadas externas (P2) e proteção do endpoint de cron do Bling (P2).
