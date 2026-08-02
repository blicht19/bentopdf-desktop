import { WasmProvider } from './wasm-provider.js';
import type {
  PyMuPDFInstance,
  PyMuPDFCompressOptions,
  PyMuPDFExtractTextOptions,
  PyMuPDFRasterizeOptions,
} from '@/types';

let cachedPyMuPDF: PyMuPDFInstance | null = null;
let loadPromise: Promise<PyMuPDFInstance> | null = null;

export interface PyMuPDFInterface {
  load(): Promise<void>;
  compressPdf(
    file: Blob,
    options: PyMuPDFCompressOptions
  ): Promise<{ blob: Blob; compressedSize: number }>;
  convertToPdf(file: Blob, ext: string): Promise<Blob>;
  extractText(file: Blob, options?: PyMuPDFExtractTextOptions): Promise<string>;
  extractImages(file: Blob): Promise<Array<{ data: Uint8Array; ext: string }>>;
  extractTables(file: Blob): Promise<unknown[]>;
  toSvg(file: Blob, pageNum: number): Promise<string>;
  renderPageToImage(file: Blob, pageNum: number, scale: number): Promise<Blob>;
  getPageCount(file: Blob): Promise<number>;
  rasterizePdf(
    file: Blob | File,
    options: PyMuPDFRasterizeOptions
  ): Promise<Blob>;
}

export async function loadPyMuPDF(): Promise<PyMuPDFInstance> {
  if (cachedPyMuPDF) {
    return cachedPyMuPDF;
  }

  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = (async () => {
    if (!WasmProvider.isConfigured('pymupdf')) {
      throw new Error(
        'PyMuPDF is not configured. Please configure it in Advanced Settings.'
      );
    }
    if (!WasmProvider.isConfigured('ghostscript')) {
      throw new Error(
        'Ghostscript is not configured. PyMuPDF requires Ghostscript for some operations. Please configure both in Advanced Settings.'
      );
    }

    const pymupdfUrl = WasmProvider.getUrl('pymupdf')!;
    const gsUrl = WasmProvider.getUrl('ghostscript')!;
    const normalizedPymupdf = pymupdfUrl.endsWith('/')
      ? pymupdfUrl
      : `${pymupdfUrl}/`;

    const wrapperUrl = `${normalizedPymupdf}dist/index.js`;
    const response = await fetch(wrapperUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch pymupdf: HTTP ${response.status}`);
    }

    const jsText = await response.text();
    const blob = new Blob([jsText], { type: 'application/javascript' });
    const blobUrl = URL.createObjectURL(blob);
    try {
      const module = await import(/* @vite-ignore */ blobUrl);
      if (typeof module.PyMuPDF !== 'function') {
        throw new Error(
          'PyMuPDF module did not export expected PyMuPDF class.'
        );
      }

      cachedPyMuPDF = new module.PyMuPDF({
        assetPath: `${normalizedPymupdf}assets/`,
        ghostscriptUrl: gsUrl,
      });

      await cachedPyMuPDF.load();

      console.log('[PyMuPDF Loader] Successfully loaded from CDN');
      return cachedPyMuPDF;
    } catch (error: unknown) {
      loadPromise = null;
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load PyMuPDF from CDN: ${msg}`, {
        cause: error,
      });
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  })();

  return loadPromise;
}

export function isPyMuPDFAvailable(): boolean {
  return (
    WasmProvider.isConfigured('pymupdf') &&
    WasmProvider.isConfigured('ghostscript')
  );
}

export function clearPyMuPDFCache(): void {
  cachedPyMuPDF = null;
  loadPromise = null;
}
