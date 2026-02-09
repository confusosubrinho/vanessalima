/**
 * Compresses an image file to WebP format at 75% quality.
 * Appends dimensions to filename if not already present.
 * Videos are returned as-is.
 */
export async function compressImageToWebP(file: File): Promise<{ file: File; fileName: string }> {
  // Skip non-image files (videos, etc.)
  if (!file.type.startsWith('image/')) {
    const ext = file.name.split('.').pop() || '';
    const baseName = file.name.replace(`.${ext}`, '');
    const fileName = `${baseName}-${Date.now()}.${ext}`;
    return { file, fileName };
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to compress image'));
              return;
            }

            const w = img.naturalWidth;
            const h = img.naturalHeight;
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
          0.75
        );
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}
