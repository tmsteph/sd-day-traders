const { randomUUID } = require('node:crypto');

const PACIFIC_TIME_ZONE = 'America/Los_Angeles';
const SLOT_MINUTES = 60;
const ALLOWED_STARTS = new Set(['09:00', '10:30', '12:00', '13:30', '15:00', '16:30', '18:00']);
const DAY_MS = 86400000;

function clean(value, max = 300) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function validEmail(value) {
  const email = clean(value, 254).toLowerCase();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) ? email : '';
}

function safeTimeZone(value) {
  const zone = clean(value, 100) || 'UTC';
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(new Date()); return zone; } catch { return 'UTC'; }
}

function zonedParts(instant, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

function formatDateTime(instant, timeZone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(instant);
}

function eventRange(event) {
  const startRaw = event?.start?.dateTime || (event?.start?.date ? `${event.start.date}T00:00:00Z` : '');
  const endRaw = event?.end?.dateTime || (event?.end?.date ? `${event.end.date}T00:00:00Z` : '');
  const start = new Date(startRaw);
  const end = new Date(endRaw);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return { start, end };
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

function isBlocking(event) {
  return event?.status !== 'cancelled' && event?.transparency !== 'transparent';
}

function eventMeta(event) {
  return event?.extendedProperties?.private || {};
}

function isAllowedSlot(start, now = new Date()) {
  if (!(start instanceof Date) || Number.isNaN(start.getTime())) return false;
  if (start.getTime() <= now.getTime() + 5 * 60000) return false;
  if (start.getTime() > now.getTime() + 90 * DAY_MS) return false;
  const p = zonedParts(start, PACIFIC_TIME_ZONE);
  return ALLOWED_STARTS.has(`${p.hour}:${p.minute}`);
}

function requestEventPayload(input, start) {
  const end = new Date(start.getTime() + SLOT_MINUTES * 60000);
  const customerTimeZone = safeTimeZone(input.timeZone);
  return {
    summary: `[PENDING] ${clean(input.topic, 80)} — ${clean(input.name, 80)}`,
    description: [
      'SD Day Traders consultation request',
      `Customer: ${clean(input.name, 120)}`,
      `Email: ${validEmail(input.email)}`,
      `Topic: ${clean(input.topic, 120)}`,
      `Customer time: ${formatDateTime(start, customerTimeZone)}`,
      `Pacific time: ${formatDateTime(start, PACIFIC_TIME_ZONE)}`,
    ].join('\n'),
    start: { dateTime: start.toISOString(), timeZone: PACIFIC_TIME_ZONE },
    end: { dateTime: end.toISOString(), timeZone: PACIFIC_TIME_ZONE },
    transparency: 'opaque',
    visibility: 'private',
    extendedProperties: { private: {
      sddtKind: 'consultation',
      sddtStatus: 'pending',
      sddtCustomerName: clean(input.name, 120),
      sddtCustomerEmail: validEmail(input.email),
      sddtCustomerTimeZone: customerTimeZone,
      sddtTopic: clean(input.topic, 120),
      sddtRequestedAt: new Date().toISOString(),
      sddtNonce: randomUUID(),
    } },
  };
}

function createBookingService({ google, adminEmail, publicOrigin = 'https://sd-day-traders.3dvr.tech', now = () => new Date() }) {
  if (!google) throw new Error('Google adapter is required.');
  const organizer = validEmail(adminEmail);
  if (!organizer) throw new Error('A valid SDDT_ADMIN_EMAIL is required.');

  async function eventsAround(start, end) {
    return google.listEvents(new Date(start.getTime() - DAY_MS).toISOString(), new Date(end.getTime() + DAY_MS).toISOString());
  }

  async function slotIsFree(start, end, excludeId = '') {
    const events = await eventsAround(start, end);
    return !events.some(event => {
      if (event.id === excludeId || !isBlocking(event)) return false;
      const range = eventRange(event);
      return range ? overlaps(start, end, range.start, range.end) : false;
    });
  }

  function adminLink(eventId, action = 'review') {
    const base = publicOrigin.replace(/\/$/, '');
    return `${base}/admin/?request=${encodeURIComponent(eventId)}&action=${encodeURIComponent(action)}`;
  }

  function notificationText(event) {
    const meta = eventMeta(event);
    const start = new Date(event.start.dateTime);
    return [
      'New SD Day Traders consultation request', '',
      `Customer: ${meta.sddtCustomerName}`,
      `Email: ${meta.sddtCustomerEmail}`,
      `Topic: ${meta.sddtTopic}`,
      `Customer time: ${formatDateTime(start, safeTimeZone(meta.sddtCustomerTimeZone))}`,
      `Pacific time: ${formatDateTime(start, PACIFIC_TIME_ZONE)}`, '',
      `Review & approve: ${adminLink(event.id, 'approve')}`,
      `Ask to reschedule: ${adminLink(event.id, 'reschedule')}`,
      `Decline: ${adminLink(event.id, 'decline')}`, '',
      'Opening a link does not change the booking. You will confirm the action after signing in.',
    ].join('\n');
  }

  async function request(input) {
    const email = validEmail(input?.email);
    const name = clean(input?.name, 120);
    const topic = clean(input?.topic, 120);
    const start = new Date(input?.start || '');
    if (!email || !name || !topic || !isAllowedSlot(start, now())) {
      const error = new Error('Invalid booking request.'); error.status = 400; throw error;
    }
    const end = new Date(start.getTime() + SLOT_MINUTES * 60000);
    if (!(await slotIsFree(start, end))) {
      const error = new Error('That time is no longer available.'); error.status = 409; throw error;
    }
    const event = await google.createEvent(requestEventPayload({ ...input, email, name, topic }, start));
    const warnings = [];
    try {
      await google.sendMail({ to: organizer, subject: `Consultation request — ${name}`, text: notificationText(event) });
    } catch (error) { warnings.push(`Organizer notification failed: ${error.message}`); }
    try {
      await google.sendMail({
        to: email,
        subject: 'SD Day Traders request received',
        text: [
          `Hi ${name},`, '',
          'We received your consultation request. It is not confirmed yet.',
          `Requested time: ${formatDateTime(start, safeTimeZone(input.timeZone))}`,
          `Pacific time: ${formatDateTime(start, PACIFIC_TIME_ZONE)}`, '',
          'Esai will review it and email you after he approves, declines, or suggests another time.',
        ].join('\n'),
      });
    } catch (error) { warnings.push(`Customer acknowledgement failed: ${error.message}`); }
    return { requestId: event.id, status: 'pending', warnings };
  }

  async function availability(from, to) {
    const start = new Date(from); const end = new Date(to);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      const error = new Error('Invalid availability range.'); error.status = 400; throw error;
    }
    const events = await google.listEvents(start.toISOString(), end.toISOString());
    return events.filter(isBlocking).map(event => {
      const range = eventRange(event);
      return range && { start: range.start.toISOString(), end: range.end.toISOString() };
    }).filter(Boolean);
  }

  async function findRequest(eventId) {
    const events = await google.listEvents(new Date(now().getTime() - 120 * DAY_MS).toISOString(), new Date(now().getTime() + 365 * DAY_MS).toISOString());
    const event = events.find(item => item.id === eventId && eventMeta(item).sddtKind === 'consultation');
    if (!event) { const error = new Error('Request not found.'); error.status = 404; throw error; }
    return event;
  }

  function publicRequest(event) {
    const meta = eventMeta(event); const start = new Date(event.start.dateTime);
    return {
      id: event.id,
      status: meta.sddtStatus || 'pending',
      customerName: meta.sddtCustomerName,
      customerEmail: meta.sddtCustomerEmail,
      customerTimeZone: meta.sddtCustomerTimeZone,
      topic: meta.sddtTopic,
      start: start.toISOString(),
      end: new Date(event.end.dateTime).toISOString(),
      customerTime: formatDateTime(start, safeTimeZone(meta.sddtCustomerTimeZone)),
      pacificTime: formatDateTime(start, PACIFIC_TIME_ZONE),
    };
  }

  async function listRequests() {
    const events = await google.listEvents(new Date(now().getTime() - 30 * DAY_MS).toISOString(), new Date(now().getTime() + 180 * DAY_MS).toISOString());
    return events.filter(event => eventMeta(event).sddtKind === 'consultation').map(publicRequest).sort((a, b) => a.start.localeCompare(b.start));
  }

  async function approve(eventId) {
    let event = await findRequest(eventId); let meta = eventMeta(event);
    if (meta.sddtStatus !== 'confirmed') {
      const range = eventRange(event);
      if (!range || !(await slotIsFree(range.start, range.end, event.id))) {
        const error = new Error('That slot became unavailable. Ask the customer to reschedule.'); error.status = 409; throw error;
      }
      event = await google.patchEvent(event.id, {
        summary: `${meta.sddtTopic} — ${meta.sddtCustomerName}`,
        attendees: [{ email: meta.sddtCustomerEmail }],
        extendedProperties: { private: { ...meta, sddtStatus: 'confirmed', sddtConfirmedAt: now().toISOString() } },
      }, { sendUpdates: 'all' });
      meta = eventMeta(event);
    }
    if (meta.sddtConfirmationSent !== '1') {
      const start = new Date(event.start.dateTime);
      await google.sendMail({
        to: meta.sddtCustomerEmail,
        subject: 'SD Day Traders consultation confirmed',
        text: `Your consultation with Esai is confirmed for ${formatDateTime(start, safeTimeZone(meta.sddtCustomerTimeZone))} (${formatDateTime(start, PACIFIC_TIME_ZONE)}). A calendar invitation has also been sent.`,
      });
      event = await google.patchEvent(event.id, {
        extendedProperties: { private: { ...eventMeta(event), sddtConfirmationSent: '1' } },
      });
    }
    return publicRequest(event);
  }

  async function reschedule(eventId, message = '') {
    let event = await findRequest(eventId); let meta = eventMeta(event);
    if (meta.sddtStatus !== 'reschedule_requested') {
      event = await google.patchEvent(event.id, {
        summary: `[RESCHEDULE] ${meta.sddtTopic} — ${meta.sddtCustomerName}`,
        transparency: 'transparent',
        extendedProperties: { private: { ...meta, sddtStatus: 'reschedule_requested', sddtRescheduleAt: now().toISOString() } },
      });
      meta = eventMeta(event);
    }
    if (meta.sddtRescheduleSent !== '1') {
      const start = new Date(event.start.dateTime);
      const text = clean(message, 4000) || `Hi ${meta.sddtCustomerName},\n\nEsai needs to find another time for your consultation originally requested for ${formatDateTime(start, safeTimeZone(meta.sddtCustomerTimeZone))}. Please reply with another time that works for you.\n\nThanks.`;
      await google.sendMail({ to: meta.sddtCustomerEmail, subject: 'Can we reschedule your SD Day Traders consultation?', text });
      event = await google.patchEvent(event.id, {
        extendedProperties: { private: { ...eventMeta(event), sddtRescheduleSent: '1' } },
      });
    }
    return publicRequest(event);
  }

  async function decline(eventId, message = '') {
    let event = await findRequest(eventId); let meta = eventMeta(event);
    if (meta.sddtStatus !== 'declined') {
      event = await google.patchEvent(event.id, {
        summary: `[DECLINED] ${meta.sddtTopic} — ${meta.sddtCustomerName}`,
        transparency: 'transparent',
        extendedProperties: { private: { ...meta, sddtStatus: 'declined', sddtDeclinedAt: now().toISOString() } },
      });
      meta = eventMeta(event);
    }
    if (meta.sddtDeclineSent !== '1') {
      const text = clean(message, 4000) || `Hi ${meta.sddtCustomerName},\n\nEsai isn't able to confirm that consultation request. Please feel free to request another time.\n\nThanks.`;
      await google.sendMail({ to: meta.sddtCustomerEmail, subject: 'SD Day Traders consultation request update', text });
      event = await google.patchEvent(event.id, {
        extendedProperties: { private: { ...eventMeta(event), sddtDeclineSent: '1' } },
      });
    }
    return publicRequest(event);
  }

  async function createBlock({ start, end, title }) {
    const from = new Date(start); const to = new Date(end);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
      const error = new Error('Invalid unavailable block.'); error.status = 400; throw error;
    }
    const event = await google.createEvent({
      summary: `[UNAVAILABLE] ${clean(title, 100) || 'Unavailable'}`,
      start: { dateTime: from.toISOString(), timeZone: PACIFIC_TIME_ZONE },
      end: { dateTime: to.toISOString(), timeZone: PACIFIC_TIME_ZONE },
      transparency: 'opaque', visibility: 'private',
      extendedProperties: { private: { sddtKind: 'unavailable' } },
    });
    return { id: event.id, start: from.toISOString(), end: to.toISOString(), title: clean(title, 100) || 'Unavailable' };
  }

  async function listBlocks() {
    const events = await google.listEvents(now().toISOString(), new Date(now().getTime() + 180 * DAY_MS).toISOString());
    return events.filter(event => eventMeta(event).sddtKind === 'unavailable').map(event => ({
      id: event.id, title: String(event.summary || '').replace(/^\[UNAVAILABLE\]\s*/, ''),
      start: event.start.dateTime, end: event.end.dateTime,
    }));
  }

  async function removeBlock(eventId) {
    const events = await google.listEvents(now().toISOString(), new Date(now().getTime() + 365 * DAY_MS).toISOString());
    const event = events.find(item => item.id === eventId && eventMeta(item).sddtKind === 'unavailable');
    if (!event) { const error = new Error('Unavailable block not found.'); error.status = 404; throw error; }
    const meta = eventMeta(event);
    await google.patchEvent(event.id, { transparency: 'transparent', summary: `[REMOVED] ${event.summary}`, extendedProperties: { private: { ...meta, sddtKind: 'removed-unavailable' } } });
    return { removed: true };
  }

  return { request, availability, listRequests, approve, reschedule, decline, createBlock, listBlocks, removeBlock, formatDateTime, PACIFIC_TIME_ZONE };
}

module.exports = { createBookingService, isAllowedSlot, eventRange, overlaps, PACIFIC_TIME_ZONE, SLOT_MINUTES };
