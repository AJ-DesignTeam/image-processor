import UPNG from 'upng-js';

export interface ImageConfig {
  quality: number; // 0-1 (mapped from 10-100%)
  scale: number; // 0.1-2.0 (mapped from 10-200%)
  format: 'original' | 'image/jpeg' | 'image/png' | 'image/png-lossy';
}

export interface ProcessedImage {
  blob: Blob;
  width: number;
  height: number;
  size: number;
  previewUrl: string;
}

// Helper to load image
export const loadImage = (file: File): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
};

// Helper to check for transparency
export const hasTransparency = (ctx: CanvasRenderingContext2D, width: number, height: number): boolean => {
  const imageData = ctx.getImageData(0, 0, width, height).data;
  // Sample pixels for performance on large images
  const totalPixels = width * height;
  let step = 1;
  if (totalPixels > 2000000) step = 16;
  else if (totalPixels > 500000) step = 8;
  else if (totalPixels > 100000) step = 4;

  for (let i = 3; i < imageData.length; i += 4 * step) {
    if (imageData[i] < 255) return true;
  }
  return false;
};

export const processImage = async (
  file: File,
  config: ImageConfig
): Promise<ProcessedImage> => {
  const img = await loadImage(file);
  const originalWidth = img.width;
  const originalHeight = img.height;

  // Calculate new dimensions
  const targetWidth = Math.max(1, Math.round(originalWidth * config.scale));
  const targetHeight = Math.max(1, Math.round(originalHeight * config.scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');

  if (!ctx) throw new Error('Could not get canvas context');

  // Draw image with scaling
  // For JPEG, fill background with white to handle transparency
  if (config.format === 'image/jpeg') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
  }
  
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  // Determine output format
  let outputFormat = config.format;
  if (outputFormat === 'original') {
    outputFormat = file.type as any;
    // Fallback for unsupported types to PNG
    if (!['image/jpeg', 'image/png'].includes(outputFormat)) {
      outputFormat = 'image/png';
    }
  }

  let blob: Blob;

  if (outputFormat === 'image/png-lossy') {
    // UPNG processing
    const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
    // Map quality (0-1) to colors (0-256)
    // 10-20%: 8 colors
    // 20-40%: 16 colors
    // 40-60%: 32 colors
    // 60-80%: 64 colors
    // 80-95%: 128 colors
    // 95-100%: 256 colors
    let cnum = 256;
    const q = config.quality;
    if (q <= 0.2) cnum = 8;
    else if (q <= 0.4) cnum = 16;
    else if (q <= 0.6) cnum = 32;
    else if (q <= 0.8) cnum = 64;
    else if (q <= 0.95) cnum = 128;
    
    const pngBuffer = UPNG.encode([imageData.data.buffer], targetWidth, targetHeight, cnum);
    blob = new Blob([pngBuffer], { type: 'image/png' });
  } else {
    // Standard Canvas export
    // Note: quality parameter only works for image/jpeg and image/webp
    const quality = outputFormat === 'image/jpeg' ? config.quality : undefined;
    
    blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (b) resolve(b);
          else reject(new Error('Canvas toBlob failed'));
        },
        outputFormat === 'image/png' ? 'image/png' : outputFormat, // Ensure correct type string
        quality
      );
    });
  }

  const previewUrl = URL.createObjectURL(blob);

  // Cleanup original object URL
  URL.revokeObjectURL(img.src);

  return {
    blob,
    width: targetWidth,
    height: targetHeight,
    size: blob.size,
    previewUrl,
  };
};
