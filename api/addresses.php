<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/_address_helpers.php';

$method = $_SERVER['REQUEST_METHOD'];
$pdo = db();

// Cap saved addresses per user. Soft limit — enforced at create time.
const MAX_ADDRESSES_PER_USER = 10;

function row_to_address(array $r): array {
    return [
        'id' => (int)$r['id'],
        'label' => $r['label'],
        'fullName' => $r['full_name'],
        'phone' => $r['phone'],
        'line1' => $r['line1'],
        'line2' => $r['line2'],
        'landmark' => $r['landmark'],
        'city' => $r['city'],
        'state' => $r['state'],
        'postalCode' => $r['postal_code'],
        'countryCode' => $r['country_code'],
        'gstin' => $r['gstin'],
        'isDefault' => (bool)$r['is_default'],
        'createdAt' => $r['created_at'],
        'updatedAt' => $r['updated_at'],
    ];
}

try {
    if ($method === 'GET') {
        $userId = require_user();
        $stmt = $pdo->prepare('SELECT * FROM addresses WHERE user_id = :u ORDER BY is_default DESC, updated_at DESC');
        $stmt->execute([':u' => $userId]);
        echo json_encode(array_map('row_to_address', $stmt->fetchAll()));
        exit;
    }

    if ($method === 'POST') {
        $userId = require_user();
        $body = read_json_body();

        $err = validate_address_payload($body);
        if ($err) {
            http_response_code(400);
            echo json_encode(['error' => $err]);
            exit;
        }

        $id = isset($body['id']) ? (int)$body['id'] : 0;
        $makeDefault = !empty($body['isDefault']);

        $pdo->beginTransaction();
        try {
            // If user has zero addresses, force the new one to be default.
            if ($id === 0) {
                $c = $pdo->prepare('SELECT COUNT(*) AS n FROM addresses WHERE user_id = :u');
                $c->execute([':u' => $userId]);
                $existing = (int)$c->fetch()['n'];
                if ($existing >= MAX_ADDRESSES_PER_USER) {
                    $pdo->rollBack();
                    http_response_code(400);
                    echo json_encode(['error' => 'Address limit reached (' . MAX_ADDRESSES_PER_USER . ' max)']);
                    exit;
                }
                if ($existing === 0) $makeDefault = true;
            }

            // Enforce single default per user.
            if ($makeDefault) {
                $clr = $pdo->prepare('UPDATE addresses SET is_default = 0 WHERE user_id = :u');
                $clr->execute([':u' => $userId]);
            }

            $params = [
                ':label' => isset($body['label']) ? trim((string)$body['label']) : null,
                ':full_name' => trim($body['fullName']),
                ':phone' => trim($body['phone']),
                ':line1' => trim($body['line1']),
                ':line2' => isset($body['line2']) ? trim((string)$body['line2']) : null,
                ':landmark' => isset($body['landmark']) ? trim((string)$body['landmark']) : null,
                ':city' => trim($body['city']),
                ':state' => isset($body['state']) ? trim((string)$body['state']) : null,
                ':postal_code' => isset($body['postalCode']) ? trim((string)$body['postalCode']) : null,
                ':country_code' => strtoupper(trim($body['countryCode'])),
                ':gstin' => !empty($body['gstin']) ? strtoupper(trim($body['gstin'])) : null,
                ':is_default' => $makeDefault ? 1 : 0,
                ':u' => $userId,
            ];

            if ($id > 0) {
                // Update — must belong to caller.
                $own = $pdo->prepare('SELECT id FROM addresses WHERE id = :id AND user_id = :u');
                $own->execute([':id' => $id, ':u' => $userId]);
                if (!$own->fetch()) {
                    $pdo->rollBack();
                    http_response_code(404);
                    echo json_encode(['error' => 'Address not found']);
                    exit;
                }
                $params[':id'] = $id;
                $sql = 'UPDATE addresses SET label=:label, full_name=:full_name, phone=:phone,
                    line1=:line1, line2=:line2, landmark=:landmark, city=:city, state=:state,
                    postal_code=:postal_code, country_code=:country_code, gstin=:gstin,
                    is_default=:is_default WHERE id=:id AND user_id=:u';
                $pdo->prepare($sql)->execute($params);
            } else {
                $sql = 'INSERT INTO addresses (user_id, label, full_name, phone, line1, line2,
                    landmark, city, state, postal_code, country_code, gstin, is_default)
                    VALUES (:u, :label, :full_name, :phone, :line1, :line2, :landmark, :city,
                    :state, :postal_code, :country_code, :gstin, :is_default)';
                $pdo->prepare($sql)->execute($params);
                $id = (int)$pdo->lastInsertId();
            }

            // Guarantee at least one default exists.
            $hasDefault = $pdo->prepare('SELECT COUNT(*) AS n FROM addresses WHERE user_id = :u AND is_default = 1');
            $hasDefault->execute([':u' => $userId]);
            if ((int)$hasDefault->fetch()['n'] === 0) {
                $promote = $pdo->prepare('UPDATE addresses SET is_default = 1 WHERE user_id = :u ORDER BY updated_at DESC LIMIT 1');
                $promote->execute([':u' => $userId]);
            }

            $pdo->commit();
        } catch (Exception $txe) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $txe;
        }

        $sel = $pdo->prepare('SELECT * FROM addresses WHERE id = :id');
        $sel->execute([':id' => $id]);
        $row = $sel->fetch();
        echo json_encode(['ok' => true, 'address' => row_to_address($row)]);
        exit;
    }

    if ($method === 'DELETE') {
        $userId = require_user();
        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        if ($id <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing address id']);
            exit;
        }

        $pdo->beginTransaction();
        try {
            $sel = $pdo->prepare('SELECT is_default FROM addresses WHERE id = :id AND user_id = :u');
            $sel->execute([':id' => $id, ':u' => $userId]);
            $row = $sel->fetch();
            if (!$row) {
                $pdo->rollBack();
                http_response_code(404);
                echo json_encode(['error' => 'Address not found']);
                exit;
            }

            $del = $pdo->prepare('DELETE FROM addresses WHERE id = :id AND user_id = :u');
            $del->execute([':id' => $id, ':u' => $userId]);

            // If the deleted address was the default, promote the most recent remaining one.
            if ((int)$row['is_default'] === 1) {
                $promote = $pdo->prepare('UPDATE addresses SET is_default = 1 WHERE user_id = :u ORDER BY updated_at DESC LIMIT 1');
                $promote->execute([':u' => $userId]);
            }

            $pdo->commit();
        } catch (Exception $txe) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $txe;
        }
        echo json_encode(['ok' => true]);
        exit;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
}
