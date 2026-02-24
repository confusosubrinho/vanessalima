# Análise: imagens de produtos e API Yampi (URL inválida)

## O que a documentação oficial da Yampi exige

- **Endpoint:** `POST /{alias}/catalog/skus/{skuId}/images`
- **Corpo:** `{ "images": [ { "url": "<URL pública da imagem>" } ], "upload_option": "resize" }`
- **Schema (OpenAPI):** o campo `url` é obrigatório, tipo `string`, **format: uri**.
- **Texto da doc:** "A imagem pode ser enviada via **URL pública** ou upload direto."

Ou seja: a Yampi espera uma **URL pública** e um **URI válido** (absoluto, com protocolo).

## Por que a Yampi pode devolver "URL inválida"

1. **URL inacessível**  
   A Yampi provavelmente faz um GET na URL para baixar a imagem. Se o servidor responder 403 (bucket privado), 404, redirecionamento para login ou qualquer 4xx/5xx, ela considera a URL inválida.

2. **URL não pública (assinada/expirada)**  
   Se no banco estiver salva uma URL **assinada** do Supabase, mesmo trocando o path de `sign` para `public`, a URL só funciona se o bucket for público. O bucket `product-media` no projeto está público; a conversão no código já remove query params de assinatura.

3. **Formato de URI**  
   O schema pede `format: uri` (URL absoluta, com protocolo). URLs relativas ou malformadas podem ser rejeitadas.

4. **Protocolo HTTPS**  
   Muitas APIs só aceitam `https`. Se for enviado `http://`, a Yampi pode recusar.

5. **Formato da imagem (ex.: WebP)**  
   A documentação não lista formatos. Se o processador da Yampi não suportar WebP ao baixar por URL, pode falhar. O código já tenta fallback para .jpg quando existe; se só houver .webp, essa URL é enviada e pode ser recusada.

6. **Outras origens**  
   Imagens de integrações (ex.: Bling) podem ter sido salvas com URL externa quebrada ou signed expirada, gerando "URL inválida" quando a Yampi tenta baixar.

## O que o projeto faz hoje

- **yampi-sync-images:** lê `product_images.url`, ignora se não começa com `http`, converte signed→public, tenta fallback WebP→JPG, envia `{ images: [{ url }], upload_option: "resize" }`.
- **Bucket product-media:** público; URLs com `getPublicUrl()` são acessíveis sem auth.

## Ajustes recomendados

1. **Validar a URL antes de enviar** – Fazer HEAD na URL; se não retornar 200, não enviar e logar "URL inacessível".
2. **Garantir HTTPS** – Reescrever `http` para `https` quando for o mesmo host (ex.: Supabase).
3. **Manter apenas URLs públicas no banco** – Evitar gravar URLs signed; preferir sempre `getPublicUrl()` ou equivalente.
4. **Preferir JPG/PNG para a Yampi** – Usar fallback .webp→.jpg quando existir; se a Yampi continuar rejeitando WebP, considerar conversão antes do sync.

## Referências

- [Criar imagens de um SKU – Yampi](https://docs.yampi.com.br/api-reference/catalogo/imagens/criar-imagens-de-um-sku)
- Código: `supabase/functions/yampi-sync-images/index.ts`
