import fs from 'fs';

export interface GlbValidationResult {
  isValid: boolean;
  error?: string;
  version?: number;
  totalLength?: number;
}

// GLB Header magic constant: 0x46546C67 ("glTF" in ASCII little-endian)
const GLB_MAGIC = 0x46546c67;

/**
 * Validates binary GLB file signature and header structure
 */
export const validateGlbBuffer = (buffer: Buffer): GlbValidationResult => {
  if (buffer.length < 12) {
    return {
      isValid: false,
      error: 'File is too small to be a valid binary GLB (minimum header is 12 bytes)',
    };
  }

  // Read magic (first 4 bytes little-endian)
  const magic = buffer.readUInt32LE(0);
  if (magic !== GLB_MAGIC) {
    // Also check ASCII string representation
    const magicStr = buffer.subarray(0, 4).toString('ascii');
    return {
      isValid: false,
      error: `Invalid GLB file signature. Expected 'glTF' (0x46546C67), received '${magicStr}'`,
    };
  }

  const version = buffer.readUInt32LE(4);
  const totalLength = buffer.readUInt32LE(8);

  if (version !== 2) {
    return {
      isValid: false,
      error: `Unsupported glTF version ${version}. Only glTF 2.0 binary containers are supported.`,
      version,
    };
  }

  if (totalLength > buffer.length) {
    return {
      isValid: false,
      error: `Incomplete GLB file: header specifies ${totalLength} bytes, but file contains ${buffer.length} bytes`,
      version,
      totalLength,
    };
  }

  return {
    isValid: true,
    version,
    totalLength,
  };
};

/**
 * Validates a GLB file stored on disk by reading its header
 */
export const validateGlbFileOnDisk = async (
  filePath: string
): Promise<GlbValidationResult> => {
  try {
    const handle = await fs.promises.open(filePath, 'r');
    const headerBuffer = Buffer.alloc(12);
    await handle.read(headerBuffer, 0, 12, 0);
    await handle.close();

    const stat = await fs.promises.stat(filePath);

    const magic = headerBuffer.readUInt32LE(0);
    if (magic !== GLB_MAGIC) {
      const magicStr = headerBuffer.subarray(0, 4).toString('ascii');
      return {
        isValid: false,
        error: `Invalid GLB file signature. Expected 'glTF', received '${magicStr}'`,
      };
    }

    const version = headerBuffer.readUInt32LE(4);
    const totalLength = headerBuffer.readUInt32LE(8);

    if (version !== 2) {
      return {
        isValid: false,
        error: `Unsupported glTF version ${version}. Only glTF 2.0 is supported.`,
      };
    }

    if (totalLength > stat.size) {
      return {
        isValid: false,
        error: `Incomplete GLB file on disk: header says ${totalLength} bytes, disk size is ${stat.size} bytes`,
      };
    }

    return { isValid: true, version, totalLength };
  } catch (err: any) {
    return {
      isValid: false,
      error: `Failed to read file for GLB validation: ${err?.message || err}`,
    };
  }
};

