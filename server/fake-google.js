function mergeEvent(event, patch) {
  return {
    ...event,
    ...patch,
    extendedProperties: patch.extendedProperties ? {
      ...event.extendedProperties,
      ...patch.extendedProperties,
      private: { ...(event.extendedProperties?.private || {}), ...(patch.extendedProperties?.private || {}) },
    } : event.extendedProperties,
  };
}

function createFakeGoogle({ connected = true } = {}) {
  let isConnected = connected;
  const events = [];
  const mails = [];
  let nextId = 1;
  return {
    events, mails,
    reset() { events.splice(0); mails.splice(0); nextId = 1; isConnected = connected; },
    async isConnected() { return isConnected; },
    setConnected(value) { isConnected = Boolean(value); },
    async authorizationUrl() { return '/__fake-google-consent'; },
    async exchangeCode() { return { email: 'gamboaesai@gmail.com', accessToken: 'fake', refreshToken: 'fake-refresh' }; },
    async saveCredential() { isConnected = true; },
    async listEvents(timeMin, timeMax) {
      const min = new Date(timeMin); const max = new Date(timeMax);
      return events.filter(event => {
        const start = new Date(event.start.dateTime || `${event.start.date}T00:00:00Z`);
        const end = new Date(event.end.dateTime || `${event.end.date}T00:00:00Z`);
        return start < max && min < end;
      }).map(event => structuredClone(event));
    },
    async createEvent(payload) {
      const event = { id: `fake-event-${nextId++}`, status: 'confirmed', ...structuredClone(payload) };
      events.push(event); return structuredClone(event);
    },
    async patchEvent(eventId, patch) {
      const index = events.findIndex(event => event.id === eventId);
      if (index < 0) throw new Error('Fake event not found.');
      events[index] = mergeEvent(events[index], structuredClone(patch));
      return structuredClone(events[index]);
    },
    async sendMail(message) { mails.push(structuredClone(message)); return { id: `fake-mail-${mails.length}` }; },
  };
}

module.exports = { createFakeGoogle };
