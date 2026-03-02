# Checkout Settings (PR8 — Source of Truth)

## Visão geral

A tabela `public.checkout_settings` é a **fonte canônica** da configuração de checkout: provider ativo, canal (internal/external), experiência (transparent/native). Uma única linha (singleton). Alterações são registradas em `public.checkout_settings_audit`.

## Esquema

### checkout_settings (singleton)

| Campo            | Tipo      | Obrigatório | Descrição |
|------------------|-----------|-------------|-----------|
| id               | uuid      | sim         | Fixo `00000000-0000-0000-0000-000000000001` |
| enabled          | boolean   | sim         | Checkout ativo |
| active_provider  | text      | sim         | `stripe` \| `yampi` \| `appmax` |
| channel          | text      | sim         | `internal` (na loja) \| `external` (redirect) |
| experience       | text      | sim         | `transparent` (form na página) \| `native` (página do provider) |
| environment      | text      | sim         | `sandbox` \| `production` |
| config_version   | integer   | sim         | Versão da config (default 1) |
| updated_at       | timestamptz | sim       | Última atualização |
| updated_by       | uuid      | não         | Referência a auth.users |
| notes            | text      | não         | Observações |

Constraint de singleton: índice único em `(true)` — só pode existir uma linha.

### checkout_settings_audit

Registro de cada alteração: `settings_id`, `changed_at`, `changed_by`, `old_value`, `new_value` (jsonb), `change_reason`, `request_id`. Apenas leitura por admin; inserção via edge function (service role) ou policy admin.

## Regras de validação (update-checkout-settings)

- **Yampi:** `channel` deve ser `external`. Rejeitar `internal`.
- **Appmax:** não suporta `channel` `external`. Rejeitar.
- **Stripe:** permite `internal` e `external`. Se `channel = external`, `experience` deve ser `native`.
- **internal:** provider não pode ser `yampi`.

## Uso

- **Leitura:** qualquer cliente (anon/authenticated) pode fazer `SELECT` para o front resolver fluxo.
- **Escrita:** apenas admin, via edge function **update-checkout-settings** (POST com Bearer JWT de admin).

Body da edge:

```json
{
  "active_provider": "stripe",
  "channel": "internal",
  "experience": "transparent",
  "environment": "production",
  "notes": "opcional",
  "change_reason": "opcional",
  "request_id": "opcional"
}
```

Resposta de sucesso: `{ "success": true, "settings": { ... } }`. Erro de validação: `400` com `error` descritivo.

## Resolve (checkout-create-session)

O action `resolve` usa primeiro a tabela `checkout_settings`. Se existir linha, retorna `provider`, `channel`, `experience` e `flow` (derivado: `flow = channel === 'external' ? 'gateway' : 'transparent'`). Se a tabela não existir ou estiver vazia, usa fallback para `integrations_checkout` + `integrations_checkout_providers` (comportamento anterior).

## Admin UI

A tela **Checkout & Pagamentos** lê `checkout_settings` para status (gateway, canal, experiência). Ao ativar/desativar Stripe ou Yampi, ou ao alterar o modo de checkout Stripe (embedded/external), a aplicação chama **update-checkout-settings** para manter a tabela canônica sincronizada.

## Mapeamento antigo → novo

| Antigo | Novo |
|--------|------|
| flow "transparent" | channel internal |
| flow "gateway" | channel external |
| checkout_mode "embedded" | channel internal, experience transparent |
| checkout_mode "external" | channel external, experience native |
| provider stripe/yampi/appmax | active_provider |

Ver `docs/PR8_PR9_AUDIT_ESTADO_ATUAL.md` para detalhes.
