import React from 'react';
import './StatusOverlay.css';

/**
 * Bottom glassmorphism overlay showing profile info and status message.
 */
export default function StatusOverlay({ member, status, statusMessage }) {
  const statusClass = {
    checking: 'status-checking',
    checked_in: 'status-success',
    already_in: 'status-warning',
    no_match: 'status-error',
    multi_face: 'status-warning',
    idle: 'status-idle',
    registered: 'status-success',
  }[status] || 'status-idle';

  const statusIcons = {
    checking: '🔍',
    checked_in: '✅',
    already_in: '⏱️',
    no_match: '❌',
    multi_face: '👥',
    idle: '📷',
    registered: '✅',
  };

  return (
    <div className={`status-overlay ${statusClass}`}>
      {statusMessage && (
        <div className="status-message">
          <span className="status-icon">{statusIcons[status] || '📷'}</span>
          <span className="status-text">{statusMessage}</span>
        </div>
      )}

      {member && (
        <div className="member-info">
          <div className="member-name">{member.name}</div>
          <div className="member-details">
            <span className="member-detail-item">
              <span className="detail-label">Code</span>
              <span className="detail-value">{member.profile_code || member.member_code || member.staff_code || `#${member.id}`}</span>
            </span>
            <span className="member-detail-divider">|</span>
            <span className="member-detail-item">
              <span className="detail-label">Role</span>
              <span className="detail-value">{member.role || (member.type === 'staff' ? 'Staff' : 'Customer')}</span>
            </span>
            {member.status && (
              <>
                <span className="member-detail-divider">|</span>
                <span className="member-detail-item">
                  <span className={`member-status-badge ${member.status === 'active' ? 'badge-active' : 'badge-inactive'}`}>
                    {member.status}
                  </span>
                </span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
