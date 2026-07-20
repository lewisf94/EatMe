import { useEffect, useRef, useState } from "react";
import { BarcodeDetector, GROCERY_FORMATS } from "./detector";

function cameraErrorMessage(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Camera permission was denied. You can still type the barcode number.";
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return "No camera found on this device.";
  if (name === "NotReadableError") return "The camera is already in use by another app.";
  return "Couldn't start the camera. Type the number instead.";
}

/** Full-screen camera overlay that calls onDetected with the first plausible
 *  grocery barcode, then tears the stream down. */
export function BarcodeScanner({
  onDetected,
  onClose,
}: {
  onDetected: (value: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const detector = new BarcodeDetector({ formats: [...GROCERY_FORMATS] });
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let done = false;

    const stop = () => {
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
    };

    const scan = async () => {
      if (done) return;
      const video = videoRef.current;
      if (video && video.readyState >= 2) {
        try {
          const codes = await detector.detect(video);
          const hit = codes.find((c) => /^\d{8,14}$/.test(c.rawValue));
          if (hit) {
            done = true;
            stop();
            onDetected(hit.rawValue);
            return;
          }
        } catch {
          // transient decode failures between frames are expected — keep going
        }
      }
      timer = setTimeout(() => void scan(), 150);
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (done) {
          stop();
          return;
        }
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        void scan();
      } catch (e) {
        setError(cameraErrorMessage(e));
      }
    })();

    return () => {
      done = true;
      stop();
    };
  }, [onDetected]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black" data-testid="scanner">
      <div className="flex items-center justify-between p-4 text-white">
        <span className="font-medium">Point at a barcode</span>
        <button onClick={onClose} className="rounded-lg bg-white/20 px-3 py-1">
          Close
        </button>
      </div>
      {error ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-white">
          <div>
            <p className="mb-4">{error}</p>
            <button onClick={onClose} className="rounded-lg bg-white/20 px-4 py-2">
              Enter the number instead
            </button>
          </div>
        </div>
      ) : (
        <div className="relative min-h-0 flex-1">
          <video ref={videoRef} className="h-full w-full object-cover" autoPlay playsInline muted />
          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-lg border-2 border-white/80" />
        </div>
      )}
    </div>
  );
}
