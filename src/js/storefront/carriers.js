/* =============================================================================
   Velorex Music — carrier metadata + logo badge helpers (storefront)
   Used by: index.html (order card carrier badge on the profile orders tab)

   Mirrored from track-order.html — keep both in sync if you add a carrier.
   `url` is the live tracking page template; {awb} is replaced by the
   tracking number at render time. `logo` is an inline SVG wordmark — self-
   contained, zero network requests, always renders.

   History: previously this used Clearbit's free logo API at
   logo.clearbit.com, but that endpoint was sunset after HubSpot's acquisition
   (DNS no longer resolves). Inline SVGs are now the source of truth.

   Loaded after src/js/utils.js (carrierBadgeHtml uses Utils.escape).
   ============================================================================= */

    const CARRIERS_META = {
      delhivery: {
        label: 'Delhivery',
        url: 'https://www.delhivery.com/track-v2/package/{awb}',
        logo: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 24" aria-hidden="true"><rect width="80" height="24" fill="#fff" rx="3"/><text x="40" y="17" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-weight="800" font-size="13" fill="#dd2c2c" letter-spacing="-0.5">delhivery</text></svg>'
      },
      bluedart: {
        label: 'Bluedart',
        url: 'https://www.bluedart.com/web/guest/trackdartresult?trackFor=0&trackNo={awb}',
        logo: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 24" aria-hidden="true"><rect width="80" height="24" fill="#fff" rx="3"/><text x="40" y="17" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-weight="800" font-size="12.5" letter-spacing="-0.3"><tspan fill="#00266b">Blue</tspan><tspan fill="#d50032">dart</tspan></text></svg>'
      },
      dtdc: {
        label: 'DTDC',
        url: 'https://www.dtdc.in/tracking/tracking_results.asp?strCnno={awb}&TrkType=cnno',
        logo: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 24" aria-hidden="true"><rect width="60" height="24" fill="#fff" rx="3"/><text x="30" y="18" text-anchor="middle" font-family="Arial Black, Helvetica, sans-serif" font-weight="900" font-size="15" fill="#f47521" letter-spacing="0.5">DTDC</text></svg>'
      },
      indiapost: {
        label: 'India Post',
        url: 'https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx',
        logo: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 24" aria-hidden="true"><rect width="90" height="24" fill="#fff" rx="3"/><text x="45" y="16" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-weight="800" font-size="11" fill="#003478" letter-spacing="0.3">INDIA POST</text></svg>'
      },
      fedex: {
        label: 'FedEx',
        url: 'https://www.fedex.com/fedextrack/?tracknumbers={awb}',
        logo: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 24" aria-hidden="true"><rect width="60" height="24" fill="#fff" rx="3"/><text x="30" y="18" text-anchor="middle" font-family="Arial Black, Helvetica, sans-serif" font-weight="900" font-size="14.5" letter-spacing="-0.5"><tspan fill="#4d148c">Fed</tspan><tspan fill="#ff6600">Ex</tspan></text></svg>'
      },
      dhl: {
        label: 'DHL',
        url: 'https://www.dhl.com/in-en/home/tracking/tracking-express.html?tracking-id={awb}',
        // DHL's iconic yellow background + red wordmark + red underline bar.
        logo: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 24" aria-hidden="true"><rect width="56" height="24" fill="#ffcc00" rx="3"/><text x="28" y="17" text-anchor="middle" font-family="Arial Black, Helvetica, sans-serif" font-weight="900" font-size="14" fill="#d40511" letter-spacing="-0.5">DHL</text><rect x="6" y="19" width="44" height="1.5" fill="#d40511"/></svg>'
      },
      other: {
        label: 'Carrier',
        url: null,
        logo: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 70 24" aria-hidden="true"><rect width="70" height="24" fill="#fff" rx="3"/><text x="35" y="17" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-weight="700" font-size="11" fill="#333">Carrier</text></svg>'
      }
    };
    function carrierMeta(id) { return CARRIERS_META[String(id || '').toLowerCase()] || null; }
    function carrierTrackingUrl(order) {
      if (!order) return null;
      if (order.trackingUrl) return order.trackingUrl;
      var m = carrierMeta(order.carrier);
      if (!m || !m.url || !order.trackingNumber) return null;
      return m.url.replace('{awb}', encodeURIComponent(order.trackingNumber));
    }
    // Small white/branded pill with an inline-SVG wordmark. tabindex=0 makes
    // the pill keyboard- and tap-focusable so the :focus tooltip rule fires
    // on mobile tap (no JS handler needed).
    function carrierBadgeHtml(id) {
      var m = carrierMeta(id);
      if (!m) return '';
      var label = Utils.escape(m.label);
      return '<span class="carrier-badge" tabindex="0" data-tooltip="' + label + '" aria-label="' + label + '">' +
        m.logo +
        '</span>';
    }
