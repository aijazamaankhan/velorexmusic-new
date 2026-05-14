<?php
require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];
$pdo = db();

// Cap saved addresses per user. Soft limit — enforced at create time.
const MAX_ADDRESSES_PER_USER = 10;

// Validation regexes. Loose — aimed at catching typos, not enforcing correctness.
// Postal patterns are best-effort per country; unknown countries fall through to a generic check.
function validate_address_payload(array $b): ?string {
    $required = ['fullName' => 150, 'phone' => 30, 'line1' => 255, 'city' => 100, 'countryCode' => 2];
    foreach ($required as $field => $max) {
        $v = isset($b[$field]) ? trim((string)$b[$field]) : '';
        if ($v === '') return "Missing required field: $field";
        if (strlen($v) > $max) return "Field too long: $field";
    }

    $country = strtoupper(trim($b['countryCode']));
    if (!preg_match('/^[A-Z]{2}$/', $country)) return 'Invalid country code';

    $phone = trim($b['phone']);
    if (!preg_match('/^[\d\s\-\+\(\)]{6,20}$/', $phone)) return 'Invalid phone number';

    $postal = isset($b['postalCode']) ? trim((string)$b['postalCode']) : '';
    if ($postal !== '') {
        $ok = true;
        if ($country === 'IN' && !preg_match('/^\d{6}$/', $postal)) $ok = false;
        else if ($country === 'US' && !preg_match('/^\d{5}(-\d{4})?$/', $postal)) $ok = false;
        else if (!preg_match('/^[A-Za-z0-9\s\-]{2,12}$/', $postal)) $ok = false;
        if (!$ok) return 'Invalid postal code for ' . $country;
    } else {
        // Postal required for the major shipping countries.
        if (in_array($country, ['IN', 'US', 'CA', 'GB', 'AU', 'DE', 'FR'], true)) {
            return 'Postal code is required for ' . $country;
        }
    }

    $state = isset($b['state']) ? trim((string)$b['state']) : '';
    if ($state === '' && in_array($country, ['IN', 'US', 'CA', 'AU'], true)) {
        return 'State/region is required for ' . $country;
    }

    if (!empty($b['gstin'])) {
        $g = strtoupper(trim($b['gstin']));
        if (!preg_match('/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/', $g)) {
            return 'Invalid GSTIN format';
        }
    }

    return null;
}

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
