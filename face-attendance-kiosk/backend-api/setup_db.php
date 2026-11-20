<?php
require_once __DIR__ . '/config.php';

try {
    // 1. Create profiles table
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS `profiles` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `profile_code` VARCHAR(50) UNIQUE,
            `name` VARCHAR(100) NOT NULL,
            `phone` VARCHAR(20) DEFAULT NULL,
            `type` ENUM('staff', 'customer', 'vip') DEFAULT 'staff',
            `role` VARCHAR(50) DEFAULT 'Staff',
            `face_descriptor` LONGTEXT NULL,
            `is_face_registered` TINYINT(1) DEFAULT 0,
            `status` ENUM('active', 'inactive') DEFAULT 'active',
            `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ");

    // 2. Create attendance_logs table
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS `attendance_logs` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `profile_id` INT NOT NULL,
            `profile_name` VARCHAR(100),
            `profile_type` VARCHAR(20) DEFAULT 'staff',
            `log_date` DATE NOT NULL,
            `check_in_time` TIME NOT NULL,
            `check_out_time` TIME NULL,
            `method` VARCHAR(50) DEFAULT 'face_kiosk',
            `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ");

    // 3. Insert default staff profiles if table is empty
    $count = $pdo->query("SELECT COUNT(*) FROM profiles")->fetchColumn();
    if ($count == 0) {
        $stmt = $pdo->prepare("
            INSERT INTO `profiles` (`profile_code`, `name`, `phone`, `type`, `role`, `status`)
            VALUES 
                ('PKD-001', 'Head Chef (Pradhan)', '9876543210', 'staff', 'Head Chef', 'active'),
                ('PKD-002', 'Manager Ji', '9876543211', 'staff', 'Manager', 'active'),
                ('PKD-003', 'Captain / Waiter', '9876543212', 'staff', 'Waiter', 'active')
        ");
        $stmt->execute();
    }

    echo json_encode([
        'status' => 'success',
        'message' => 'Tables created successfully! Panda Ka Dhaba Database is ready.',
        'database' => $db_name
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Table creation failed: ' . $e->getMessage()
    ]);
}
