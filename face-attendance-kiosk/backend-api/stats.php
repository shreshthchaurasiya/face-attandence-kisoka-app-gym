<?php
require_once __DIR__ . '/config.php';

try {
    $today = date('Y-m-d');

    // Total profiles
    $totalProfiles = $pdo->query("SELECT COUNT(*) FROM profiles")->fetchColumn();
    // Registered faces
    $registeredFaces = $pdo->query("SELECT COUNT(*) FROM profiles WHERE is_face_registered = 1")->fetchColumn();
    // Staff count
    $staffCount = $pdo->query("SELECT COUNT(*) FROM profiles WHERE type = 'staff'")->fetchColumn();
    // Customer count
    $customerCount = $pdo->query("SELECT COUNT(*) FROM profiles WHERE type = 'customer'")->fetchColumn();

    // Today's Check-ins
    $todayStmt = $pdo->prepare("SELECT COUNT(*) FROM attendance_logs WHERE log_date = ?");
    $todayStmt->execute([$today]);
    $todayCheckins = $todayStmt->fetchColumn();

    echo json_encode([
        'status' => 'success',
        'data' => [
            'total_profiles' => intval($totalProfiles),
            'registered_faces' => intval($registeredFaces),
            'staff_count' => intval($staffCount),
            'customer_count' => intval($customerCount),
            'today_checkins' => intval($todayCheckins),
            'today_date' => $today
        ]
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
}
