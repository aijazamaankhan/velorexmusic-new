/* =============================================================================
   Velorex Studio enquiry popup — opened from the footer credit
   ("Designed & developed by Velorex Studio IT Services") and from
   /velorex-studio.html. Styles: src/styles/components/studio-enquiry.css.
   Server: /api/studio-enquiry.php, which EMAILS the enquiry and stores nothing.

   Any element with [data-studio-enquiry] opens it. Those elements keep a real
   href to /velorex-studio.html, so without this script the link still works.
   ============================================================================= */
var StudioEnquiry = (function () {
  'use strict';

  var EMAIL = 'velorexdesign@gmail.com';
  var overlay = null, lastFocus = null;

  function build() {
    overlay = document.createElement('div');
    overlay.className = 'vs-overlay';
    overlay.hidden = true;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'vs-title');
    overlay.innerHTML =
      '<div class="vs-card">' +
        '<button type="button" class="vs-close" aria-label="Close"><i class="fas fa-xmark" aria-hidden="true"></i></button>' +
        '<div class="vs-body">' +
          '<p class="vs-eyebrow">Velorex Studio IT Services</p>' +
          '<h2 class="vs-title" id="vs-title">Tell us about your project</h2>' +
          '<p class="vs-sub">The team that designed and developed this store — the catalogue, checkout, admin panel and mobile app experience. Share your requirements and contact details; your enquiry is sent to Velorex Studio by email, and they reply by email.</p>' +
          '<ul class="vs-services">' +
            '<li><i class="fas fa-pen-ruler" aria-hidden="true"></i>Website design</li>' +
            '<li><i class="fas fa-cart-shopping" aria-hidden="true"></i>E-commerce stores</li>' +
            '<li><i class="fas fa-code" aria-hidden="true"></i>Web apps &amp; admin panels</li>' +
          '</ul>' +
          '<form class="vs-form" novalidate>' +
            '<div class="vs-grid">' +
              field('vs-name', 'Your name', true, '<input class="vs-input" id="vs-name" name="name" autocomplete="name" maxlength="120" required>') +
              field('vs-email', 'Email', true, '<input class="vs-input" id="vs-email" name="email" type="email" autocomplete="email" inputmode="email" maxlength="200" required>') +
              field('vs-phone', 'Mobile number', true, '<input class="vs-input" id="vs-phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="30" placeholder="+91 98765 43210" required>') +
              field('vs-company', 'Company / brand', false, '<input class="vs-input" id="vs-company" name="company" autocomplete="organization" maxlength="150">') +
              field('vs-type', 'What do you need?', false,
                '<select class="vs-input" id="vs-type" name="projectType">' +
                  opt('Website') + opt('E-commerce store') + opt('Web app / admin panel') +
                  opt('Mobile-friendly redesign') + opt('SEO & performance') + opt('Other') +
                '</select>') +
              field('vs-budget', 'Budget (optional)', false,
                '<select class="vs-input" id="vs-budget" name="budget">' +
                  '<option value="">Prefer not to say</option>' + opt('Under ₹25,000') + opt('₹25,000 – ₹75,000') +
                  opt('₹75,000 – ₹2,00,000') + opt('Above ₹2,00,000') +
                '</select>') +
              '<div class="vs-field vs-full">' +
                '<label class="vs-label" for="vs-message">Your requirements <b>*</b></label>' +
                '<textarea class="vs-input" id="vs-message" name="message" maxlength="4000" required placeholder="What should it do? Any sites you like, deadlines, features…"></textarea>' +
              '</div>' +
            '</div>' +
            '<div class="vs-hp" aria-hidden="true"><label>Website <input name="website" tabindex="-1" autocomplete="off"></label></div>' +
            '<div class="vs-status" role="alert" hidden></div>' +
            '<div class="vs-actions">' +
              '<button type="submit" class="vs-submit"><i class="fas fa-paper-plane" aria-hidden="true"></i> Send enquiry</button>' +
              '<p class="vs-fine">Prefer to write yourself? <a href="mailto:' + EMAIL + '">' + EMAIL + '</a></p>' +
            '</div>' +
          '</form>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    overlay.querySelector('.vs-close').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    overlay.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    overlay.querySelector('.vs-form').addEventListener('submit', submit);
  }

  function field(id, label, required, control) {
    return '<div class="vs-field"><label class="vs-label" for="' + id + '">' + label + (required ? ' <b>*</b>' : '') + '</label>' + control + '</div>';
  }
  function opt(v) { return '<option>' + v + '</option>'; }

  function setStatus(msg) {
    var s = overlay.querySelector('.vs-status');
    s.textContent = msg || '';
    s.className = 'vs-status' + (msg ? ' is-error' : '');
    s.hidden = !msg;
  }

  function submit(e) {
    e.preventDefault();
    var form = e.target, btn = form.querySelector('.vs-submit');
    var data = {};
    ['name', 'email', 'phone', 'company', 'projectType', 'budget', 'message', 'website'].forEach(function (k) {
      data[k] = form.elements[k] ? String(form.elements[k].value).trim() : '';
    });

    // Friendly checks first; the server re-validates everything.
    if (!data.name || !data.email || !data.phone || !data.message) return setStatus('Please fill in your name, email, mobile number and requirements.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return setStatus('Please enter a valid email address.');
    var digits = data.phone.replace(/\D+/g, '');
    if (digits.length < 7 || digits.length > 15) return setStatus('Please enter a valid mobile number.');

    setStatus('');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Sending…';

    fetch('/api/studio-enquiry.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; });
    }).then(function (res) {
      if (!res.ok || !res.j.ok) throw new Error(res.j.error || 'Your enquiry could not be sent. Please email ' + EMAIL + ' directly.');
      overlay.querySelector('.vs-body').innerHTML =
        '<div class="vs-done"><i class="fas fa-circle-check" aria-hidden="true"></i>' +
        '<h2 class="vs-title" style="margin-right:0">Enquiry sent</h2>' +
        '<p>Thank you, ' + escapeText(data.name) + '. Velorex Studio will reply to ' + escapeText(data.email) + '.</p>' +
        '<button type="button" class="vs-submit" style="width:100%">Done</button></div>';
      overlay.querySelector('.vs-done .vs-submit').addEventListener('click', close);
    }).catch(function (err) {
      setStatus(err && err.message ? err.message : 'Something went wrong. Please try again.');
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-paper-plane" aria-hidden="true"></i> Send enquiry';
    });
  }

  function escapeText(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }

  function open() {
    if (!overlay) build();
    // Re-opening after a successful send starts a fresh form.
    if (!overlay.querySelector('.vs-form')) { overlay.remove(); overlay = null; build(); }
    lastFocus = document.activeElement;
    overlay.hidden = false;
    document.documentElement.classList.add('vs-lock');
    requestAnimationFrame(function () { overlay.classList.add('is-open'); });
    var first = overlay.querySelector('#vs-name');
    if (first) setTimeout(function () { first.focus({ preventScroll: true }); }, 60);
  }

  function close() {
    if (!overlay || overlay.hidden) return;
    overlay.classList.remove('is-open');
    document.documentElement.classList.remove('vs-lock');
    setTimeout(function () { if (overlay) overlay.hidden = true; }, 200);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  // Delegated, so it also catches the footer link the SPA re-renders.
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-studio-enquiry]');
    if (!t || e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return; // let "open in new tab" work
    e.preventDefault();
    open();
  });

  return { open: open, close: close };
})();
