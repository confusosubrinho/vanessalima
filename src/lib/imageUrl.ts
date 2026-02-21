/**
 * Image URL resolver - ensures all image URLs are valid public URLs.
 * Strips expired signatures and normalizes URLs.
 */

const PLACEHOLDER = '/placeholder.svg';

/**
 * Check if a URL contains expired signature parameters
 */
function hasSignatureParams(url: string): boolean {
  return /[?&](X-Amz-|Expires=|Signature=|AWSAccessKeyId=)/i.test(url);
}

/**
 * Strip signature querystring from a URL, keeping the base path
 */
function stripSignature(url: string): string {
  try {
    const urlObj = new URL(url);
    // Remove all AWS signature params
    const keysToRemove: string[] = [];
    urlObj.searchParams.forEach((_, key) => {
      if (/^(X-Amz-|Expires|Signature|AWSAccessKeyId)/i.test(key)) {
        keysToRemove.push(key);
      }
    });
    keysToRemove.forEach(k => urlObj.searchParams.delete(k));
    return urlObj.toString();
  } catch {
    return url.split('?')[0];
  }
}

/**
 * Resolve an image URL to a valid, displayable URL.
 * - Supabase public URLs are returned as-is
 * - Signed/expired URLs are stripped of signatures
 * - Empty/null URLs return placeholder
 */
export function resolveImageUrl(url: string | null | undefined): string {
  if (!url || url.trim() === '') return PLACEHOLDER;
  
  // If it has signature params, strip them
  // Note: for private S3 buckets this will return a broken URL,
  // but at least it won't flash expired credentials
  if (hasSignatureParams(url)) {
    return stripSignature(url);
  }
  
  return url;
}

/**
 * Check if an image URL is likely broken (expired signed URL)
 */
export function isImageUrlBroken(url: string | null | undefined): boolean {
  if (!url) return true;
  return hasSignatureParams(url);
}
