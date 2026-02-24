import DOMPurify from 'dompurify';

const DEFAULT_ALLOWED_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'a', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'span', 'div',
  'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'details', 'summary', 'hr',
];

/**
 * Sanitiza HTML para evitar XSS em conteúdo administrável (descrição de produto,
 * páginas institucionais, selos). Permite tags seguras de rich text.
 */
export function sanitizeHtml(html: string): string {
  if (typeof html !== 'string' || !html.trim()) return '';
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: DEFAULT_ALLOWED_TAGS,
    ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'class'],
    ADD_ATTR: ['target', 'rel'],
  });
}
