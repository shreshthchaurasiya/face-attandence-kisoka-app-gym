import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStats } from '../services/api';
import './HomePage.css';

export default function HomePage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    total_profiles: 0,
    registered_faces: 0,
    staff_count: 0,
    today_checkins: 0,
  });
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const data = await getStats();
        if (data) setStats(data);
      } catch (err) {
        console.warn('Could not load stats:', err);
      } finally {
        setStatsLoading(false);
      }
    }
    loadStats();
  }, []);

  const handleStartAttendance = () => {
    if (window.speechSynthesis) {
      const utterance = new SpeechSynthesisUtterance('');
      utterance.volume = 0;
      window.speechSynthesis.speak(utterance);
    }
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        ctx.resume();
      }
    } catch (e) {}

    navigate('/attendance');
  };

  return (
    <div className="home-page">
      <div className="home-bg-orb home-bg-orb-1" />
      <div className="home-bg-orb home-bg-orb-2" />

      <div className="home-content">
        {/* Header */}
        <header className="home-header">
          <h1 className="home-restaurant-name">PANDA KA DHABA</h1>
          <p className="home-subtitle">Staff Face Attendance System</p>
          <div className="home-status-bar">
            <span className="status-dot-live" />
            <span className="status-live-text">Hostinger Cloud Database Live</span>
          </div>
        </header>

        {/* Quick Stats Grid */}
        <div className="home-stats-grid">
          <div className="stat-card">
            <span className="stat-icon">👨‍🍳</span>
            <div className="stat-number">
              {statsLoading ? '...' : (stats.staff_count || stats.total_profiles || 0)}
            </div>
            <div className="stat-label">Total Staff</div>
          </div>

          <div className="stat-card highlight">
            <span className="stat-icon">📷</span>
            <div className="stat-number">
              {statsLoading ? '...' : (stats.registered_faces || 0)}
            </div>
            <div className="stat-label">Face IDs Enrolled</div>
          </div>

          <div className="stat-card success">
            <span className="stat-icon">✅</span>
            <div className="stat-number">
              {statsLoading ? '...' : (stats.today_checkins || 0)}
            </div>
            <div className="stat-label">Present Today</div>
          </div>
        </div>

        {/* Main Actions */}
        <main className="home-main">
          <div className="action-card">
            <div className="action-card-header">
              <span className="section-badge">STAFF ATTENDANCE</span>
              <h2 className="action-card-title">Restaurant Staff Kiosk</h2>
              <p className="action-card-desc">
                AI face recognition for kitchen staff, waiters, captains, and managers.
              </p>
            </div>

            <div className="action-buttons">
              {/* Button 1: Start Kiosk */}
              <button
                id="btn-start-attendance"
                className="action-btn action-btn-primary"
                onClick={handleStartAttendance}
              >
                <div className="btn-icon-wrapper primary">📷</div>
                <div className="btn-text">
                  <span className="btn-title">Start Face Attendance</span>
                  <span className="btn-hint">Full-screen Kiosk for staff check-in</span>
                </div>
                <span className="btn-arrow">→</span>
              </button>

              {/* Button 2: Add Staff Face */}
              <button
                id="btn-new-member-face"
                className="action-btn action-btn-secondary"
                onClick={() => navigate('/register')}
              >
                <div className="btn-icon-wrapper secondary">➕</div>
                <div className="btn-text">
                  <span className="btn-title">Add Staff Face ID</span>
                  <span className="btn-hint">Register new staff member & scan face</span>
                </div>
                <span className="btn-arrow">→</span>
              </button>

              {/* Button 3: Attendance Logs */}
              <button
                id="btn-view-logs"
                className="action-btn action-btn-tertiary"
                onClick={() => navigate('/logs')}
              >
                <div className="btn-icon-wrapper tertiary">📋</div>
                <div className="btn-text">
                  <span className="btn-title">Today's Attendance Register</span>
                  <span className="btn-hint">View staff check-in times & history</span>
                </div>
                <span className="btn-arrow">→</span>
              </button>
            </div>
          </div>
        </main>

        <footer className="home-footer">
          <p className="footer-text">
            🍛 Panda Ka Dhaba • Staff Attendance System
          </p>
        </footer>
      </div>
    </div>
  );
}
