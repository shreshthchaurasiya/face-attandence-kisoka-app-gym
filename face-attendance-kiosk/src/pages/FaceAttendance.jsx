import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import * as faceapi from 'face-api.js';
import { useFaceApi } from '../hooks/useFaceApi';
import { useCamera } from '../hooks/useCamera';
import FaceBox from '../components/FaceBox';
import StatusOverlay from '../components/StatusOverlay';
import LoadingScreen from '../components/LoadingScreen';
import { findBestMatch, isValidDescriptor } from '../utils/faceUtils';
import { getLocalDateString } from '../utils/dateUtils';
import {
  FACE_API_INPUT_SIZE,
  VOICE_ENABLED,
  VOICE_LANGUAGE,
  VOICE_RATE,
  VOICE_PITCH,
  VOICE_VOLUME,
} from '../utils/constants';
import { getProfiles, markAttendance } from '../services/api';
import './FaceAttendance.css';

const MATCH_THRESHOLD = 0.5;
const COOLDOWN_MS = 6000;
const SUCCESS_DISPLAY_TIME_MS = 4500; // Keep screen visible for 4.5 seconds

export default function FaceAttendance() {
  const navigate = useNavigate();
  const { modelsLoaded, loadingProgress, error: modelError } = useFaceApi();

  // Mode: 'check_in' | 'check_out'
  const [kioskMode, setKioskMode] = useState('check_in');

  // Camera state
  const [cameraActive, setCameraActive] = useState(false);
  const { videoRef, isReady, error: cameraError, stopCamera } = useCamera(cameraActive);

  // Descriptors cache
  const [cachedDescriptors, setCachedDescriptors] = useState([]);
  const [descriptorsLoading, setDescriptorsLoading] = useState(true);
  const [descriptorsError, setDescriptorsError] = useState(null);
  const [descriptorCount, setDescriptorCount] = useState(0);

  // Detection & Kiosk state
  const [detection, setDetection] = useState(null);
  const [boxColor, setBoxColor] = useState('red');
  const [matchedMember, setMatchedMember] = useState(null);
  const [attendanceStatus, setAttendanceStatus] = useState('idle'); // idle | checking | checked_in | checked_out | already_in | already_out | not_checked_in | no_match | multi_face | locked
  const [statusMessage, setStatusMessage] = useState('Position your face in front of camera...');
  const [attendanceEvent, setAttendanceEvent] = useState(null);

  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const cooldownMap = useRef(new Map());
  const todayAttendanceSet = useRef(new Set());
  const freezeRef = useRef(false);
  const isBusyRef = useRef(false);
  const lastNotFoundVoiceRef = useRef(0);

  // Robust Voice speech synthesis (does NOT interrupt success voice!)
  const speakMessage = useCallback((message, isUrgent = false) => {
    if (!VOICE_ENABLED || !window.speechSynthesis) return;

    // If an attendance success voice is speaking, do not cut it off
    if (freezeRef.current && !isUrgent) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.rate = VOICE_RATE;
    utterance.pitch = VOICE_PITCH;
    utterance.volume = VOICE_VOLUME;

    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      const preferredVoice =
        voices.find((v) => v.lang === VOICE_LANGUAGE) ||
        voices.find((v) => v.lang.startsWith('en'));
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }
    }

    window.speechSynthesis.speak(utterance);
  }, []);

  // Audio chimes
  const playSuccessChime = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1000, ctx.currentTime + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45);
      osc.stop(ctx.currentTime + 0.45);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const playBuzzerSound = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc.stop(ctx.currentTime + 0.25);
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Start camera after models load
  useEffect(() => {
    if (modelsLoaded && !modelError) {
      setCameraActive(true);
    }
  }, [modelsLoaded, modelError]);

  // Load registered staff descriptors
  const loadDescriptors = useCallback(async () => {
    setDescriptorsLoading(true);
    setDescriptorsError(null);
    try {
      const profiles = await getProfiles({
        type: 'staff',
        registeredOnly: true,
        includeDescriptor: true,
      });

      const descriptors = [];
      let skipped = 0;

      profiles.forEach((p) => {
        let desc = p.face_descriptor;
        if (typeof desc === 'string') {
          try {
            desc = JSON.parse(desc);
          } catch {
            desc = null;
          }
        }
        if (!desc || !isValidDescriptor(desc)) {
          skipped++;
          return;
        }
        descriptors.push({
          member: {
            id: p.id,
            name: p.name,
            role: p.role,
            profile_code: p.profile_code,
            phone: p.phone,
            status: p.status,
          },
          descriptor: desc,
        });
      });

      setCachedDescriptors(descriptors);
      setDescriptorCount(descriptors.length);
    } catch (err) {
      console.error('[FaceAttendance] Load descriptors failed:', err);
      setDescriptorsError(`Failed to load face data: ${err.message}`);
    } finally {
      setDescriptorsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDescriptors();
  }, [loadDescriptors]);

  // Canvas size listener
  useEffect(() => {
    if (isReady && videoRef.current) {
      const updateSize = () => {
        const rect = videoRef.current?.getBoundingClientRect();
        if (rect) setDimensions({ width: rect.width, height: rect.height });
      };
      updateSize();
      window.addEventListener('resize', updateSize);
      return () => window.removeEventListener('resize', updateSize);
    }
  }, [isReady, videoRef]);

  // Main Face Attendance Scanning Loop
  useEffect(() => {
    if (!isReady || !modelsLoaded || descriptorsLoading || !cameraActive) return;
    if (cachedDescriptors.length === 0) {
      setStatusMessage('No enrolled staff faces found. Please register staff first.');
      return;
    }

    const options = new faceapi.TinyFaceDetectorOptions({
      inputSize: FACE_API_INPUT_SIZE,
      scoreThreshold: 0.5,
    });

    let isProcessing = false;
    let animationFrameId;
    let isActive = true;

    async function detectLoop() {
      if (!isActive) return;

      // When frozen (showing success card and speaking), DO NOT SCAN ANYTHING
      if (freezeRef.current || isBusyRef.current) {
        animationFrameId = requestAnimationFrame(detectLoop);
        return;
      }

      if (!isProcessing && videoRef.current && videoRef.current.readyState >= 2) {
        isProcessing = true;
        try {
          const allDetections = await faceapi.detectAllFaces(videoRef.current, options);

          if (!isActive || freezeRef.current) return;

          if (allDetections.length === 0) {
            setDetection(null);
            setBoxColor('red');
            setMatchedMember(null);
            setAttendanceStatus('idle');
            setStatusMessage(
              kioskMode === 'check_in'
                ? '🟢 Check-In Mode: Look at camera...'
                : '🔴 Check-Out Mode: Look at camera...'
            );
          } else if (allDetections.length > 1) {
            setDetection(null);
            setBoxColor('red');
            setMatchedMember(null);
            setAttendanceStatus('multi_face');
            setStatusMessage('Only one staff member at a time in frame');
          } else {
            // Single face detected
            const result = await faceapi
              .detectSingleFace(videoRef.current, options)
              .withFaceLandmarks()
              .withFaceDescriptor();

            if (!isActive || freezeRef.current) return;

            if (!result) {
              setDetection(null);
              setBoxColor('red');
              setMatchedMember(null);
              setAttendanceStatus('idle');
            } else {
              setDetection(result);
              setAttendanceStatus('checking');
              setStatusMessage('Recognizing face...');

              const match = findBestMatch(result.descriptor, cachedDescriptors, MATCH_THRESHOLD);

              if (!match) {
                setBoxColor('red');
                setMatchedMember(null);
                setAttendanceStatus('no_match');
                setStatusMessage('Face Not Recognized');

                const now = Date.now();
                if (now - lastNotFoundVoiceRef.current > 5000 && !freezeRef.current) {
                  speakMessage('Face not registered');
                  lastNotFoundVoiceRef.current = now;
                }
              } else {
                const { member } = match;
                const matchKey = `${kioskMode}_${member.id}_${getLocalDateString()}`;
                const lastSeen = cooldownMap.current.get(matchKey);

                if (lastSeen && Date.now() - lastSeen < COOLDOWN_MS) {
                  // In cooldown
                  setBoxColor('green');
                  setMatchedMember(member);
                } else {
                  // Lock immediately before async call!
                  isBusyRef.current = true;
                  freezeRef.current = true;
                  setBoxColor('green');
                  setMatchedMember(member);
                  cooldownMap.current.set(matchKey, Date.now() + 10000);

                  handleAttendanceAction(member);
                }
              }
            }
          }
        } catch (err) {
          console.error('[FaceAttendance] Loop error:', err);
        } finally {
          isProcessing = false;
        }
      }

      if (isActive) {
        animationFrameId = requestAnimationFrame(detectLoop);
      }
    }

    detectLoop();

    return () => {
      isActive = false;
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [isReady, modelsLoaded, descriptorsLoading, cachedDescriptors, cameraActive, kioskMode]);

  // Handle Attendance Action (Check-In or Check-Out)
  const handleAttendanceAction = useCallback(
    async (member) => {
      try {
        setAttendanceStatus('checking');
        const now = new Date();
        const formattedTime = now.toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        });

        // ================= CHECK-OUT LOGIC =================
        if (kioskMode === 'check_out') {
          setStatusMessage(`Checking out ${member.name}...`);
          const res = await markAttendance(member.id, 'check_out', 'face_kiosk');

          if (res && res.action === 'not_checked_in') {
            playBuzzerSound();
            speakMessage(`No check-in record found today for ${member.name}`, true);
            setAttendanceStatus('not_checked_in');
            setStatusMessage('No check-in record found for today!');

            setTimeout(() => {
              setAttendanceStatus('idle');
              setMatchedMember(null);
              setDetection(null);
              freezeRef.current = false;
              isBusyRef.current = false;
            }, 3500);
            return;
          }

          if (res && res.action === 'already_out') {
            speakMessage(`Already checked out today, ${member.name}`, true);
            setAttendanceStatus('already_out');
            setStatusMessage('Already Checked Out Today');

            setTimeout(() => {
              setAttendanceStatus('idle');
              setMatchedMember(null);
              setDetection(null);
              freezeRef.current = false;
              isBusyRef.current = false;
            }, 3200);
            return;
          }

          // Check-Out SUCCESS: Lock screen completely for 4.5 seconds
          playSuccessChime();
          speakMessage(`Check-out successful! Goodbye ${member.name}`, true);

          setAttendanceEvent({
            type: 'check_out',
            name: member.name,
            role: member.role || 'Staff',
            code: member.profile_code,
            time: formattedTime,
          });

          setAttendanceStatus('checked_out');
          setStatusMessage('Shift Check-Out Successful! ✓');

          // Keep success screen visible for 4.5 full seconds before releasing
          setTimeout(() => {
            setAttendanceStatus('idle');
            setAttendanceEvent(null);
            setMatchedMember(null);
            setDetection(null);
            freezeRef.current = false;
            isBusyRef.current = false;
          }, SUCCESS_DISPLAY_TIME_MS);
          return;
        }

        // ================= CHECK-IN LOGIC =================
        setStatusMessage(`Checking in ${member.name}...`);
        const duplicateKey = `${member.id}_${getLocalDateString()}`;

        if (todayAttendanceSet.current.has(duplicateKey)) {
          speakMessage(`Already checked in today, ${member.name}`, true);
          setAttendanceStatus('already_in');
          setStatusMessage('Already Checked In Today');

          setTimeout(() => {
            setAttendanceStatus('idle');
            setMatchedMember(null);
            setDetection(null);
            freezeRef.current = false;
            isBusyRef.current = false;
          }, 3200);
          return;
        }

        const res = await markAttendance(member.id, 'check_in', 'face_kiosk');

        if (res && res.action === 'already_in') {
          todayAttendanceSet.current.add(duplicateKey);
          speakMessage(`Already checked in today, ${member.name}`, true);
          setAttendanceStatus('already_in');
          setStatusMessage('Already Checked In Today');

          setTimeout(() => {
            setAttendanceStatus('idle');
            setMatchedMember(null);
            setDetection(null);
            freezeRef.current = false;
            isBusyRef.current = false;
          }, 3200);
          return;
        }

        // Check-In SUCCESS: Lock screen completely for 4.5 seconds
        todayAttendanceSet.current.add(duplicateKey);
        playSuccessChime();
        speakMessage(`Check-in successful! Welcome ${member.name}`, true);

        setAttendanceEvent({
          type: 'check_in',
          name: member.name,
          role: member.role || 'Staff',
          code: member.profile_code,
          time: formattedTime,
        });

        setAttendanceStatus('checked_in');
        setStatusMessage('Check-In Successful! ✓');

        // Keep success screen visible for 4.5 full seconds before releasing
        setTimeout(() => {
          setAttendanceStatus('idle');
          setAttendanceEvent(null);
          setMatchedMember(null);
          setDetection(null);
          freezeRef.current = false;
          isBusyRef.current = false;
        }, SUCCESS_DISPLAY_TIME_MS);
      } catch (err) {
        console.error('[Attendance] API error:', err);
        setAttendanceStatus('no_match');
        setStatusMessage(`Error: ${err.message}`);
        setTimeout(() => {
          setAttendanceStatus('idle');
          setMatchedMember(null);
          setDetection(null);
          freezeRef.current = false;
          isBusyRef.current = false;
        }, 3000);
      }
    },
    [kioskMode, playBuzzerSound, playSuccessChime, speakMessage]
  );

  const handleStopCamera = () => {
    stopCamera();
    setCameraActive(false);
    setDetection(null);
    setMatchedMember(null);
    setAttendanceStatus('idle');
    setStatusMessage('Camera stopped.');
  };

  const handleRefresh = () => {
    setDetection(null);
    setMatchedMember(null);
    setAttendanceStatus('idle');
    setStatusMessage('Refreshing staff data...');
    loadDescriptors();
  };

  if (!modelsLoaded && !modelError) {
    return <LoadingScreen icon="🐼" message={loadingProgress} />;
  }
  if (modelError) {
    return <LoadingScreen error={modelError} />;
  }

  return (
    <div className={`fa-page ${kioskMode === 'check_out' ? 'mode-checkout-active' : ''}`}>
      <div className="fa-camera-container">
        {cameraActive ? (
          <>
            <video
              ref={videoRef}
              className="fa-video"
              autoPlay
              playsInline
              muted
            />

            {/* Face Box */}
            {detection && !freezeRef.current && (
              <FaceBox
                detection={detection}
                color={kioskMode === 'check_out' ? '#f43f5e' : boxColor}
                status={attendanceStatus}
                videoElement={videoRef.current}
                width={dimensions.width}
                height={dimensions.height}
              />
            )}

            {/* Fixed Prominent Header Bar with Mode Switcher */}
            <div className="fa-top-nav">
              <button
                id="btn-fa-back"
                className="fa-top-btn"
                onClick={() => {
                  stopCamera();
                  navigate('/');
                }}
              >
                ← Home
              </button>

              {/* Big Prominent Check-In / Check-Out Toggle */}
              <div className="kiosk-mode-selector">
                <button
                  type="button"
                  className={`kiosk-tab-btn tab-in ${kioskMode === 'check_in' ? 'active' : ''}`}
                  onClick={() => {
                    if (freezeRef.current) return;
                    setKioskMode('check_in');
                    setStatusMessage('🟢 Check-In Mode Active');
                  }}
                >
                  <span className="tab-icon">🟢</span>
                  <span className="tab-text">CHECK-IN</span>
                </button>
                <button
                  type="button"
                  className={`kiosk-tab-btn tab-out ${kioskMode === 'check_out' ? 'active' : ''}`}
                  onClick={() => {
                    if (freezeRef.current) return;
                    setKioskMode('check_out');
                    setStatusMessage('🔴 Check-Out Mode Active');
                  }}
                >
                  <span className="tab-icon">🔴</span>
                  <span className="tab-text">CHECK-OUT</span>
                </button>
              </div>

              <button
                id="btn-fa-refresh"
                className="fa-top-btn"
                onClick={handleRefresh}
                title="Refresh staff faces"
              >
                🔄 {descriptorCount}
              </button>
            </div>

            {/* Big Overlay: Already Checked In */}
            {attendanceStatus === 'already_in' && (
              <div className="fa-big-overlay warning-overlay">
                <span className="big-icon">⏱️</span>
                <h1>Already Checked In</h1>
                <p>Check-in already logged today.</p>
              </div>
            )}

            {/* Big Overlay: Already Checked Out */}
            {attendanceStatus === 'already_out' && (
              <div className="fa-big-overlay warning-overlay">
                <span className="big-icon">🚪</span>
                <h1>Already Checked Out</h1>
                <p>Shift departure already logged today.</p>
              </div>
            )}

            {/* Big Overlay: Not Checked In Yet */}
            {attendanceStatus === 'not_checked_in' && (
              <div className="fa-big-overlay danger-overlay">
                <span className="big-icon">⚠️</span>
                <h1>No Check-In Record</h1>
                <p>Staff has not checked in today. Please check in first!</p>
              </div>
            )}

            {/* Big Overlay: Check-In Successful (Locks for 4.5 seconds) */}
            {attendanceStatus === 'checked_in' && attendanceEvent && (
              <div className="fa-big-overlay success-overlay restaurant-theme">
                <span className="big-icon">🐼</span>
                <h1 className="welcome-heading">Welcome to Panda Ka Dhaba!</h1>
                <div className="checked-member-card">
                  <div className="cm-name">{attendanceEvent.name}</div>
                  <div className="cm-meta">
                    <span className="cm-role">{attendanceEvent.role}</span>
                    <span className="cm-time">⏰ {attendanceEvent.time}</span>
                  </div>
                </div>
                <div className="cm-tag">🟢 Check-In Recorded ✓</div>
                <div className="hold-progress-bar">
                  <div className="hold-progress-fill" />
                </div>
              </div>
            )}

            {/* Big Overlay: Check-Out Successful (Locks for 4.5 seconds) */}
            {attendanceStatus === 'checked_out' && attendanceEvent && (
              <div className="fa-big-overlay success-overlay checkout-theme">
                <span className="big-icon">👋</span>
                <h1 className="welcome-heading checkout">Shift Check-Out Complete!</h1>
                <div className="checked-member-card checkout-card">
                  <div className="cm-name">{attendanceEvent.name}</div>
                  <div className="cm-meta">
                    <span className="cm-role">{attendanceEvent.role}</span>
                    <span className="cm-time out">⏰ {attendanceEvent.time}</span>
                  </div>
                </div>
                <div className="cm-tag out">🔴 Shift Departure Logged ✓ See You Tomorrow!</div>
                <div className="hold-progress-bar">
                  <div className="hold-progress-fill checkout-fill" />
                </div>
              </div>
            )}

            {/* Camera Error */}
            {cameraError && (
              <div className="fa-camera-error">
                <span className="fa-error-icon">📵</span>
                <h3>Camera Error</h3>
                <p>{cameraError}</p>
                <button className="fa-btn-secondary" onClick={() => navigate('/')}>
                  Go Back
                </button>
              </div>
            )}

            {/* Loading Faces */}
            {(!isReady || descriptorsLoading) && !cameraError && (
              <div className="fa-loading-overlay">
                <div className="spinner-ring" />
                <p>
                  {!isReady
                    ? 'Starting camera...'
                    : descriptorsLoading
                    ? `Loading ${descriptorCount} staff face profiles...`
                    : 'Ready...'}
                </p>
              </div>
            )}

            {/* Scan Guidelines */}
            {isReady && !descriptorsLoading && !cameraError && !descriptorsError && !freezeRef.current && (
              <div className="fa-scan-guide">
                <div className="scan-corner top-left" />
                <div className="scan-corner top-right" />
                <div className="scan-corner bottom-left" />
                <div className="scan-corner bottom-right" />
              </div>
            )}

            {/* Bottom Status Overlay */}
            <StatusOverlay
              member={matchedMember}
              status={attendanceStatus}
              statusMessage={statusMessage}
            />

            {/* Stop Camera Button */}
            <button
              id="btn-fa-stop"
              className="fa-stop-btn"
              onClick={handleStopCamera}
            >
              ⏹ Stop
            </button>
          </>
        ) : (
          /* Camera Stopped State */
          <div className="fa-stopped">
            <div className="stopped-icon">🐼</div>
            <h2 className="stopped-title">Kiosk Idle</h2>
            <p className="stopped-desc">
              Panda Ka Dhaba attendance terminal is paused. Tap below to resume.
            </p>
            <button
              id="btn-fa-resume"
              className="fa-btn-accent"
              onClick={() => {
                setCameraActive(true);
                setAttendanceStatus('idle');
                setStatusMessage('Point camera at face...');
              }}
            >
              ▶ Resume Face Kiosk
            </button>
            <button className="fa-btn-secondary" onClick={() => navigate('/')}>
              ← Go to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
