# Erro: "Failed to send a request to the Edge Function"

Quando aparece **"Não foi possível conectar ao servidor de pagamento"** com **Detalhes: Failed to send a request to the Edge Function**, em geral é um destes dois motivos:

1. **CORS** – O domínio do seu site não está permitido nas Edge Functions.
2. **Função não deployada** – A função `checkout-router` não está publicada no projeto Supabase que a URL do front usa.

---

## Passo a passo para corrigir

### 1. Confirmar projeto e deploy

- A **VITE_SUPABASE_URL** do seu front deve ser do mesmo projeto em que as funções estão deployadas (ex.: `https://xxxxx.supabase.co`).
- No **Supabase Dashboard** → **Edge Functions**: confira se **checkout-router** aparece na lista e está deployada.
- Se não estiver, no terminal (na pasta do projeto):

  ```bash
  supabase login
  supabase link --project-ref SEU_PROJECT_REF
  supabase functions deploy checkout-router
  supabase functions deploy checkout-create-session
  ```

  (Substitua `SEU_PROJECT_REF` pelo ID do projeto no Supabase.)

### 2. Liberar CORS para o seu site

O navegador só aceita a resposta da Edge Function se o domínio do site estiver permitido (CORS).

- No **Supabase** → **Project Settings** → **Edge Functions** → **Secrets** (ou na configuração da função):
  - Adicione um secret com o nome: **CORS_ALLOWED_ORIGINS**
  - Valor: a **URL exata** do seu site, sem barra no final, por exemplo:
    - `https://seu-app.lovable.app`
    - `https://seu-dominio.com`
    - Ou várias origens separadas por vírgula: `https://site.com,https://www.site.com`

- **Para testar rápido (menos seguro):** use o valor **`*`** em `CORS_ALLOWED_ORIGINS`. Isso permite qualquer origem. Depois que funcionar, troque para a URL exata do seu site.

- **Importante:** depois de alterar os Secrets, as funções que usam CORS precisam ser deployadas de novo (ou o Supabase pode aplicar na próxima invocação, conforme a plataforma).

### 3. Conferir variáveis no ambiente do front

No lugar onde o site está publicado (Lovable, Vercel, Netlify, etc.):

- **VITE_SUPABASE_URL** = URL do projeto (ex.: `https://xxxxx.supabase.co`)
- **VITE_SUPABASE_PUBLISHABLE_KEY** = chave anônima (anon/public) do projeto

Sem isso, o front chama o projeto errado ou sem autenticação e o erro pode aparecer como "Failed to send a request to the Edge Function".

---

## Resumo

| Problema | Solução |
|----------|---------|
| CORS | Definir **CORS_ALLOWED_ORIGINS** no Supabase com a URL do site (ou `*` para teste). |
| Função não deployada | Rodar `supabase functions deploy checkout-router` (e `checkout-create-session` se usar). |
| URL/chave erradas | Ajustar **VITE_SUPABASE_URL** e **VITE_SUPABASE_PUBLISHABLE_KEY** no ambiente de publicação do front. |

Depois de alterar Secrets ou variáveis, faça um novo deploy do front e, se precisar, redeploy das funções.
