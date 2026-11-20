import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import * as faceapi from 'face-api.js';
import { useFaceApi } from '../hooks/useFaceApi';
import { useCamera } from '../hooks/useCamera';
import MemberSearch from '../components/MemberSearch';
import FaceBox from '../components/FaceBox';
import LoadingScreen from '../components/LoadingScreen';
import { FACE_API_INPUT_SIZE, STAFF_ROLES } from '../utils/constants';
import { getProfiles, createProfile, saveFaceDescriptor } from '../services/api';
import './NewMemberFace.css';

export default function NewMemberFace() {
  const navigate = useNavigate();
  const { modelsLoaded, loadingProgress, error: modelError } = useFaceApi();

  // Mode: 'add_new' | 'search_existing'
  const [mode, setMode] = useState('add_new');

  // New Staff Form
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    role: STAFF_ROLES[0],
  });

  // Existing Staff list
  const [existingProfiles, setExistingProfiles] = useState([]);
  const [dataLoading, setDataLoading] = useState(false);

  // Flow step: 'form' | 'camera' | 'detecting' | 'saving' | 'success' | 'error'
  const [step, setStep] = useState('form');
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [detection, setDetection] = useState(null);
  const [boxColor, setBoxColor] = useState('red');
  const [statusMsg, setStatusMsg] = useState('');
  const [pageError, setPageError] = useState(null);

  const cameraActive = step === 'camera' || step === 'detecting' || step === 'saving';
  const { videoRef, isReady, error: cameraError, stopCamera } = useCamera(cameraActive);

  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const videoContainerRef = useRef(null);

  // Load existing staff from API
  const loadStaff = async () => {
    setDataLoading(true);
    try {
      const data = await getProfiles({ type: 'staff' });
      setExistingProfiles(data);
    } catch (err) {
      console.error('Failed to load staff:', err);
    } finally {
      setDataLoading(false);
    }
  };

  useEffect(() => {
    loadStaff();
  }, []);

  // Update canvas dimensions
  useEffect(() => {
    if (isReady && videoRef.current) {
      const updateSize = () => {
        const rect = videoRef.current?.getBoundingClientRect();
        if (rect) {
          setDimensions({ width: rect.width, height: rect.height });
        }
      };
      updateSize();
      window.addEventListener('resize', updateSize);
      return () => window.removeEventListener('resize', updateSize);
    }
  }, [isReady, videoRef]);

  // Face Detection Loop
  useEffect(() => {
    if (!isReady || !modelsLoaded || step !== 'detecting') return;

    setStatusMsg('Position face inside the frame...');

    const options = new faceapi.TinyFaceDetectorOptions({
      inputSize: FACE_API_INPUT_SIZE,
      scoreThreshold: 0.5,
    });

    let isProcessing = false;
    let animationFrameId;
    let isActive = true;

    async function detectLoop() {
      if (!isActive) return;

      if (!isProcessing && videoRef.current && videoRef.current.readyState >= 2) {
        isProcessing = true;
        try {
          const allFaces = await faceapi.detectAllFaces(videoRef.current, options);

          if (!isActive) return;

          if (allFaces.length === 0) {
            setDetection(null);
            setBoxColor('red');
            setStatusMsg('No face detected. Center your face...');
          } else if (allFaces.length > 1) {
            setDetection(null);
            setBoxColor('red');
            setStatusMsg('Only one staff member at a time');
          } else {
            const result = await faceapi
              .detectSingleFace(videoRef.current, options)
              .withFaceLandmarks()
              .withFaceDescriptor();

            if (!isActive) return;

            if (result) {
              setDetection(result);
              setBoxColor('green');
              setStatusMsg('Face detected! Saving to Hostinger Database...');

              isActive = false;
              setStep('saving');
              handleSaveDescriptor(result.descriptor);
              return;
            }
          }
        } catch (err) {
          console.error('[FaceDetect] Error:', err);
          if (isActive) setStatusMsg('Detection error, retrying...');
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
  }, [isReady, modelsLoaded, step]);

  // Save Descriptor Handler
  async function handleSaveDescriptor(descriptor) {
    try {
      const descriptorArray = Array.from(descriptor);

      if (mode === 'add_new') {
        const created = await createProfile({
          name: formData.name,
          phone: formData.phone,
          type: 'staff',
          role: formData.role,
          face_descriptor: descriptorArray,
        });
        setSelectedProfile(created);
      } else if (selectedProfile) {
        await saveFaceDescriptor(selectedProfile.id, descriptorArray);
      }

      setStep('success');
      setBoxColor('green');
      setStatusMsg('Staff Face ID Saved Successfully!');
    } catch (err) {
      console.error('[SaveDescriptor] Error:', err);
      setPageError(`Failed to save face: ${err.message}`);
      setStep('error');
    }
  }

  const handleAddNewSubmit = (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert('Please enter staff name');
      return;
    }
    setStep('camera');
  };

  const handleSelectExisting = (profile) => {
    setSelectedProfile(profile);
    setStep('camera');
  };

  const handleStartDetection = () => {
    if (!modelsLoaded) {
      setStatusMsg('AI models are loading, please wait...');
      return;
    }
    setStep('detecting');
  };

  const handleBack = () => {
    stopCamera();
    if (step === 'form') {
      navigate('/');
    } else {
      setStep('form');
      setDetection(null);
      setBoxColor('red');
    }
  };

  if (!modelsLoaded && !modelError) {
    return <LoadingScreen icon="🐼" message={loadingProgress} />;
  }

  if (modelError) {
    return <LoadingScreen error={modelError} />;
  }

  return (
    <div className="nmf-page">
      {/* Header */}
      <header className="nmf-header">
        <button id="btn-nmf-back" className="header-back-btn" onClick={handleBack}>
          ← Back
        </button>
        <div className="nmf-header-text">
          <h1 className="nmf-title">
            {step === 'form' ? 'Staff Face ID' : 'Face Registration'}
          </h1>
          <p className="nmf-subtitle">Panda Ka Dhaba Staff</p>
        </div>
        <div className="nmf-model-badge">
          {modelsLoaded ? '✓ AI Ready' : '⏳ Loading'}
        </div>
      </header>

      {/* Step 1: Form & Staff List */}
      {step === 'form' && (
        <div className="nmf-content">
          <div className="mode-switch-container">
            <button
              className={`mode-switch-btn ${mode === 'add_new' ? 'active' : ''}`}
              onClick={() => setMode('add_new')}
            >
              ➕ Register New Staff
            </button>
            <button
              className={`mode-switch-btn ${mode === 'search_existing' ? 'active' : ''}`}
              onClick={() => {
                setMode('search_existing');
                loadStaff();
              }}
            >
              🔍 Existing Staff ({existingProfiles.length})
            </button>
          </div>

          {mode === 'add_new' ? (
            /* Add Staff Form */
            <div className="add-form-card">
              <h2 className="form-card-title">Add Staff Member</h2>
              <p className="form-card-desc">
                Enter staff details and tap Proceed to capture face.
              </p>

              <form onSubmit={handleAddNewSubmit} className="profile-form">
                <div className="form-group">
                  <label htmlFor="input-name">Staff Full Name *</label>
                  <input
                    id="input-name"
                    type="text"
                    placeholder="e.g. Ramesh Kumar, Sunita Devi"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    className="form-input"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="input-phone">Mobile Number (Optional)</label>
                  <input
                    id="input-phone"
                    type="tel"
                    placeholder="e.g. 9876543210"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="form-input"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="input-role">Staff Role / Designation</label>
                  <select
                    id="input-role"
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="form-select"
                  >
                    {STAFF_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </div>

                <button type="submit" className="proceed-btn">
                  📷 Proceed to Face Scan →
                </button>
              </form>
            </div>
          ) : (
            /* Search Existing Staff */
            <div className="search-existing-card">
              <MemberSearch
                members={existingProfiles}
                loading={dataLoading}
                onSelect={handleSelectExisting}
              />
            </div>
          )}
        </div>
      )}

      {/* Step 2: Camera & Detection */}
      {(step === 'camera' || step === 'detecting' || step === 'saving' || step === 'success') && (
        <div className="nmf-camera-container" ref={videoContainerRef}>
          <video
            ref={videoRef}
            className="nmf-video"
            autoPlay
            playsInline
            muted
          />

          {detection && (
            <FaceBox
              detection={detection}
              color={boxColor}
              videoElement={videoRef.current}
              width={dimensions.width}
              height={dimensions.height}
            />
          )}

          {cameraError && (
            <div className="camera-error-overlay">
              <span className="camera-error-icon">📵</span>
              <p>{cameraError}</p>
              <button className="error-retry-btn" onClick={() => setStep('form')}>
                Back to Form
              </button>
            </div>
          )}

          {!isReady && !cameraError && (
            <div className="camera-loading-overlay">
              <div className="spinner-ring" />
              <span>Starting camera...</span>
            </div>
          )}

          {step === 'camera' && isReady && !cameraError && (
            <div className="nmf-start-detect-overlay">
              <div className="nmf-selected-member-chip">
                <span className="chip-avatar">
                  {mode === 'add_new'
                    ? (formData.name || '?')[0].toUpperCase()
                    : (selectedProfile?.name || '?')[0].toUpperCase()}
                </span>
                <div className="chip-info">
                  <span className="chip-name">
                    {mode === 'add_new' ? formData.name : selectedProfile?.name}
                  </span>
                  <span className="chip-role">
                    {mode === 'add_new' ? formData.role : selectedProfile?.role}
                  </span>
                </div>
              </div>
              <p className="nmf-detect-hint">
                Look straight at the camera and tap <strong>Start Face Scan</strong>.
              </p>
              <button
                id="btn-start-detect"
                className="nmf-detect-btn"
                onClick={handleStartDetection}
              >
                📸 Start Face Scan
              </button>
            </div>
          )}

          {(step === 'detecting' || step === 'saving') && (
            <div className="nmf-status-bar">
              <div className="nmf-scan-line" />
              <span className="nmf-status-msg">{statusMsg}</span>
            </div>
          )}

          {/* Success Dialog */}
          {step === 'success' && (
            <div className="nmf-success-overlay">
              <div className="success-card">
                <div className="success-icon-ring">
                  <span className="success-icon">✓</span>
                </div>
                <h2 className="success-title">Face ID Saved!</h2>
                <p className="success-sub">
                  Saved successfully to Panda Ka Dhaba Database
                </p>

                <div className="success-member-info">
                  <div className="success-name">
                    {mode === 'add_new' ? formData.name : selectedProfile?.name}
                  </div>
                  <div className="success-role-badge">
                    {mode === 'add_new' ? formData.role : selectedProfile?.role}
                  </div>
                </div>

                <div className="success-actions">
                  <button
                    className="success-btn-secondary"
                    onClick={() => {
                      stopCamera();
                      setStep('form');
                      setFormData({ name: '', phone: '', role: STAFF_ROLES[0] });
                      setSelectedProfile(null);
                      setDetection(null);
                      loadStaff();
                    }}
                  >
                    ➕ Add Another Staff
                  </button>
                  <button
                    className="success-btn-primary"
                    onClick={() => navigate('/attendance')}
                  >
                    📷 Start Attendance Kiosk
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error state */}
      {step === 'error' && (
        <div className="nmf-error-page">
          <span className="error-big-icon">⚠️</span>
          <h2>Enrollment Failed</h2>
          <p>{pageError}</p>
          <div className="error-actions">
            <button className="btn-retry" onClick={() => setStep('camera')}>
              Try Again
            </button>
            <button className="btn-home" onClick={() => navigate('/')}>
              Go Home
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
