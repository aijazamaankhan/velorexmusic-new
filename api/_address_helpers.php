<?php
// Shared address-validation + snapshot helpers used by both:
//   - api/addresses.php       (save/edit/delete addresses on the user's account)
//   - api/payments/create-order.php (guest checkout — validate an inline shipping
//                                    address without saving it to the user's book)
//
// Keeping the rules in one place means the loose phone/postal/GSTIN regexes
// stay consistent across the two entry points. If you tighten validation
// here, both endpoints pick up the change automatically.

// Returns an error message string, or null when the payload validates.
// `$b` is the incoming JSON body shaped like the address-form fields the
// frontend sends (camelCase keys).
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

// Build the canonical snapshot shape that gets stored in payment_orders.shipping_address
// and later in orders.order_data.shippingAddress. Same keys whether the source is a
// saved address row (registered user) or a raw payload (guest). Keeps the consumers
// (admin orders panel, customer order detail, future invoice template) agnostic.
function address_snapshot_from_row(array $row): array {
    return [
        'label'       => $row['label'],
        'fullName'    => $row['full_name'],
        'phone'       => $row['phone'],
        'line1'       => $row['line1'],
        'line2'       => $row['line2'],
        'landmark'    => $row['landmark'],
        'city'        => $row['city'],
        'state'       => $row['state'],
        'postalCode'  => $row['postal_code'],
        'countryCode' => $row['country_code'],
        'gstin'       => $row['gstin'],
    ];
}

function address_snapshot_from_payload(array $b): array {
    return [
        'label'       => isset($b['label'])      ? trim((string)$b['label'])      : null,
        'fullName'    => trim((string)$b['fullName']),
        'phone'       => trim((string)$b['phone']),
        'line1'       => trim((string)$b['line1']),
        'line2'       => isset($b['line2'])      ? trim((string)$b['line2'])      : null,
        'landmark'    => isset($b['landmark'])   ? trim((string)$b['landmark'])   : null,
        'city'        => trim((string)$b['city']),
        'state'       => isset($b['state'])      ? trim((string)$b['state'])      : null,
        'postalCode'  => isset($b['postalCode']) ? trim((string)$b['postalCode']) : null,
        'countryCode' => strtoupper(trim((string)$b['countryCode'])),
        'gstin'       => !empty($b['gstin'])     ? strtoupper(trim((string)$b['gstin'])) : null,
    ];
}
