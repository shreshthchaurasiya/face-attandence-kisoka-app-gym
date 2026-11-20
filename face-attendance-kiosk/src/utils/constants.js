/**
 * Configuration constants for Panda Ka Dhaba Staff Attendance Kiosk
 */

// Optimized input size for TinyFaceDetector (Allowed values: 160, 224, 320)
export const FACE_API_INPUT_SIZE = 160;

// Restaurant Staff Roles
export const STAFF_ROLES = [
  'Head Chef (Pradhan Rasoiya)',
  'Cook / Halwai',
  'Assistant Cook',
  'Captain / Order Taker',
  'Waiter',
  'Restaurant Manager',
  'Cashier / Counter',
  'Kitchen Helper / Bartan',
  'Cleaning / Housekeeping',
  'Delivery Boy',
];

// Voice Feedback Settings
export const VOICE_ENABLED = true;
export const VOICE_LANGUAGE = 'en-IN';
export const VOICE_RATE = 1;
export const VOICE_PITCH = 1;
export const VOICE_VOLUME = 1;

// Restaurant Details
export const RESTAURANT_NAME = 'Panda Ka Dhaba';
export const RESTAURANT_TAGLINE = 'Staff Face Attendance Kiosk';
