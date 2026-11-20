import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAttendanceLogs } from '../services/api';
import './AttendanceLogs.css';

export default function AttendanceLogs() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchLogs = async (date) => {
    setLoading(true);
    try {
      const data = await getAttendanceLogs(date);
      setLogs(data);
    } catch (err) {
      console.error('Failed to fetch attendance logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(selectedDate);
  }, [selectedDate]);

  const formatTime = (timeStr) => {
    if (!timeStr) return '—';
    try {
      const [h, m, s] = timeStr.split(':');
      let hour = parseInt(h, 10);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      hour = hour % 12 || 12;
      return `${String(hour).padStart(2, '0')}:${m}:${s ? s.slice(0, 2) : '00'} ${ampm}`;
    } catch {
      return timeStr;
    }
  };

  const filteredLogs = logs.filter((log) => {
    const q = searchQuery.toLowerCase();
    return (
      (log.profile_name && log.profile_name.toLowerCase().includes(q)) ||
      (log.role && log.role.toLowerCase().includes(q)) ||
      (log.profile_code && log.profile_code.toLowerCase().includes(q))
    );
  });

  return (
    <div className="logs-page">
      <header className="logs-header">
        <button className="logs-back-btn" onClick={() => navigate('/')}>
          ← Back to Home
        </button>
        <div className="logs-title-group">
          <h1>📋 Staff Attendance Register</h1>
          <p>Panda Ka Dhaba — Real-Time Check-In Records</p>
        </div>
        <button className="logs-refresh-btn" onClick={() => fetchLogs(selectedDate)}>
          🔄 Refresh
        </button>
      </header>

      <div className="logs-controls">
        <div className="logs-control-item">
          <label htmlFor="log-date">Date:</label>
          <input
            id="log-date"
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="logs-date-input"
          />
        </div>

        <div className="logs-control-item search-item">
          <input
            type="text"
            placeholder="Search by staff name, role, code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="logs-search-input"
          />
        </div>
      </div>

      <div className="logs-summary-bar">
        <div className="summary-pill">
          Total Staff Present Today: <strong>{logs.length}</strong>
        </div>
        <div className="summary-pill staff-pill">
          Register Date: <strong>{selectedDate}</strong>
        </div>
      </div>

      <div className="logs-content">
        {loading ? (
          <div className="logs-loading">
            <div className="spinner-ring" />
            <p>Fetching records from Hostinger Database...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="logs-empty">
            <span className="empty-icon">📭</span>
            <h3>No attendance recorded for {selectedDate}</h3>
            <p>Staff face scans on the kiosk will appear here live with exact arrival time.</p>
          </div>
        ) : (
          <div className="logs-table-wrapper">
            <table className="logs-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Staff Name</th>
                  <th>Role</th>
                  <th>Check-In Time (Exact)</th>
                  <th>Check-Out Time</th>
                  <th>This Month Total</th>
                  <th>Scan Method</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log, index) => (
                  <tr key={log.id || index}>
                    <td>{index + 1}</td>
                    <td className="log-user-cell">
                      <div className="log-avatar">{(log.profile_name || '?')[0].toUpperCase()}</div>
                      <div>
                        <div className="log-name">{log.profile_name}</div>
                        {log.profile_code && <span className="log-code">{log.profile_code}</span>}
                      </div>
                    </td>
                    <td>
                      <span className="role-badge role-staff">
                        {log.role || 'Staff'}
                      </span>
                    </td>
                    <td className="time-cell">
                      <span className="time-badge in">🟢 {formatTime(log.check_in_time)}</span>
                    </td>
                    <td className="time-cell">
                      {log.check_out_time ? (
                        <span className="time-badge out">🔴 {formatTime(log.check_out_time)}</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>
                      <span className="monthly-attendance-badge">
                        📅 {log.monthly_present_days || 1} Days
                      </span>
                    </td>
                    <td>
                      <span className="method-tag">🤖 {log.method || 'face_kiosk'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
