import React, { useState, useMemo } from 'react';
import './MemberSearch.css';

/**
 * Profile search component for Staff and Customers.
 */
export default function MemberSearch({ members, loading, onSelect }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim()) return members.slice(0, 25);
    const q = query.toLowerCase();
    return members.filter(
      (m) =>
        (m.name && m.name.toLowerCase().includes(q)) ||
        (m.profile_code && m.profile_code.toLowerCase().includes(q)) ||
        (m.member_code && m.member_code.toLowerCase().includes(q)) ||
        (m.staff_code && m.staff_code.toLowerCase().includes(q)) ||
        (m.role && m.role.toLowerCase().includes(q)) ||
        (m.phone && String(m.phone).includes(q)) ||
        (m.mobile && String(m.mobile).includes(q))
    );
  }, [query, members]);

  return (
    <div className="member-search">
      <div className="search-input-wrapper">
        <span className="search-icon">🔍</span>
        <input
          id="member-search-input"
          className="search-input"
          type="text"
          placeholder="Search by name, role, code, or phone..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
        {query && (
          <button className="search-clear" onClick={() => setQuery('')}>
            ✕
          </button>
        )}
      </div>

      {loading ? (
        <div className="search-loading">Loading profiles...</div>
      ) : (
        <div className="member-list">
          {filtered.length === 0 ? (
            <div className="search-empty">No matching profile found</div>
          ) : (
            filtered.map((member) => (
              <button
                key={member.id}
                id={`member-item-${member.id}`}
                className="member-list-item"
                onClick={() => onSelect(member)}
              >
                <div className="member-item-avatar">
                  {(member.name || '?')[0].toUpperCase()}
                </div>
                <div className="member-item-info">
                  <div className="member-item-name">{member.name || 'Unknown'}</div>
                  <div className="member-item-meta">
                    <span className="code-pill">#{member.profile_code || member.staff_code || member.member_code || 'ID-' + member.id}</span>
                    <span className="role-pill">{member.role || (member.type === 'staff' ? 'Staff' : 'Customer')}</span>
                    {member.is_face_registered || member.faceRegistered ? (
                      <span className="face-registered-badge">✓ Face Enrolled</span>
                    ) : (
                      <span className="face-unregistered-badge">No Face</span>
                    )}
                  </div>
                </div>
                <span
                  className={`member-status-dot ${
                    member.status && member.status.toLowerCase() === 'active'
                      ? 'dot-active'
                      : 'dot-inactive'
                  }`}
                />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
