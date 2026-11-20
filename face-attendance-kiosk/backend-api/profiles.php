<?php
require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $type = isset($_GET['type']) ? trim($_GET['type']) : '';
    $registeredOnly = isset($_GET['registered_only']) && $_GET['registered_only'] === '1';
    $search = isset($_GET['q']) ? trim($_GET['q']) : '';

    $sql = "SELECT id, profile_code, name, phone, type, role, is_face_registered, status, created_at";
    if (isset($_GET['include_descriptor']) && $_GET['include_descriptor'] === '1') {
        $sql .= ", face_descriptor";
    }
    $sql .= " FROM profiles WHERE 1=1";
    $params = [];

    if ($type) {
        $sql .= " AND type = ?";
        $params[] = $type;
    }
    if ($registeredOnly) {
        $sql .= " AND is_face_registered = 1";
    }
    if ($search) {
        $sql .= " AND (name LIKE ? OR phone LIKE ? OR profile_code LIKE ?)";
        $params[] = "%{$search}%";
        $params[] = "%{$search}%";
        $params[] = "%{$search}%";
    }

    $sql .= " ORDER BY id DESC";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $profiles = $stmt->fetchAll();

    // Decode face_descriptor if requested
    if (isset($_GET['include_descriptor']) && $_GET['include_descriptor'] === '1') {
        foreach ($profiles as &$p) {
            if (!empty($p['face_descriptor'])) {
                $decoded = json_decode($p['face_descriptor'], true);
                $p['face_descriptor'] = is_array($decoded) ? $decoded : null;
            } else {
                $p['face_descriptor'] = null;
            }
        }
    }

    echo json_encode(['status' => 'success', 'data' => $profiles]);
    exit();
}

if ($method === 'POST') {
    $input = getJsonInput();
    $action = isset($input['action']) ? $input['action'] : 'create';

    // Update Face Descriptor for existing profile
    if ($action === 'save_face') {
        $profileId = isset($input['profile_id']) ? intval($input['profile_id']) : 0;
        $descriptor = isset($input['face_descriptor']) ? $input['face_descriptor'] : null;

        if (!$profileId || empty($descriptor)) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Profile ID and face descriptor are required']);
            exit();
        }

        $descriptorJson = is_array($descriptor) ? json_encode($descriptor) : $descriptor;
        $stmt = $pdo->prepare("
            UPDATE profiles 
            SET face_descriptor = ?, is_face_registered = 1 
            WHERE id = ?
        ");
        $stmt->execute([$descriptorJson, $profileId]);

        echo json_encode(['status' => 'success', 'message' => 'Face registered successfully!']);
        exit();
    }

    // Create New Profile
    $name = isset($input['name']) ? trim($input['name']) : '';
    $phone = isset($input['phone']) ? trim($input['phone']) : null;
    $type = isset($input['type']) && in_array($input['type'], ['staff', 'customer', 'vip']) ? $input['type'] : 'staff';
    $role = isset($input['role']) ? trim($input['role']) : ($type === 'staff' ? 'Staff' : 'Customer');
    $descriptor = isset($input['face_descriptor']) ? $input['face_descriptor'] : null;

    if (empty($name)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Name is required']);
        exit();
    }

    // Generate unique code (e.g. PKD-104)
    $prefix = $type === 'staff' ? 'PKD' : 'CUST';
    $stmt = $pdo->query("SELECT MAX(id) FROM profiles");
    $nextId = (intval($stmt->fetchColumn()) ?: 0) + 1;
    $profileCode = $prefix . '-' . str_pad($nextId, 3, '0', STR_PAD_LEFT);

    $isRegistered = 0;
    $descriptorJson = null;
    if (!empty($descriptor)) {
        $isRegistered = 1;
        $descriptorJson = is_array($descriptor) ? json_encode($descriptor) : $descriptor;
    }

    $stmt = $pdo->prepare("
        INSERT INTO profiles (`profile_code`, `name`, `phone`, `type`, `role`, `face_descriptor`, `is_face_registered`, `status`)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
    ");
    $stmt->execute([$profileCode, $name, $phone, $type, $role, $descriptorJson, $isRegistered]);
    $newId = $pdo->lastInsertId();

    echo json_encode([
        'status' => 'success',
        'message' => 'Profile created successfully',
        'data' => [
            'id' => $newId,
            'profile_code' => $profileCode,
            'name' => $name,
            'phone' => $phone,
            'type' => $type,
            'role' => $role,
            'is_face_registered' => $isRegistered
        ]
    ]);
    exit();
}
