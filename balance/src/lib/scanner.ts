// Camera barcode scanning. Uses the browser's built-in detector where it
// exists and falls back to a bundled JavaScript decoder everywhere else.
import { isBarcode } from './off';

export interface Scanner {
  stop(): void;
}

interface NativeDetector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
interface NativeDetectorCtor {
  new (options: { formats: string[] }): NativeDetector;
  getSupportedFormats(): Promise<string[]>;
}

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

async function nativeDetector(): Promise<NativeDetector | null> {
  const Ctor = (window as unknown as { BarcodeDetector?: NativeDetectorCtor }).BarcodeDetector;
  if (!Ctor) return null;
  try {
    const supported = await Ctor.getSupportedFormats();
    const formats = FORMATS.filter((f) => supported.includes(f));
    return formats.includes('ean_13') ? new Ctor({ formats }) : null;
  } catch {
    return null;
  }
}

/**
 * Starts the rear camera in `video` and calls `onCode` for each product
 * barcode seen. Rejects when the camera cannot be opened.
 */
export async function startScanner(video: HTMLVideoElement, onCode: (code: string) => void): Promise<Scanner> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera is not available');
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });

  let stopped = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let controls: { stop(): void } | undefined;
  const stop = () => {
    stopped = true;
    if (timer) clearInterval(timer);
    controls?.stop();
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  };

  try {
    const native = await nativeDetector();
    if (native) {
      video.srcObject = stream;
      await video.play();
      let busy = false;
      timer = setInterval(async () => {
        if (busy || stopped || video.readyState < 2) return;
        busy = true;
        try {
          const codes = await native.detect(video);
          const hit = codes.find((c) => isBarcode(c.rawValue));
          if (hit && !stopped) onCode(hit.rawValue);
        } catch {
          // A failed frame is not an error; the next one is tried.
        }
        busy = false;
      }, 250);
    } else {
      const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
        import('@zxing/browser'),
        import('@zxing/library'),
      ]);
      const hints = new Map<unknown, unknown>();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]);
      hints.set(DecodeHintType.TRY_HARDER, true);
      const reader = new BrowserMultiFormatReader(hints as Map<never, unknown>, { delayBetweenScanAttempts: 200 });
      controls = await reader.decodeFromStream(stream, video, (result) => {
        if (!result || stopped) return;
        const text = result.getText();
        if (isBarcode(text)) onCode(text);
      });
    }
  } catch (e) {
    stop();
    throw e;
  }
  return { stop };
}
