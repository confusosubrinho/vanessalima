# Supabase: o que fazer para as alterações Yampi

## Sincronização com o Supabase

- A **chave secreta do webhook** pode ser configurada no **admin do site** (Checkout → Yampi → **Configurar** → campo **Chave secreta do webhook**). Ela é salva na tabela `integrations_checkout_providers`, coluna `config` (JSONB), chave `webhook_secret`.
- A Edge Function **yampi-webhook** lê essa chave direto do banco (prioridade). Se não houver chave no config, usa a variável de ambiente `YAMPI_WEBHOOK_SECRET` (Secrets da função no Supabase).
- Ou seja: tudo que você configura no admin (URL do webhook, chave secreta, copiar URL) fica salvo no Supabase (banco) e a função usa esses dados. Não é obrigatório configurar a chave nas Secrets do Supabase se você usar o campo no admin.

---

## 1. Deploy das Edge Functions

As correções (pedido único por sessão, status correto) estão nas funções **checkout-router** e **yampi-webhook**. É preciso fazer o deploy no projeto Supabase que a loja usa.

### No terminal (na pasta do projeto)

```bash
# 1) Login (uma vez)
supabase login

# 2) Link ao projeto (se ainda não linkou)
supabase link --project-ref SEU_PROJECT_REF

# 3) Deploy das duas funções
supabase functions deploy checkout-router
supabase functions deploy yampi-webhook
```

Ou pelo **Dashboard Supabase**: Edge Functions → selecionar cada função → Deploy (se o deploy for feito via Git, basta o push no repositório que estiver conectado).

### Variáveis de ambiente / Secrets

- **yampi-webhook:**
  - **Recomendado:** configurar a chave no **admin do site** (Checkout → Yampi → Configurar → Chave secreta do webhook). A função lê de `integrations_checkout_providers.config.webhook_secret`; **não é obrigatório** definir secret no Supabase.
  - **Opcional (fallback):** se quiser usar variável de ambiente, em Settings → Edge Functions → yampi-webhook → Secrets adicione `YAMPI_WEBHOOK_SECRET` com o mesmo valor que você usa na URL do webhook (`?token=...`). A função só usa esse valor se não houver `webhook_secret` no config do provider no banco.
- **checkout-router:** usa só `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` (já definidos pelo Supabase).

Nenhuma migração de banco foi adicionada: a coluna `checkout_session_id` já existe em `orders`; o campo `webhook_secret` fica dentro do JSONB `config` de `integrations_checkout_providers`.

---

## 2. Cadastrar o webhook na Yampi (para o seu site)

Se ainda não existe webhook apontando para o seu site, configure assim:

### Passo 1 – Token / chave secreta

**Opção A – Pelo admin do site (recomendado, fica tudo sincronizado no Supabase)**

1. No **admin**: Checkout → integração **Yampi** → **Configurar**.
2. No modal, preencha o campo **Chave secreta do webhook** com um segredo forte (ex.: string longa aleatória). Exemplo em PowerShell: `[System.Guid]::NewGuid().ToString("N") + [System.Guid]::NewGuid().ToString("N")`.
3. Clique em **Salvar**. O valor é gravado em `integrations_checkout_providers.config.webhook_secret` no Supabase.
4. Na mesma tela (bloco **Webhook Yampi**) use **Copiar URL** para copiar a URL completa com `?token=...` e use essa URL na Yampi.

**Opção B – Pelo Supabase (fallback)**

- **Se a Yampi mostrar ou pedir uma chave secreta** ao criar o webhook: use essa mesma chave no Supabase e na URL.
- **Se a Yampi não pedir chave:** crie você mesmo um segredo forte (ex.: string longa aleatória).
- No **Supabase**: Project Settings → Edge Functions → **yampi-webhook** → Secrets. Adicione:
  - Nome: `YAMPI_WEBHOOK_SECRET`
  - Valor: a chave (a que a Yampi deu ou a que você criou).
- Guarde esse valor; você vai usá-lo na URL na Yampi (`?token=...`).

### Passo 2 – URL do webhook

A URL da função no Supabase tem este formato:

```
https://SEU_PROJECT_REF.supabase.co/functions/v1/yampi-webhook?token=SEU_SECRET
```

- Troque **SEU_PROJECT_REF** pelo ref do seu projeto (em Supabase: Settings → General → Reference ID).
- Troque **SEU_SECRET** pelo mesmo valor que você configurou:
  - **Se usou o admin:** é o valor do campo “Chave secreta do webhook” (você pode copiar a URL completa no bloco Webhook Yampi).
  - **Se usou só o Supabase:** é o valor de `YAMPI_WEBHOOK_SECRET`.

Exemplo (fictício):

```
https://abcdefghijklmn.supabase.co/functions/v1/yampi-webhook?token=abc123seu_token_longo_aqui
```

### Passo 3 – Cadastrar na Yampi

1. Na Yampi, vá em **Webhooks** (como na sua tela).
2. Clique em **"+ Novo webhook"**.
3. Preencha:
   - **Nome:** por exemplo `Meu site - pedidos e pagamentos`.
   - **URL:** a URL completa do passo 2 (com `?token=...`).
   - **Eventos:** marque pelo menos:
     - **Pedido pago** / **order.paid** (pagamento aprovado)
     - **Pagamento aprovado** / **payment.approved** (se existir)
     - **Pedido cancelado** / **order.cancelled**
     - **Pagamento recusado** / **payment.refused** (se existir)
     - **Status do pedido atualizado** / **order.status.updated** (recomendado)
     - **Pedido enviado** / **order.shipped** (ou equivalente)
     - **Pedido entregue** / **order.delivered** (se existir)
4. Salve.

O site usa esse webhook para criar/atualizar pedidos quando o pagamento é aprovado, quando o pedido é cancelado, enviado ou entregue. Sem esse webhook cadastrado para a URL do seu site, a Yampi não avisa o site e os pedidos não aparecem (ou não atualizam) corretamente.

### Chave secreta que a Yampi fornece

A Yampi pode pedir ou exibir uma **chave secreta** ao criar o webhook (usada para assinar as requisições com HMAC-SHA256). Configure assim:

1. **Use essa mesma chave em dois lugares (se não usar o admin):**
   - **No Supabase:** Edge Functions → **yampi-webhook** → Secrets → adicione (ou edite) o secret **`YAMPI_WEBHOOK_SECRET`** com o valor exato da chave que a Yampi mostrou ou que você definiu na Yampi.
   - **Na URL do webhook na Yampi:** a URL deve terminar com `?token=CHAVE`, onde **CHAVE** é esse mesmo valor. Exemplo:  
     `https://seu-projeto.supabase.co/functions/v1/yampi-webhook?token=chave_que_a_yampi_deu`

2. **Se usar o admin do site:** configure a chave em Checkout → Yampi → Configurar → Chave secreta do webhook e use o botão **Copiar URL** no bloco Webhook Yampi; a URL já virá com `?token=...`. A função lê a chave do banco (`integrations_checkout_providers.config.webhook_secret`), então não é obrigatório definir `YAMPI_WEBHOOK_SECRET` nas Secrets do Supabase.

Assim o site consegue validar que a requisição veio da Yampi (token na URL igual à chave configurada no admin ou em `YAMPI_WEBHOOK_SECRET`).

---

# Plano: Importar pedido da Yampi

Objetivo: permitir que um pedido aprovado na Yampi seja importado para o site (criar/atualizar `orders`, `order_items`, `payments`, estoque, etc.) para testes ou para recuperar um pedido apagado.

## Fase 1 – Pesquisa (feita)

- API Yampi: `GET /{alias}/orders` com filtros (ex.: `number`, `date`) e `include=items,customer,shipping_address,transactions`.
- Autenticação: mesma da loja – `User-Token` e `User-Secret-Key` (config Yampi em `integrations_checkout_providers`).
- Base URL: `https://api.dooki.com.br/v2/{alias}`.

## Fase 2 – Edge Function: `yampi-import-order`

**Objetivo:** dado o ID/número do pedido na Yampi, buscar na API e criar (ou atualizar) o pedido no Supabase.

**Entrada (POST body):**

- `yampi_order_id` ou `yampi_order_number` (string/number) – ID ou número do pedido na Yampi (ex.: `1491772375818422`).
- Opcional: `idempotency_key` – se o pedido já existir localmente com esse `external_reference`, apenas atualizar status/dados em vez de duplicar.

**Fluxo:**

1. Ler credenciais Yampi de `integrations_checkout_providers` (provider = `yampi`, ativo).
2. Chamar `GET https://api.dooki.com.br/v2/{alias}/orders?filters[number]={yampi_order_id}&include=items,customer,shipping_address,transactions` (ajustar filtro conforme doc Yampi – pode ser `id` ou `number`).
3. Se não retornar nenhum pedido, responder 404.
4. Pegar o primeiro pedido do array `data` e normalizar o payload para o mesmo formato que o **yampi-webhook** usa (customer, items, value_total, value_shipment, value_discount, shipping_address, transactions, etc.).
5. Reutilizar a lógica do webhook:
   - Verificar se já existe `orders.external_reference = yampi_order_id`. Se existir e `idempotency_key` disser para atualizar, atualizar status/dados; senão retornar “já existe”.
   - Se não existir: criar `orders`, `order_items`, débito de estoque (`inventory_movements` + `decrement_stock`), `payments`, e, se aplicável, atualizar `customers` e `abandoned_carts`.
6. Retornar `{ ok: true, order_id, order_number }` ou erro com mensagem clara.

**Segurança:**

- Chamar a função só com autenticação de admin (por exemplo Service Role ou um token de admin). Não expor publicamente sem checagem de permissão.

## Fase 3 – Interface no admin (opcional)

- Na tela de **Pedidos** (ou em Configurações de Checkout / Integrações):
  - Botão “Importar pedido da Yampi”.
  - Campo: “Número ou ID do pedido na Yampi”.
  - Ao enviar, chamar a Edge Function `yampi-import-order` e mostrar sucesso (com link para o pedido) ou erro (mensagem da API/validação).

## Fase 4 – Testes

1. Na Yampi: anotar um pedido com “Pagamento aprovado” (número/ID).
2. No site: usar “Importar pedido da Yampi” com esse número.
3. Verificar no admin: pedido criado com status “processing”, itens, valor, cliente e pagamento corretos; estoque debitado.
4. Caso o pedido já exista (mesmo `external_reference`): comportamento definido (só atualizar ou retornar “já existe”).

## Próximos passos sugeridos

1. Confirmar na documentação Yampi o filtro exato para um pedido (ex.: `filters[id]=` ou `filters[number]=`) e o shape de `data[0]` com `include=items,customer,...`.
2. Implementar a Edge Function `yampi-import-order` (reaproveitando tipos e lógica do `yampi-webhook`).
3. Proteger a função com checagem de admin (ex.: header ou JWT).
4. (Opcional) Adicionar o botão e o campo no admin para chamar a função e exibir o resultado.

Quando quiser, podemos descrever a assinatura exata da função (request/response) e o mapeamento campo a campo Yampi → `orders` / `order_items` / `payments` para você implementar ou para eu gerar o código da função.
