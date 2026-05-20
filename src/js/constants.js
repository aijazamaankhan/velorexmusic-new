/* =============================================================================
   Velorex Music — storefront constants
   Used by: index.html (and any storefront-context module that needs
   country/state lookups)

   This file is loaded as a plain <script src=...> (NOT type="module").
   Top-level `const` declarations are visible in script-scope to subsequent
   <script> blocks and to inline onclick= handlers.

   Contents:
     - COUNTRIES       — shipping destinations, India first by design.
     - IN_STATES       — India 28 + 8 UTs, used by address forms.
     - US_STATES       — 50 + DC.
     - STATE_REQUIRED  — countries where the form requires a state value.
     - POSTAL_REQUIRED — countries where the form requires a postal code.
     - PEOPLE_LABELS   — slug → display name for the products page People
                         filter (R.D. Burman, etc.).
   API_BASE lives separately at src/js/api-base.js — both storefront and
   admin need it, but admin doesn't pull in this file.
   ============================================================================= */

// ISO-3166-1 alpha-2 list of common shipping destinations. India is intentionally
// first so it's the default selection for the storefront.
const COUNTRIES = [
  ['IN', 'India'], ['US', 'United States'], ['GB', 'United Kingdom'], ['CA', 'Canada'],
  ['AU', 'Australia'], ['AE', 'United Arab Emirates'], ['SG', 'Singapore'], ['DE', 'Germany'],
  ['FR', 'France'], ['IT', 'Italy'], ['ES', 'Spain'], ['NL', 'Netherlands'], ['BE', 'Belgium'],
  ['CH', 'Switzerland'], ['AT', 'Austria'], ['IE', 'Ireland'], ['SE', 'Sweden'], ['NO', 'Norway'],
  ['DK', 'Denmark'], ['FI', 'Finland'], ['PL', 'Poland'], ['PT', 'Portugal'], ['GR', 'Greece'],
  ['CZ', 'Czechia'], ['HU', 'Hungary'], ['RO', 'Romania'], ['NZ', 'New Zealand'],
  ['JP', 'Japan'], ['KR', 'South Korea'], ['HK', 'Hong Kong'], ['TW', 'Taiwan'], ['MY', 'Malaysia'],
  ['TH', 'Thailand'], ['VN', 'Vietnam'], ['ID', 'Indonesia'], ['PH', 'Philippines'],
  ['BD', 'Bangladesh'], ['LK', 'Sri Lanka'], ['NP', 'Nepal'], ['BT', 'Bhutan'], ['MV', 'Maldives'],
  ['PK', 'Pakistan'], ['SA', 'Saudi Arabia'], ['QA', 'Qatar'], ['KW', 'Kuwait'], ['OM', 'Oman'],
  ['BH', 'Bahrain'], ['IL', 'Israel'], ['TR', 'Turkey'], ['EG', 'Egypt'], ['ZA', 'South Africa'],
  ['KE', 'Kenya'], ['NG', 'Nigeria'], ['MA', 'Morocco'], ['BR', 'Brazil'], ['MX', 'Mexico'],
  ['AR', 'Argentina'], ['CL', 'Chile'], ['CO', 'Colombia'], ['PE', 'Peru'], ['RU', 'Russia'],
  ['UA', 'Ukraine'], ['CN', 'China'],
];

// 28 states + 8 UTs.
const IN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan',
  'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

const US_STATES = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'],
  ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'], ['DC', 'District of Columbia'],
  ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'],
  ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'],
  ['ME', 'Maine'], ['MD', 'Maryland'], ['MA', 'Massachusetts'], ['MI', 'Michigan'],
  ['MN', 'Minnesota'], ['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'],
  ['NE', 'Nebraska'], ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'],
  ['NM', 'New Mexico'], ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'],
  ['OH', 'Ohio'], ['OK', 'Oklahoma'], ['OR', 'Oregon'], ['PA', 'Pennsylvania'],
  ['RI', 'Rhode Island'], ['SC', 'South Carolina'], ['SD', 'South Dakota'], ['TN', 'Tennessee'],
  ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'],
  ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
];

// Countries where the address form requires a state/region (not optional).
const STATE_REQUIRED = new Set(['IN', 'US', 'CA', 'AU']);
// Postal codes are required in these countries; optional elsewhere.
const POSTAL_REQUIRED = new Set(['IN', 'US', 'CA', 'GB', 'AU', 'DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'CH', 'AT', 'JP', 'KR', 'SG', 'PT', 'CZ', 'PL']);

// Maps the people-filter slug used in URLs/queries to a human-readable
// display label. Used on the products page filter sidebar and in active-
// filter chips.
const PEOPLE_LABELS = {
  'rd-burman': 'R.D. Burman',
  'ar-rahman': 'A.R. Rahman',
  'laxmikant-pyarelal': 'Laxmikant-Pyarelal',
  'jatin-lalit': 'Jatin-Lalit',
  'shankar-ehsaan-loy': 'Shankar-Ehsaan-Loy',
  'anu-malik': 'Anu Malik',
  'anupam-roy': 'Anupam Roy',
  'lata-mangeshkar': 'Lata Mangeshkar',
  'mukesh': 'Mukesh',
  'udit-narayan': 'Udit Narayan',
  'arijit-singh': 'Arijit Singh',
  'pink-floyd': 'Pink Floyd',
  'michael-jackson': 'Michael Jackson',
  'beatles': 'The Beatles',
  'fleetwood-mac': 'Fleetwood Mac',
  'adele': 'Adele',
  'ed-sheeran': 'Ed Sheeran',
  'bruce-springsteen': 'Bruce Springsteen',
  'nirvana': 'Nirvana',
  'amitabh-bachchan': 'Amitabh Bachchan',
  'shahrukh-khan': 'Shah Rukh Khan',
  'aamir-khan': 'Aamir Khan',
  'ranveer-singh': 'Ranveer Singh',
  'kajol': 'Kajol',
  'deepika-padukone': 'Deepika Padukone',
  'ss-rajamouli': 'S.S. Rajamouli',
  'christopher-nolan': 'Christopher Nolan',
  'francis-ford-coppola': 'Francis Ford Coppola',
  'ashutosh-gowariker': 'Ashutosh Gowariker',
  'yash-chopra': 'Yash Chopra'
};
