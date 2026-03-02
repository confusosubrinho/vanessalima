import { describe, it, expect, vi } from 'vitest';

// Mocking dependencies as they would behave
const createMockDeps = (delay = 100) => {
  const compressImageToWebP = vi.fn().mockImplementation(async (file: File) => {
    await new Promise(resolve => setTimeout(resolve, delay));
    return { file, fileName: `webp-${file.name}` };
  });

  const upload = vi.fn().mockImplementation(async () => {
    await new Promise(resolve => setTimeout(resolve, delay));
    return { error: null };
  });

  const getPublicUrl = vi.fn().mockImplementation((fileName: string) => {
    return { data: { publicUrl: `https://supabase.com/${fileName}` } };
  });

  const supabase = {
    storage: {
      from: vi.fn().mockReturnThis(),
      upload,
      getPublicUrl,
    },
  };

  return { compressImageToWebP, supabase };
};

// This replicates the CURRENT sequential logic
async function currentSequentialUpload(files: File[], deps: any) {
  const newMedia = [];
  const mediaLength = 0;
  for (const file of Array.from(files)) {
    const isVideo = file.type.startsWith('video/');
    const { file: processedFile, fileName } = await deps.compressImageToWebP(file);

    const { error: uploadError } = await deps.supabase.storage
      .from('product-media')
      .upload(fileName, processedFile);

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = deps.supabase.storage
      .from('product-media')
      .getPublicUrl(fileName);

    newMedia.push({
      id: `temp-${Date.now()}-${Math.random()}`,
      url: publicUrl,
      alt_text: null,
      display_order: mediaLength + newMedia.length,
      is_primary: mediaLength === 0 && newMedia.length === 0,
      media_type: isVideo ? 'video' : 'image',
    });
  }
  return newMedia;
}

// This replicates the OPTIMIZED concurrent logic
async function optimizedConcurrentUpload(files: File[], deps: any) {
  const mediaLength = 0;
  const uploadPromises = Array.from(files).map(async (file, index) => {
    const isVideo = file.type.startsWith('video/');
    const { file: processedFile, fileName } = await deps.compressImageToWebP(file);

    const { error: uploadError } = await deps.supabase.storage
      .from('product-media')
      .upload(fileName, processedFile);

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = deps.supabase.storage
      .from('product-media')
      .getPublicUrl(fileName);

    return {
      id: `temp-${Date.now()}-${Math.random()}-${index}`, // Added index to ensure uniqueness in same-ms calls
      url: publicUrl,
      alt_text: null,
      display_order: mediaLength + index,
      is_primary: mediaLength === 0 && index === 0,
      media_type: isVideo ? 'video' : 'image',
    };
  });

  return Promise.all(uploadPromises);
}

describe('Upload Performance Baseline', () => {
  const files = [
    new File([''], 'file1.jpg', { type: 'image/jpeg' }),
    new File([''], 'file2.jpg', { type: 'image/jpeg' }),
    new File([''], 'file3.jpg', { type: 'image/jpeg' }),
  ];

  it('measures sequential upload time (baseline)', async () => {
    const deps = createMockDeps(50); // 50ms delay per operation
    const start = Date.now();
    const result = await currentSequentialUpload(files, deps);
    const end = Date.now();
    const duration = end - start;

    console.log(`Baseline (Sequential) took: ${duration}ms`);
    expect(result).toHaveLength(3);
    expect(result[0].display_order).toBe(0);
    expect(result[1].display_order).toBe(1);
    expect(result[2].display_order).toBe(2);
    expect(result[0].is_primary).toBe(true);
    expect(result[1].is_primary).toBe(false);

    // With 3 files, each having compress (50ms) and upload (50ms), total should be around 3 * 100 = 300ms
    expect(duration).toBeGreaterThanOrEqual(300);
  });

  it('measures concurrent upload time (optimized preview)', async () => {
    const deps = createMockDeps(50);
    const start = Date.now();
    const result = await optimizedConcurrentUpload(files, deps);
    const end = Date.now();
    const duration = end - start;

    console.log(`Optimized (Concurrent) took: ${duration}ms`);
    expect(result).toHaveLength(3);
    expect(result[0].display_order).toBe(0);
    expect(result[1].display_order).toBe(1);
    expect(result[2].display_order).toBe(2);
    expect(result[0].is_primary).toBe(true);
    expect(result[1].is_primary).toBe(false);

    // With concurrency, it should be around 100ms (max of any single file's operations)
    expect(duration).toBeLessThan(200);
  });
});
