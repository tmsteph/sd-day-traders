(() => {
  const root = document.documentElement;
  const fullBookingApi = (root.dataset.bookingApi || '').trim();
  const mailApi = (root.dataset.bookingMailApi || '').trim();
  if (fullBookingApi || !mailApi) return;

  const form = document.querySelector('[data-booking-form]');
  const status = document.querySelector('[data-booking-status]');
  const summary = document.querySelector('[data-booking-summary]');
  const submit = form?.querySelector('button[type="submit"]');
  if (!form || !status || !summary || !submit) return;

  const honeypot = document.createElement('input');
  honeypot.type = 'text';
  honeypot.name = 'website';
  honeypot.autocomplete = 'off';
  honeypot.tabIndex = -1;
  honeypot.setAttribute('aria-hidden', 'true');
  honeypot.style.position = 'absolute';
  honeypot.style.left = '-10000px';
  honeypot.style.width = '1px';
  honeypot.style.height = '1px';
  form.append(honeypot);

  const clearRequestId = () => delete form.dataset.bookingRequestId;
  form.addEventListener('input', clearRequestId);
  form.addEventListener('change', clearRequestId);

  function requestId() {
    if (!form.dataset.bookingRequestId) {
      form.dataset.bookingRequestId = globalThis.crypto?.randomUUID?.()
        || `sddt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    return form.dataset.bookingRequestId;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();

    const selectedDay = document.querySelector('[data-calendar-grid] .calendar-day.is-selected');
    if (!selectedDay?.dataset.date) {
      status.textContent = 'Choose a date first.';
      return;
    }
    if (!form.reportValidity()) return;

    const data = new FormData(form);
    const time = String(data.get('time') || '');
    if (!time) {
      status.textContent = 'Choose a time first.';
      return;
    }

    submit.disabled = true;
    status.textContent = 'Sending your request…';

    try {
      const response = await fetch(mailApi, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': requestId(),
        },
        body: JSON.stringify({
          mode: 'booking-request',
          name: String(data.get('name') || ''),
          email: String(data.get('email') || ''),
          topic: String(data.get('topic') || ''),
          date: selectedDay.dataset.date,
          time,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
          summary: summary.textContent || '',
          website: String(data.get('website') || ''),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to send the request automatically.');

      if (Array.isArray(payload.warnings) && payload.warnings.includes('customer_ack_failed')) {
        status.textContent = 'Request received. Esai has it. Your email copy could not be delivered, but you do not need to do anything else.';
      } else {
        status.textContent = 'Request received. Esai will review it. Check your email for a copy — you do not need to send anything.';
      }
      submit.textContent = 'Request sent';
    } catch (error) {
      status.textContent = "We couldn't send automatically. Please try again in a moment.";
      submit.disabled = false;
    }
  }, true);
})();
