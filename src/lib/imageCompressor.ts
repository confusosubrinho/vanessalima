/**
 * Compresses an image file to WebP format with resize.
 * Max dimension: 1600px (configurable).
 * Appends dimensions to filename if not already present.
 * Videos are returned as-is.
 */

const MAX_DIMENSION = 1600;
const QUALITY = 0.8;
const THUMB_SIZE = 400;

/** Retorna as dimensões da imagem (width, height). */
export function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  if (!file.type.startsWith('image/')) {
    return Promise.resolve({ width: 0, height: 0 });
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => {
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error('Falha ao carregar imagem'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Falha ao ler arquivo'));
    reader.readAsDataURL(file);
  });
}

/** Opções para processamento de imagem de banner */
export interface ProcessBannerImageOptions {
  /** Redimensionar para caber em width x height (ex: 1920x600). Não redimensiona se não informado. */
  maxWidth?: number;
  maxHeight?: number;
  /** Qualidade de compressão 0–1 (ex: 0.8 = 80%). */
  quality: number;
  /** Converter para WebP. Se false, mantém JPEG/PNG com compressão. */
  convertToWebP: boolean;
}

/**
 * Processa imagem de banner: opcionalmente redimensiona (caber em maxWidth×maxHeight),
 * comprime com a qualidade indicada e opcionalmente converte para WebP.
 */
export async function processBannerImage(
  file: File,
  options: ProcessBannerImageOptions
): Promise<{ file: File; fileName: string }> {
  if (!file.type.startsWith('image/')) {
    const ext = file.name.split('.').pop() || '';
    const baseName = file.name.replace(`.${ext}`, '');
    const fileName = `${baseName}-${Date.now()}.${ext}`;
    return { file, fileName };
  }

  const { maxWidth, maxHeight, quality, convertToWebP } = options;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.onload = () => {
        let w = img.naturalWidth;
        let h = img.naturalHeight;

        if (maxWidth != null && maxHeight != null && (w > maxWidth || h > maxHeight)) {
          const scale = Math.min(maxWidth / w, maxHeight / h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0, w, h);

        const mimeType = convertToWebP ? 'image/webp' : (file.type === 'image/png' ? 'image/png' : 'image/jpeg');
        const extension = convertToWebP ? 'webp' : (file.type === 'image/png' ? 'png' : 'jpg');

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to process image'));
              return;
            }

            const originalName = file.name.replace(/\.[^/.]+$/, '');
            const dimensionPattern = /\d+x\d+/;
            const hasDimension = dimensionPattern.test(originalName);
            const baseName = hasDimension ? originalName : `${originalName}-${w}x${h}`;
            const fileName = `${baseName}-${Date.now()}.${extension}`;
            const processedFile = new File([blob], fileName, { type: mimeType });

            resolve({ file: processedFile, fileName });
          },
          mimeType,
          convertToWebP ? quality : Math.max(0.7, quality)
        );
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export async function compressImageToWebP(
  file: File,
  options?: { maxDimension?: number; quality?: number }
): Promise<{ file: File; fileName: string }> {
  // Skip non-image files (videos, etc.)
  if (!file.type.startsWith('image/')) {
    const ext = file.name.split('.').pop() || '';
    const baseName = file.name.replace(`.${ext}`, '');
    const fileName = `${baseName}-${Date.now()}.${ext}`;
    return { file, fileName };
  }

  const maxDim = options?.maxDimension ?? MAX_DIMENSION;
  const quality = options?.quality ?? QUALITY;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.onload = () => {
        let w = img.naturalWidth;
        let h = img.naturalHeight;

        // Resize if exceeds max dimension
        if (w > maxDim || h > maxDim) {
          if (w >= h) {
            h = Math.round((h / w) * maxDim);
            w = maxDim;
          } else {
            w = Math.round((w / h) * maxDim);
            h = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0, w, h);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to compress image'));
              return;
            }

            const dimensionPattern = /\d+x\d+/;
            const originalName = file.name.replace(/\.[^/.]+$/, '');
            const hasDimension = dimensionPattern.test(originalName);

            const baseName = hasDimension
              ? originalName
              : `${originalName}-${w}x${h}`;

            const fileName = `${baseName}-${Date.now()}.webp`;
            const compressedFile = new File([blob], fileName, { type: 'image/webp' });

            resolve({ file: compressedFile, fileName });
          },
          'image/webp',
          quality
        );
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Compress an image to a 100×100 square avatar (center crop, WebP).
 */
export async function compressToAvatar(
  file: File
): Promise<{ file: File; fileName: string }> {
  if (!file.type.startsWith('image/')) {
    return { file, fileName: file.name };
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.onload = () => {
        const size = 100;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas context error')); return; }

        const srcSize = Math.min(img.naturalWidth, img.naturalHeight);
        const srcX = (img.naturalWidth - srcSize) / 2;
        const srcY = (img.naturalHeight - srcSize) / 2;

        ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, size, size);

        canvas.toBlob((blob) => {
          if (!blob) { reject(new Error('Compression failed')); return; }
          const fileName = `testimonials/avatar-${Date.now()}.webp`;
          const compressedFile = new File([blob], fileName, { type: 'image/webp' });
          resolve({ file: compressedFile, fileName });
        }, 'image/webp', 0.75);
      };
      img.onerror = () => reject(new Error('Image load error'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('File read error'));
    reader.readAsDataURL(file);
  });
}

/**
 * Generate a thumbnail version of an image (400px max).
 */
export async function generateThumbnail(
  file: File
): Promise<{ file: File; fileName: string } | null> {
  if (!file.type.startsWith('image/')) return null;

  return compressImageToWebP(file, {
    maxDimension: THUMB_SIZE,
    quality: 0.7,
  }).then(({ file: thumbFile, fileName }) => {
    const thumbName = fileName.replace('.webp', '-thumb.webp');
    const renamedFile = new File([thumbFile], thumbName, { type: 'image/webp' });
    return { file: renamedFile, fileName: thumbName };
  });
}
