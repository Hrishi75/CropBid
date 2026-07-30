// =============================================================================
// processImages — batch failure must not leak stored images or raw files
// =============================================================================
// storeImage persists as the loop goes, so a five-file upload that fails on the
// third has already put two WebPs in Cloudinary. The error skips the controller,
// so no listing is ever created to reference them: they are orphans nothing will
// clean up, and repeating a [valid, invalid] pair leaks storage indefinitely.
//
// The raw multer files are a separate leak with the same shape — see the
// `finally` block in the middleware.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/imageStorage', () => ({
  storeImage: vi.fn(),
  removeImage: vi.fn(),
}));

vi.mock('../utils/imageSignature', () => ({
  detectImageFormatAtPath: vi.fn(),
}));

vi.mock('sharp', () => ({
  default: vi.fn(() => ({
    resize: () => ({ webp: () => ({ toBuffer: async () => Buffer.from('webp') }) }),
  })),
}));

import fs from 'fs';
import { processImages } from './upload';
import { removeImage, storeImage } from '../services/imageStorage';
import { detectImageFormatAtPath } from '../utils/imageSignature';

const mockStore = vi.mocked(storeImage);
const mockRemove = vi.mocked(removeImage);
const mockDetect = vi.mocked(detectImageFormatAtPath);

function reqWith(count: number) {
  return {
    files: Array.from({ length: count }, (_, i) => ({
      path: `/tmp/raw-${i}.bin`,
      filename: `raw-${i}.bin`,
    })),
  } as any;
}

// Minimal Response stand-in that can replay the 'finish' event, which is how the
// middleware learns whether a DOWNSTREAM handler accepted or rejected the request.
function resStub() {
  const handlers: Array<() => void> = [];
  return {
    statusCode: 200,
    on(event: string, cb: () => void) {
      if (event === 'finish') handlers.push(cb);
    },
    finish(status: number) {
      this.statusCode = status;
      handlers.forEach((h) => h());
    },
  } as any;
}

// The middleware unlinks real paths; keep that off the filesystem.
let unlinked: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  unlinked = [];
  vi.spyOn(fs, 'unlinkSync').mockImplementation(((p: string) => {
    unlinked.push(p);
  }) as any);
  mockDetect.mockReturnValue('png');
  mockStore.mockImplementation((async (_b: Buffer, _k: string, name: string) =>
    `https://cdn.test/${name}`) as any);
  mockRemove.mockResolvedValue(undefined);
});

describe('processImages rollback', () => {
  it('removes already-stored images when a later file fails validation', async () => {
    // Files 1 and 2 are valid and get stored; file 3 is not an image.
    mockDetect.mockReturnValueOnce('png').mockReturnValueOnce('png').mockReturnValueOnce(null);

    const req = reqWith(3);
    const err = await new Promise<any>((res) => processImages(req, {} as any, res));

    expect(err).toBeTruthy();
    expect(mockStore).toHaveBeenCalledTimes(2);
    // Both orphans-to-be are cleaned up, not left in Cloudinary.
    expect(mockRemove).toHaveBeenCalledTimes(2);
    expect(mockRemove).toHaveBeenCalledWith('https://cdn.test/raw-0.webp');
    expect(mockRemove).toHaveBeenCalledWith('https://cdn.test/raw-1.webp');
  });

  it('removes every raw file on failure, not just the ones already processed', async () => {
    mockDetect.mockReturnValueOnce('png').mockReturnValueOnce(null);

    const req = reqWith(3);
    await new Promise<any>((res) => processImages(req, {} as any, res));

    // All three raw uploads go, including the two the loop never reached.
    // Leaving them was the disk-exhaustion path.
    expect(unlinked).toEqual(['/tmp/raw-0.bin', '/tmp/raw-1.bin', '/tmp/raw-2.bin']);
  });

  it('does NOT remove stored images on success', async () => {
    const req = reqWith(2);
    // Needs a real Response stub: the success path now registers a 'finish'
    // listener to catch downstream rejections.
    const err = await new Promise<any>((done) => processImages(req, resStub(), done));

    expect(err).toBeUndefined();
    expect(mockStore).toHaveBeenCalledTimes(2);
    expect(mockRemove).not.toHaveBeenCalled();
    expect(req.processedImages).toHaveLength(2);
    // Raw files still cleaned up — the finally block runs on success too.
    expect(unlinked).toHaveLength(2);
  });

  it('still surfaces the original error if rollback itself fails', async () => {
    // A failing cleanup must not mask the error the client needs to see.
    mockDetect.mockReturnValueOnce('png').mockReturnValueOnce(null);
    mockRemove.mockRejectedValue(new Error('cloudinary unreachable'));

    const req = reqWith(2);
    const err = await new Promise<any>((res) => processImages(req, {} as any, res));

    expect(err).toBeTruthy();
    expect(err.message).not.toContain('cloudinary unreachable');
  });
});

// Once next() is called this middleware is finished, so its catch block cannot
// help with a controller that rejects afterwards — unknown listing, wrong owner,
// already at the image cap. Those requests stored images that nothing will ever
// reference.
describe('processImages downstream rollback', () => {
  it('removes stored images when the controller rejects the request', async () => {
    const req = reqWith(2);
    const res = resStub();
    await new Promise<any>((done) => processImages(req, res, done));

    expect(mockStore).toHaveBeenCalledTimes(2);
    expect(mockRemove).not.toHaveBeenCalled(); // nothing yet — still in flight

    res.finish(403); // controller rejected: not the listing's owner

    expect(mockRemove).toHaveBeenCalledTimes(2);
  });

  it('keeps stored images when the controller succeeds', async () => {
    const req = reqWith(2);
    const res = resStub();
    await new Promise<any>((done) => processImages(req, res, done));

    res.finish(201); // listing created, images now referenced

    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('rolls back on a 500 as well as a 4xx', async () => {
    const req = reqWith(1);
    const res = resStub();
    await new Promise<any>((done) => processImages(req, res, done));

    res.finish(500);

    expect(mockRemove).toHaveBeenCalledTimes(1);
  });
});
