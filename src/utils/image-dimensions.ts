import fs from 'fs';

export interface ImageDimensions {
  width: number;
  height: number;
  mimeType: string;
}

export interface ImageSignatureValidationResult {
  isValid: boolean;
  mimeType?: string;
  error?: string;
}

/**
 * Validates file magic bytes signature to strictly verify genuine PNG or JPEG contents
 * and prevent file masquerading attacks (e.g. PHP/HTML/Shell scripts renamed as .png).
 */
export function validateImageSignature(filePathOrBuffer: string | Buffer): ImageSignatureValidationResult {
  try {
    let buffer: Buffer;

    if (Buffer.isBuffer(filePathOrBuffer)) {
      buffer = filePathOrBuffer;
    } else {
      buffer = fs.readFileSync(filePathOrBuffer);
    }

    // 1. Check PNG signature: 89 50 4E 47 0D 0A 1A 0A
    if (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      return { isValid: true, mimeType: 'image/png' };
    }

    // 2. Check JPEG signature: FF D8 FF
    if (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    ) {
      return { isValid: true, mimeType: 'image/jpeg' };
    }

    // 3. Check SVG signature: text-based XML / SVG format
    const textContent = buffer.toString('utf8');
    const trimmed = textContent.trimStart();
    if (trimmed.startsWith('<svg') || trimmed.startsWith('<?xml')) {
      if (
        /<script/i.test(textContent) ||
        /javascript:/i.test(textContent) ||
        /onload\s*=/i.test(textContent) ||
        /onerror\s*=/i.test(textContent) ||
        /onclick\s*=/i.test(textContent) ||
        /<foreignObject/i.test(textContent)
      ) {
        return { isValid: false, error: 'Berkas SVG mengandung skrip atau objek tidak aman demi keamanan.' };
      }
      return { isValid: true, mimeType: 'image/svg+xml' };
    }

    return {
      isValid: false,
      error:
        "Tanda tangan berkas (magic bytes) tidak valid. Berkas bukan gambar raster PNG, JPEG, atau vektor SVG yang sah.",
    };
  } catch (err: any) {
    return {
      isValid: false,
      error: `Gagal membaca berkas untuk validasi signature: ${err.message}`,
    };
  }
}

/**
 * Extracts natural image dimensions (width, height) directly from PNG or JPEG file buffers
 * after strictly validating magic bytes signatures.
 */
export function getImageDimensions(filePath: string): ImageDimensions {
  const sigValidation = validateImageSignature(filePath);
  if (!sigValidation.isValid) {
    throw new Error(sigValidation.error || 'Invalid image file signature.');
  }

  const buffer = fs.readFileSync(filePath);

  // 1. Parse PNG dimensions
  if (
    buffer.length >= 24 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { width, height, mimeType: 'image/png' };
  }

  // 2. Parse JPEG dimensions
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset++;
        continue;
      }

      const marker = buffer[offset + 1];
      // SOF markers: SOF0 (0xC0) through SOF3 (0xC3), SOF5-SOF7, SOF9-SOF11, SOF13-SOF15
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        const height = buffer.readUInt16BE(offset + 5);
        const width = buffer.readUInt16BE(offset + 7);
        return { width, height, mimeType: 'image/jpeg' };
      }

      const segmentLength = buffer.readUInt16BE(offset + 2);
      offset += 2 + segmentLength;
    }
  }

  // 3. Parse SVG dimensions
  if (sigValidation.mimeType === 'image/svg+xml') {
    const content = buffer.toString('utf8');
    const vbMatch = content.match(/viewBox=["']\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s*["']/i);
    if (vbMatch) {
      const w = parseFloat(vbMatch[3]);
      const h = parseFloat(vbMatch[4]);
      if (w > 0 && h > 0) return { width: Math.round(w), height: Math.round(h), mimeType: 'image/svg+xml' };
    }
    const wMatch = content.match(/width=["']([\d.-]+)(?:px)?["']/i);
    const hMatch = content.match(/height=["']([\d.-]+)(?:px)?["']/i);
    if (wMatch && hMatch) {
      const w = parseFloat(wMatch[1]);
      const h = parseFloat(hMatch[1]);
      if (w > 0 && h > 0) return { width: Math.round(w), height: Math.round(h), mimeType: 'image/svg+xml' };
    }
    return { width: 1600, height: 1000, mimeType: 'image/svg+xml' };
  }

  // Fallback defaults if header parsing could not find dimensions
  return { width: 1600, height: 1000, mimeType: sigValidation.mimeType || 'image/jpeg' };
}

