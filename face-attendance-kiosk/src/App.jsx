import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import HomePage from './pages/HomePage';
import NewMemberFace from './pages/NewMemberFace';
import FaceAttendance from './pages/FaceAttendance';
import AttendanceLogs from './pages/AttendanceLogs';
import './index.css';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/register" element={<NewMemberFace />} />
        <Route path="/attendance" element={<FaceAttendance />} />
        <Route path="/logs" element={<AttendanceLogs />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
