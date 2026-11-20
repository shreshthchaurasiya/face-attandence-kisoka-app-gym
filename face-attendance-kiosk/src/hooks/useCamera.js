import { useEffect, useRef, useState } from 'react';

/**
 * Hook that manages the camera stream lifecycle.
 * Returns videoRef, stream state, error message, and isReady flag.
 *
 * @param {boolean} active - Whether the camera should be active
 * @param {'user'|'environment'} facingMode - Camera direction
 */
export function useCamera(active = true, facingMode = 'user') {
  const videoRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null);

  // 1. Get the camera stream
  useEffect(() => {
    if (!active) return;

    let cancelled = false;

    async function startCamera() {
      setIsReady(false);
      setError(null);

      // Check if mediaDevices is supported (requires HTTPS on mobile browsers)
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setError(
          'Camera access requires HTTPS on mobile devices. Please open via https:// or run as an Android APK.'
        );
        return;
      }

      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode,
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });

        if (cancelled) {
          mediaStream.getTracks().forEach((t) => t.stop());
          return;
        }

        setStream(mediaStream);
      } catch (err) {
        if (cancelled) return;

        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setError('Camera permission denied. Please allow camera access in your browser/device settings.');
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          setError('No camera found. Please connect a camera and try again.');
        } else if (err.name === 'NotReadableError') {
          setError('Camera is in use by another app. Please close other camera apps and retry.');
        } else {
          setError(`Camera error: ${err.message}`);
        }
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      setStream((prevStream) => {
        if (prevStream) {
          prevStream.getTracks().forEach((t) => t.stop());
        }
        return null;
      });
      setIsReady(false);
    };
  }, [active, facingMode]);

  // 2. Attach the stream to the video element and ensure it plays
  useEffect(() => {
    if (!stream || !videoRef.current) return;

    const videoElement = videoRef.current;
    videoElement.srcObject = stream;

    const handleLoadedMetadata = () => {
      videoElement.play().catch((e) => console.warn('Autoplay prevented:', e));
      setIsReady(true);
    };

    videoElement.addEventListener('loadedmetadata', handleLoadedMetadata);

    const fallbackTimer = setTimeout(() => {
      videoElement.play().catch((e) => console.warn('Autoplay fallback prevented:', e));
      setIsReady(true);
    }, 1200);

    return () => {
      videoElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
      clearTimeout(fallbackTimer);
    };
  }, [stream]);

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
      setIsReady(false);
    }
  }

  return { videoRef, stream, isReady, error, stopCamera };
}
