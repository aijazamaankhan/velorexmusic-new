document.addEventListener('DOMContentLoaded', function () {
  const contactFeedback = document.getElementById('contact-feedback');
  const contactForm = document.getElementById('contact-form');

  if (!contactForm || !contactFeedback) return;

  function setContactFeedback(message, success) {
    contactFeedback.textContent = message;
    contactFeedback.style.display = 'block';
    contactFeedback.style.color = success ? '#d0f0d1' : '#ffb4b4';
    contactFeedback.style.background = success ? 'rgba(28, 98, 54, 0.18)' : 'rgba(133, 30, 33, 0.18)';
    contactFeedback.style.border = success ? '1px solid rgba(46, 204, 113, 0.35)' : '1px solid rgba(255, 99, 71, 0.35)';
    contactFeedback.style.borderRadius = '10px';
    contactFeedback.style.padding = '1rem';
  }

  contactForm.addEventListener('submit', async function (event) {
    event.preventDefault();

    const formData = {
      fullName: contactForm.elements.fullName.value.trim(),
      email: contactForm.elements.email.value.trim(),
      subject: contactForm.elements.subject.value,
      message: contactForm.elements.message.value.trim(),
    };

    try {
      const response = await fetch('/api/contact.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Unable to send your message.');
      }

      setContactFeedback(payload.message || 'Message sent successfully. We will get back to you soon.', true);
      contactForm.reset();
    } catch (error) {
      setContactFeedback(error?.message || 'Something went wrong. Please try again.', false);
    }
  });
});
