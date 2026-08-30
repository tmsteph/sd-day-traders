const yearNode = document.querySelector("#year");

if (yearNode) {
  yearNode.textContent = new Date().getFullYear();
}

const revealNodes = document.querySelectorAll("[data-reveal]");

if ("IntersectionObserver" in window && revealNodes.length > 0) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.18 }
  );

  revealNodes.forEach((node) => observer.observe(node));
} else {
  revealNodes.forEach((node) => node.classList.add("is-visible"));
}

const bookingForm = document.querySelector("[data-booking-form]");
const calendarGrid = document.querySelector("[data-calendar-grid]");
const calendarMonth = document.querySelector("[data-calendar-month]");
const previousMonthButton = document.querySelector("[data-calendar-prev]");
const nextMonthButton = document.querySelector("[data-calendar-next]");
const bookingSummary = document.querySelector("[data-booking-summary]");
const bookingStatus = document.querySelector("[data-booking-status]");

if (
  bookingForm &&
  calendarGrid &&
  calendarMonth &&
  previousMonthButton &&
  nextMonthButton &&
  bookingSummary &&
  bookingStatus
) {
  const PACIFIC_TIME_ZONE = "America/Los_Angeles";
  const visitorTimeZone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || PACIFIC_TIME_ZONE;
  const timezoneNote = document.querySelector("[data-timezone-note]");
  const timeSelect = bookingForm.elements.time;
  const bookingApiBase = (document.documentElement.dataset.bookingApi || "").replace(/\/$/, "");
  const bookingApiEnabled = Boolean(bookingApiBase);
  const bookingRecipient = "gamboaesai@gmail.com";
  const bookingSubmitButton = bookingForm.querySelector('button[type="submit"]');
  let busyRanges = [];
  let availabilityState = "idle";

  const apiUrl = (path) => `${bookingApiBase}${path}`;
  const rangesOverlap = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;
  const slotIsBusy = (instant) => {
    const end = new Date(instant.getTime() + 60 * 60 * 1000);
    return busyRanges.some((range) => {
      const start = new Date(range.start);
      const stop = new Date(range.end);
      return !Number.isNaN(start.getTime()) && !Number.isNaN(stop.getTime()) && rangesOverlap(instant, end, start, stop);
    });
  };

  const getZonedParts = (date, timeZone) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    return {
      year: Number(values.year),
      month: Number(values.month),
      day: Number(values.day),
      hour: Number(values.hour),
      minute: Number(values.minute),
    };
  };

  const formatDateKeyFromParts = ({ year, month, day }) =>
    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const getPacificClock = () => getZonedParts(new Date(), PACIFIC_TIME_ZONE);

  const makePacificInstant = (dateKey, timeValue) => {
    const [year, month, day] = dateKey.split("-").map(Number);
    const [hour, minute] = timeValue.split(":").map(Number);
    const utcGuess = Date.UTC(year, month - 1, day, hour, minute);
    const zonedGuess = getZonedParts(new Date(utcGuess), PACIFIC_TIME_ZONE);
    const zonedAsUtc = Date.UTC(
      zonedGuess.year,
      zonedGuess.month - 1,
      zonedGuess.day,
      zonedGuess.hour,
      zonedGuess.minute
    );
    const offsetMs = zonedAsUtc - utcGuess;
    return new Date(utcGuess - offsetMs);
  };

  const formatTime = (date, timeZone) =>
    new Intl.DateTimeFormat(undefined, {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
    }).format(date);

  const formatDateTime = (date, timeZone) =>
    new Intl.DateTimeFormat(undefined, {
      timeZone,
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);

  const formatShortDate = (date, timeZone) =>
    new Intl.DateTimeFormat(undefined, {
      timeZone,
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(date);

  const initialPacificClock = getPacificClock();
  const today = new Date(
    initialPacificClock.year,
    initialPacificClock.month - 1,
    initialPacificClock.day
  );
  today.setHours(0, 0, 0, 0);

  let visibleMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  let selectedDate = "";

  const formatDateKey = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const getSelectedInstant = () => {
    if (!selectedDate || !timeSelect.value) return null;
    return makePacificInstant(selectedDate, timeSelect.value);
  };

  const renderTimeOptions = () => {
    Array.from(timeSelect.options).forEach((option, index) => {
      if (index === 0) return;
      if (!selectedDate) {
        option.disabled = true;
        return;
      }

      const instant = makePacificInstant(selectedDate, option.value);
      const localTime = formatTime(instant, visitorTimeZone);
      const pacificTime = formatTime(instant, PACIFIC_TIME_ZONE);
      const localDateKey = formatDateKeyFromParts(getZonedParts(instant, visitorTimeZone));

      if (visitorTimeZone === PACIFIC_TIME_ZONE) {
        option.textContent = `${pacificTime} PT`;
      } else if (localDateKey === selectedDate) {
        option.textContent = `${localTime} local · ${pacificTime} PT`;
      } else {
        option.textContent = `${localTime} ${formatShortDate(instant, visitorTimeZone)} local · ${pacificTime} PT`;
      }

      option.disabled =
        instant <= new Date() ||
        (bookingApiEnabled && (availabilityState !== "ready" || slotIsBusy(instant)));
    });

    if (timeSelect.selectedOptions[0]?.disabled) {
      timeSelect.value = "";
    }
  };


  const loadAvailabilityForDate = async (dateKey) => {
    if (!bookingApiEnabled) {
      availabilityState = "ready";
      busyRanges = [];
      renderTimeOptions();
      return;
    }
    availabilityState = "loading";
    busyRanges = [];
    renderTimeOptions();
    bookingStatus.textContent = "Checking Esai's calendar…";
    const from = makePacificInstant(dateKey, "08:00");
    const to = makePacificInstant(dateKey, "20:00");
    try {
      const response = await fetch(
        apiUrl(`/api/availability?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`),
        { credentials: "include" }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to verify availability.");
      busyRanges = Array.isArray(payload.busy) ? payload.busy : [];
      availabilityState = "ready";
      bookingStatus.textContent = "";
    } catch (error) {
      availabilityState = "error";
      busyRanges = [];
      bookingStatus.textContent = "Live availability could not be verified. Please try again shortly.";
    }
    renderTimeOptions();
    updateSummary();
  };

  const updateSummary = () => {
    const topic = bookingForm.elements.topic.value;

    if (!selectedDate) {
      bookingSummary.textContent = "Select a day to build your request.";
      return;
    }

    const selectedInstant = getSelectedInstant();
    if (!selectedInstant) {
      const pacificNoon = makePacificInstant(selectedDate, "12:00");
      bookingSummary.textContent = `${formatShortDate(pacificNoon, PACIFIC_TIME_ZONE)} · choose a local time`;
      return;
    }

    const localDateTime = formatDateTime(selectedInstant, visitorTimeZone);
    const pacificDateTime = formatDateTime(selectedInstant, PACIFIC_TIME_ZONE);
    const details = visitorTimeZone === PACIFIC_TIME_ZONE
      ? [`${pacificDateTime} PT`]
      : [`${localDateTime} (${visitorTimeZone})`, `${pacificDateTime} PT`];
    if (topic) details.push(topic);
    bookingSummary.textContent = details.join(" · ");
  };

  const renderCalendar = () => {
    calendarGrid.replaceChildren();
    calendarMonth.textContent = visibleMonth.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });

    const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    previousMonthButton.disabled = visibleMonth <= currentMonth;

    const gridStart = new Date(
      visibleMonth.getFullYear(),
      visibleMonth.getMonth(),
      1 - visibleMonth.getDay()
    );

    for (let index = 0; index < 42; index += 1) {
      const date = new Date(
        gridStart.getFullYear(),
        gridStart.getMonth(),
        gridStart.getDate() + index
      );
      const dateKey = formatDateKey(date);
      const isOutsideMonth =
        date.getFullYear() !== visibleMonth.getFullYear() ||
        date.getMonth() !== visibleMonth.getMonth();
      if (date < today) {
        const spacer = document.createElement("span");
        spacer.className = "calendar-day calendar-day-empty";
        spacer.setAttribute("aria-hidden", "true");
        calendarGrid.append(spacer);
        continue;
      }

      const button = document.createElement("button");
      button.type = "button";
      button.className = "calendar-day";
      button.textContent = String(date.getDate());
      button.dataset.date = dateKey;
      button.setAttribute(
        "aria-label",
        date.toLocaleDateString(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      );

      if (isOutsideMonth) {
        button.style.opacity = "0.45";
        button.dataset.outsideMonth = "true";
      }

      if (dateKey === formatDateKey(today)) {
        button.classList.add("is-today");
      }

      if (dateKey === selectedDate) {
        button.classList.add("is-selected");
        button.setAttribute("aria-pressed", "true");
      } else {
        button.setAttribute("aria-pressed", "false");
      }

      button.addEventListener("click", async () => {
        selectedDate = dateKey;
        timeSelect.value = "";
        availabilityState = "loading";
        busyRanges = [];
        renderTimeOptions();

        if (isOutsideMonth) {
          visibleMonth = new Date(date.getFullYear(), date.getMonth(), 1);
        }

        renderCalendar();
        updateSummary();
        if (bookingApiEnabled) {
          await loadAvailabilityForDate(dateKey);
        } else {
          availabilityState = "ready";
          renderTimeOptions();
        }
      });

      calendarGrid.append(button);
    }
  };

  previousMonthButton.addEventListener("click", () => {
    const previousMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1);
    const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    if (previousMonth < currentMonth) return;
    visibleMonth = previousMonth;
    renderCalendar();
  });

  nextMonthButton.addEventListener("click", () => {
    visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
    renderCalendar();
  });

  timeSelect.addEventListener("change", updateSummary);
  bookingForm.elements.topic.addEventListener("change", updateSummary);

  bookingForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    bookingStatus.textContent = "";

    if (!selectedDate) {
      bookingStatus.textContent = "Choose a date first.";
      return;
    }
    if (availabilityState !== "ready") {
      bookingStatus.textContent = "Please wait until live availability is verified.";
      return;
    }
    if (!bookingForm.reportValidity()) return;

    const selectedInstant = getSelectedInstant();
    if (!bookingApiEnabled) {
      const formData = new FormData(bookingForm);
      const localDateTime = formatDateTime(selectedInstant, visitorTimeZone);
      const pacificDateTime = formatDateTime(selectedInstant, PACIFIC_TIME_ZONE);
      const subject = `SD Day Traders consultation request — ${pacificDateTime} PT`;
      const body = [
        "Hello Esai,",
        "",
        "I'd like to request a consultation.",
        "",
        `Customer time: ${localDateTime} (${visitorTimeZone})`,
        `Pacific time: ${pacificDateTime} PT`,
        `Focus: ${formData.get("topic")}`,
        `Name: ${formData.get("name")}`,
        `Email: ${formData.get("email")}`,
        "",
        "Please confirm whether this time is available.",
      ].join("\n");
      bookingStatus.textContent = "Your request is ready. Your email app is opening — tap Send to deliver it to Esai.";
      window.location.href = `mailto:${bookingRecipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      return;
    }
    if (!selectedInstant || slotIsBusy(selectedInstant)) {
      bookingStatus.textContent = "That time is no longer available. Choose another time.";
      renderTimeOptions();
      return;
    }

    const formData = new FormData(bookingForm);
    bookingSubmitButton.disabled = true;
    bookingStatus.textContent = "Sending your request…";
    try {
      const response = await fetch(apiUrl("/api/bookings/request"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start: selectedInstant.toISOString(),
          timeZone: visitorTimeZone,
          topic: formData.get("topic"),
          name: formData.get("name"),
          email: formData.get("email"),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok && response.status !== 202) throw new Error(payload.error || "Unable to send request.");
      const successMessage = payload.warnings?.length
        ? "Your request is saved and pending Esai's approval. One notification had a delivery issue, but the request is safely recorded."
        : "Request received. Esai will review it before the appointment is confirmed.";
      await loadAvailabilityForDate(selectedDate);
      bookingStatus.textContent = successMessage;
    } catch (error) {
      const errorMessage = error.message || "We couldn't safely record that request. Please try again.";
      if (selectedDate) await loadAvailabilityForDate(selectedDate);
      bookingStatus.textContent = errorMessage;
    } finally {
      bookingSubmitButton.disabled = false;
    }
  });

  if (timezoneNote) {
    timezoneNote.textContent = visitorTimeZone === PACIFIC_TIME_ZONE
      ? "Times are shown in Pacific Time."
      : `Times are shown in your timezone (${visitorTimeZone}); Esai receives the Pacific equivalent.`;
  }

  renderTimeOptions();
  renderCalendar();
  updateSummary();
}
