<?php
require_once __DIR__ . '/config.php';

// Ensure IST Timezone
date_default_timezone_set('Asia/Kolkata');

$method = $_SERVER['REQUEST_METHOD'];

// GET Attendance Logs
if ($method === 'GET') {
    $date = isset($_GET['date']) ? trim($_GET['date']) : date('Y-m-d');

    $stmt = $pdo->prepare("
        SELECT a.id, a.profile_id, a.profile_name, a.profile_type, a.log_date, a.check_in_time, a.check_out_time, a.method, a.created_at,
               p.role, p.phone, p.profile_code,
               (SELECT COUNT(DISTINCT log_date) FROM attendance_logs WHERE profile_id = a.profile_id AND log_date LIKE CONCAT(SUBSTRING(a.log_date, 1, 7), '%')) as monthly_present_days
        FROM attendance_logs a
        LEFT JOIN profiles p ON a.profile_id = p.id
        WHERE a.log_date = ?
        ORDER BY a.check_in_time DESC
    ");
    $stmt->execute([$date]);
    $logs = $stmt->fetchAll();

    echo json_encode([
        'status' => 'success',
        'date' => $date,
        'count' => count($logs),
        'data' => $logs
    ]);
    exit();
}

// POST: Mark Check-In or Check-Out
if ($method === 'POST') {
    $input = getJsonInput();
    $profileId = isset($input['profile_id']) ? intval($input['profile_id']) : 0;
    $methodType = isset($input['method']) ? trim($input['method']) : 'face_kiosk';
    $action = isset($input['action']) ? trim($input['action']) : 'check_in';

    if (!$profileId) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Profile ID is required']);
        exit();
    }

    // Verify profile exists
    $stmt = $pdo->prepare("SELECT id, name, type, role, status, profile_code FROM profiles WHERE id = ?");
    $stmt->execute([$profileId]);
    $profile = $stmt->fetch();

    if (!$profile) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'Staff profile not found']);
        exit();
    }

    if ($profile['status'] !== 'active') {
        http_response_code(403);
        echo json_encode([
            'status' => 'error',
            'action' => 'denied',
            'message' => 'Staff profile is inactive'
        ]);
        exit();
    }

    $today = date('Y-m-d');
    $currentTime = date('H:i:s');

    // Check if attendance row exists today
    $checkStmt = $pdo->prepare("SELECT id, check_in_time, check_out_time FROM attendance_logs WHERE profile_id = ? AND log_date = ?");
    $checkStmt->execute([$profileId, $today]);
    $existing = $checkStmt->fetch();

    // Handling CHECK-OUT
    if ($action === 'check_out') {
        if (!$existing) {
            echo json_encode([
                'status' => 'warning',
                'action' => 'not_checked_in',
                'message' => "No check-in record found for {$profile['name']} today. Please check in first!"
            ]);
            exit();
        }

        if (!empty($existing['check_out_time'])) {
            echo json_encode([
                'status' => 'warning',
                'action' => 'already_out',
                'message' => "Already checked out today at {$existing['check_out_time']}",
                'check_out_time' => $existing['check_out_time']
            ]);
            exit();
        }

        // Update check-out time
        $upd = $pdo->prepare("UPDATE attendance_logs SET check_out_time = ? WHERE id = ?");
        $upd->execute([$currentTime, $existing['id']]);

        echo json_encode([
            'status' => 'success',
            'action' => 'checked_out',
            'message' => "Goodbye {$profile['name']}! Shift Check-Out logged.",
            'data' => [
                'name' => $profile['name'],
                'role' => $profile['role'],
                'code' => $profile['profile_code'],
                'check_in_time' => $existing['check_in_time'],
                'check_out_time' => $currentTime,
                'log_date' => $today
            ]
        ]);
        exit();
    }

    // Handling CHECK-IN
    if ($existing) {
        echo json_encode([
            'status' => 'warning',
            'action' => 'already_in',
            'message' => "Already checked in today at {$existing['check_in_time']}",
            'data' => $existing
        ]);
        exit();
    }

    // Insert new check-in
    $insertStmt = $pdo->prepare("
        INSERT INTO attendance_logs (`profile_id`, `profile_name`, `profile_type`, `log_date`, `check_in_time`, `method`)
        VALUES (?, ?, ?, ?, ?, ?)
    ");
    $insertStmt->execute([
        $profile['id'],
        $profile['name'],
        $profile['type'],
        $today,
        $currentTime,
        $methodType
    ]);

    echo json_encode([
        'status' => 'success',
        'action' => 'checked_in',
        'message' => "Welcome to Panda Ka Dhaba, {$profile['name']}!",
        'data' => [
            'id' => $pdo->lastInsertId(),
            'name' => $profile['name'],
            'role' => $profile['role'],
            'code' => $profile['profile_code'],
            'check_in_time' => $currentTime,
            'log_date' => $today
        ]
    ]);
    exit();
}
