<?php
// Server-side shipping calculator. PHP mirror of src/js/shipping.js — change
// both together. The browser uses the JS module for a preview; this file is
// what actually mints the Razorpay order amount in api/payments/create-order.php,
// so this is the source of truth at payment time.
//
// Zone rules (shipped from Delhi/NCR):
//   ncr     ₹49   Delhi proper + core NCR districts (HR/UP/RJ NCR belt)
//   rest    ₹99   Rest of India (default for unknown / missing address)
//   remote  ₹199  NE states, Sikkim, J&K, Ladakh, A&N, Lakshadweep
//   intl    ₹99   Non-India — UNREACHABLE: api/payments/create-order.php
//                rejects non-IN addresses with intl_not_supported before
//                this function is even called. Rate retained as a no-op
//                safety fallback only.
// Free shipping kicks in PAN India at ₹5,000+ subtotal.

const VV_SHIPPING_FREE_THRESHOLD = 5000;

const VV_SHIPPING_RATES = [
    'ncr'    => 49,
    'rest'   => 99,
    'remote' => 199,
    'intl'   => 99,
];

// Match exactly the IN_STATES strings in src/js/constants.js and the value
// the address form persists into addresses.state / order shipping snapshot.
const VV_SHIPPING_REMOTE_STATES = [
    'Arunachal Pradesh', 'Assam', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Tripura',
    'Sikkim',
    'Jammu and Kashmir', 'Ladakh',
    'Andaman and Nicobar Islands', 'Lakshadweep',
];

// 3-digit PIN prefixes for NCR Planning Board districts. See the JS module
// for the district-by-district mapping; keep both in sync.
const VV_SHIPPING_NCR_PIN_PREFIXES = [
    '110',
    '121', '122', '123', '124',
    '131', '132',
    '201', '203', '245', '250',
    '301', '321',
];

// Returns one of 'ncr', 'rest', 'remote', 'intl'. $address is the canonical
// snapshot shape from _address_helpers.php (countryCode, state, postalCode).
function shipping_classify_zone(?array $address): string {
    if (!$address) return 'rest';

    $country = strtoupper(trim((string)($address['countryCode'] ?? '')));
    if ($country !== '' && $country !== 'IN') return 'intl';

    $state = trim((string)($address['state'] ?? ''));
    if (in_array($state, VV_SHIPPING_REMOTE_STATES, true)) return 'remote';

    $pin = trim((string)($address['postalCode'] ?? ''));
    if (strlen($pin) >= 3) {
        $prefix = substr($pin, 0, 3);
        if (in_array($prefix, VV_SHIPPING_NCR_PIN_PREFIXES, true)) return 'ncr';
    }

    // Delhi state value without a 110xxx PIN (data oddity) — still NCR.
    if ($state === 'Delhi') return 'ncr';

    return 'rest';
}

// Returns ['zone' => string, 'shipping' => int rupees, 'freeShipping' => bool].
// $subtotal is in rupees (int). Mirrors Shipping.calculate() in the JS module.
function shipping_calculate(int $subtotal, ?array $address): array {
    $zone = shipping_classify_zone($address);
    $baseRate = VV_SHIPPING_RATES[$zone] ?? VV_SHIPPING_RATES['rest'];
    $freeShipping = $subtotal >= VV_SHIPPING_FREE_THRESHOLD;
    $shipping = $freeShipping ? 0 : $baseRate;
    return [
        'zone'         => $zone,
        'shipping'     => $shipping,
        'freeShipping' => $freeShipping,
    ];
}
