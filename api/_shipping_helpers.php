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
// Delivery is now decided PER PRODUCT (free, or an admin-set rate), with these
// zone rates as the fallback for products that do not specify one. The old
// "free pan-India over ₹5,000" threshold has been removed.

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
// $subtotal is in rupees (int). Mirrors Shipping.calculate() in the JS module —
// CHANGE BOTH TOGETHER. This one is authoritative: it mints the Razorpay amount.
//
// DELIVERY IS PER PRODUCT. The old "free pan-India over ₹5,000" rule is gone.
// Each product carries:
//     freeShipping    → never adds a delivery charge
//     shippingCharge  → the admin's own rate; null means "use the zone rate"
//
// $items is a list of ['freeShipping' => bool, 'shippingCharge' => ?int].
// Passing an empty list falls back to the plain zone rate, which is what the
// old behaviour was minus the threshold — so a caller that has not been updated
// still charges something sane rather than zero.
//
// The cart charge is the HIGHEST applicable rate, not the sum. Everything ships
// in one parcel, so summing would bill three records at 3x the courier cost and
// punish exactly the large baskets we want. Free only when EVERY item is free —
// otherwise a ₹50 free-delivery sticker would carry a heavy vinyl order.
function shipping_calculate(int $subtotal, ?array $address, array $items = []): array {
    $zone = shipping_classify_zone($address);
    $baseRate = VV_SHIPPING_RATES[$zone] ?? VV_SHIPPING_RATES['rest'];

    if (!$items) {
        return ['zone' => $zone, 'shipping' => $baseRate, 'freeShipping' => false];
    }

    $charge = 0;
    $anyPaid = false;
    foreach ($items as $it) {
        if (!empty($it['freeShipping'])) continue;
        $anyPaid = true;
        $rate = (isset($it['shippingCharge']) && $it['shippingCharge'] !== null)
            ? max(0, (int)$it['shippingCharge'])
            : $baseRate;
        if ($rate > $charge) $charge = $rate;
    }

    return [
        'zone'         => $zone,
        'shipping'     => $anyPaid ? $charge : 0,
        'freeShipping' => !$anyPaid,
    ];
}
