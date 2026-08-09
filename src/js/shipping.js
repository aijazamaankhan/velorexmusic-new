/* =============================================================================
   Velorex Music — shipping calculator (storefront)
   Used by: src/js/storefront/pages.js (cart page + product-detail upsell),
            src/js/storefront/checkout.js (payment modal)

   The server mirrors this exact logic in api/_shipping_helpers.php; if you
   change one, change the other in the same commit. The server is the
   source of truth at payment time (api/payments/create-order.php
   recomputes before minting the Razorpay order), so any client/server
   drift means the customer sees one number and pays another.

   Zone rules (shipped from Delhi/NCR):
     - ncr     ₹49   Delhi proper + core NCR districts (HR/UP/RJ NCR belt)
     - rest    ₹99   Rest of India (default for unknown / missing address)
     - remote  ₹199  NE states, Sikkim, J&K, Ladakh, A&N, Lakshadweep
     - intl    ₹99   Non-India — UNREACHABLE in practice. Intl checkout is
                    gated at the UI layer (setCheckoutIntlBlocked in
                    checkout.js) and server (create-order.php returns 400
                    with code:'intl_not_supported'). Rate retained as a
                    no-op safety fallback in case the gate is bypassed.
   Delivery is decided PER PRODUCT (free, or an admin-set rate); these zone
   rates are the fallback for products that do not specify one.

   NCR_PIN_PREFIXES is a coarse 3-digit list covering the NCR Planning Board's
   official districts. A handful of non-NCR pockets (e.g. parts of Kurukshetra
   under 132xxx) get the ₹49 rate too — accepted as a ~₹50 rounding cost on
   rare edge cases rather than maintaining a 50k-row PIN database.
   ============================================================================= */

const Shipping = {
  // Zone rates are the FALLBACK for products that don't set their own charge.
  // Delivery is decided per product now; the old "free over ₹5,000" rule is gone.
  RATES: { ncr: 49, rest: 99, remote: 199, intl: 99 },

  // Match exactly the IN_STATES strings (see src/js/constants.js).
  REMOTE_STATES: new Set([
    'Arunachal Pradesh', 'Assam', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Tripura',
    'Sikkim',
    'Jammu and Kashmir', 'Ladakh',
    'Andaman and Nicobar Islands', 'Lakshadweep',
  ]),

  // 3-digit PIN prefixes covering NCR Planning Board districts:
  //   110  Delhi (entire NCT)
  //   121  Faridabad, Palwal (HR)
  //   122  Gurugram (HR)
  //   123  Rewari, Mahendragarh, Bhiwani, Charkhi Dadri (HR)
  //   124  Rohtak, Jhajjar, Nuh (HR)
  //   131  Sonipat (HR)
  //   132  Panipat, Karnal (HR)
  //   201  Ghaziabad, Gautam Buddha Nagar / Noida / Greater Noida (UP)
  //   203  Bulandshahr, Khurja (UP)
  //   245  Muzaffarnagar, Shamli (UP)
  //   250  Meerut, Baghpat, Hapur (UP)
  //   301  Alwar / Bhiwadi (RJ — partial NCR)
  //   321  Bharatpur (RJ — partial NCR)
  NCR_PIN_PREFIXES: new Set([
    '110',
    '121', '122', '123', '124',
    '131', '132',
    '201', '203', '245', '250',
    '301', '321',
  ]),

  classifyZone(address) {
    if (!address) return 'rest';
    const country = (address.countryCode || '').toUpperCase();
    if (country && country !== 'IN') return 'intl';

    const state = (address.state || '').trim();
    if (this.REMOTE_STATES.has(state)) return 'remote';

    const pin = (address.postalCode || '').trim();
    if (pin.length >= 3 && this.NCR_PIN_PREFIXES.has(pin.substring(0, 3))) return 'ncr';

    // Delhi state value without a 110xxx PIN (data oddity) — still treat as NCR.
    if (state === 'Delhi') return 'ncr';

    return 'rest';
  },

  zoneLabel(zone) {
    return ({
      ncr: 'Delhi/NCR',
      rest: 'Rest of India',
      remote: 'Remote zone',
      intl: 'International',
    })[zone] || 'Rest of India';
  },

  // subtotal in rupees (int). address is the shipping-address snapshot shape
  // (countryCode, state, postalCode). Pass null/undefined for "address not
  // known yet" — returns the rest-of-India tier as the safe default.
  // MIRRORS shipping_calculate() in api/_shipping_helpers.php — change both
  // together. That one is authoritative; this is only the on-screen estimate,
  // so a divergence shows the customer a wrong number before checkout and then
  // charges a different one, which is worse than either being wrong alone.
  //
  // `items` is the cart resolved against the product list:
  //   [{ freeShipping: bool, shippingCharge: number|null }, ...]
  // Highest applicable rate wins (one parcel, so summing would triple-bill a
  // three-record order). Free only when every item is free.
  calculate(subtotal, address, items) {
    const zone = this.classifyZone(address);
    const baseRate = this.RATES[zone] ?? this.RATES.rest;

    if (!items || !items.length) {
      return { zone, zoneLabel: this.zoneLabel(zone), baseRate, shipping: baseRate, freeShipping: false };
    }

    let charge = 0;
    let anyPaid = false;
    items.forEach((it) => {
      if (it && it.freeShipping) return;
      anyPaid = true;
      const rate = (it && it.shippingCharge !== null && it.shippingCharge !== undefined)
        ? Math.max(0, parseInt(it.shippingCharge, 10) || 0)
        : baseRate;
      if (rate > charge) charge = rate;
    });

    return {
      zone,
      zoneLabel: this.zoneLabel(zone),
      baseRate,
      shipping: anyPaid ? charge : 0,
      freeShipping: !anyPaid,
    };
  },

  // Resolve the cart into the shape calculate() needs. Kept here so both
  // callers (cart page + checkout) derive it identically.
  cartShippingItems() {
    try {
      const products = Storage.getProducts() || [];
      return (Storage.getCart() || []).map((line) => {
        const p = products.find((x) => String(x.id) === String(line.id));
        return {
          freeShipping: !!(p && p.freeShipping),
          shippingCharge: p && p.shippingCharge !== undefined ? p.shippingCharge : null,
        };
      });
    } catch (e) {
      return [];   // falls back to the plain zone rate
    }
  },
};
