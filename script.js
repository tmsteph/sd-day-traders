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
  const calendarWeekdays = document.querySelector(".calendar-weekdays");
  const calendarToolbar = calendarMonth.closest(".calendar-toolbar");
  let busyRanges = [];
  let availabilityState = bookingApiEnabled ? "idle" : "ready";

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

  const windowEnd = new Date(today);
  windowEnd.setDate(windowEnd.getDate() + 30);
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  let selectedDate = "";

  const formatDateKey = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const candidateTimeValues = Array.from(timeSelect.options)
    .slice(1)
    .map((option) => option.value)
    .filter(Boolean);

  const getSelectedInstant = () => {
    if (!selectedDate || !timeSelect.value) return null;
    return makePacificInstant(selectedDate, timeSelect.value);
  };

  const dateHasBookableSlot = (dateKey) =>
    candidateTimeValues.some((value) => {
      const instant = makePacificInstant(dateKey, value);
      if (instant <= new Date()) return false;
      if (!bookingApiEnabled || availabilityState !== "ready") return !bookingApiEnabled;
      return !slotIsBusy(instant);
    });

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

  const createDateButton = (date) => {
    const dateKey = formatDateKey(date);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-day";
    button.dataset.date = dateKey;
    button.style.display = "grid";
    button.style.gap = "0.1rem";
    button.style.minHeight = "4rem";
    button.style.padding = "0.55rem 0.4rem";

    const weekday = document.createElement("span");
    weekday.textContent = date.toLocaleDateString(undefined, { weekday: "short" });
    weekday.style.fontSize = "0.72rem";
    weekday.style.fontWeight = "600";
    weekday.style.opacity = "0.68";

    const day = document.createElement("span");
    day.textContent = String(date.getDate());
    day.style.fontSize = "1.05rem";

    button.append(weekday, day);
    button.setAttribute(
      "aria-label",
      date.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    );

    if (dateKey === formatDateKey(today)) {
      button.classList.add("is-today");
    }

    if (dateKey === selectedDate) {
      button.classList.add("is-selected");
      button.setAttribute("aria-pressed", "true");
    } else {
      button.setAttribute("aria-pressed", "false");
    }

    button.addEventListener("click", () => {
      selectedDate = dateKey;
      timeSelect.value = "";
      renderTimeOptions();
      renderCalendar();
      updateSummary();
      bookingStatus.textContent = "";
    });

    return button;
  };

  const renderCalendar = () => {
    calendarGrid.replaceChildren();
    calendarMonth.textContent = "Available dates · next 30 days";
    calendarMonth.style.textAlign = "left";
    calendarGrid.style.display = "grid";
    calendarGrid.style.gridTemplateColumns = "1fr";
    calendarGrid.style.gap = "1rem";

    if (previousMonthButton) {
      previousMonthButton.disabled = true;
      previousMonthButton.hidden = true;
    }
    if (nextMonthButton) {
      nextMonthButton.disabled = true;
      nextMonthButton.hidden = true;
    }
    if (calendarWeekdays) calendarWeekdays.hidden = true;
    if (calendarToolbar) calendarToolbar.style.gridTemplateColumns = "1fr";

    const groups = new Map();
    let selectedStillAvailable = !selectedDate;

    for (let index = 0; index <= 30; index += 1) {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + index);
      if (date > windowEnd) break;
      if (date.getFullYear() > nextMonth.getFullYear()) break;
      if (date.getFullYear() === nextMonth.getFullYear() && date.getMonth() > nextMonth.getMonth()) break;

      const dateKey = formatDateKey(date);
      if (!dateHasBookableSlot(dateKey)) continue;

      const groupKey = `${date.getFullYear()}-${date.getMonth()}`;
      if (!groups.has(groupKey)) groups.set(groupKey, []);
      groups.get(groupKey).push(date);
      if (dateKey === selectedDate) selectedStillAvailable = true;
    }

    if (selectedDate && !selectedStillAvailable) {
      selectedDate = "";
      timeSelect.value = "";
      renderTimeOptions();
    }

    if (groups.size === 0) {
      const empty = document.createElement("p");
      empty.className = "booking-note";
      empty.textContent = availabilityState === "loading"
        ? "Checking available dates…"
        : "No consultation dates are currently available in the next 30 days.";
      calendarGrid.append(empty);
      return;
    }

    groups.forEach((dates) => {
      const group = document.createElement("section");
      group.className = "calendar-month-group";
      group.style.display = "grid";
      group.style.gap = "0.55rem";

      const heading = document.createElement("h4");
      heading.className = "calendar-group-heading";
      heading.textContent = dates[0].toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      });
      heading.style.margin = "0";
      heading.style.fontSize = "0.9rem";
      heading.style.letterSpacing = "0";

      const dateGrid = document.createElement("div");
      dateGrid.className = "calendar-available-grid";
      dateGrid.style.display = "grid";
      dateGrid.style.gridTemplateColumns = "repeat(auto-fit, minmax(4.7rem, 1fr))";
      dateGrid.style.gap = "0.45rem";
      dates.forEach((date) => dateGrid.append(createDateButton(date)));

      group.append(heading, dateGrid);
      calendarGrid.append(group);
    });
  };

  const loadAvailabilityWindow = async () => {
    if (!bookingApiEnabled) {
      availabilityState = "ready";
      busyRanges = [];
      renderCalendar();
      renderTimeOptions();
      updateSummary();
      return;
    }

    availabilityState = "loading";
    busyRanges = [];
    renderCalendar();
    renderTimeOptions();
    bookingStatus.textContent = "Checking Esai's calendar…";

    const from = makePacificInstant(formatDateKey(today), "00:00");
    const afterWindow = new Date(windowEnd.getFullYear(), windowEnd.getMonth(), windowEnd.getDate() + 1);
    const to = makePacificInstant(formatDateKey(afterWindow), "00:00");

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

    renderCalendar();
    renderTimeOptions();
    updateSummary();
  };

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
      await loadAvailabilityWindow();
      bookingStatus.textContent = successMessage;
    } catch (error) {
      const errorMessage = error.message || "We couldn't safely record that request. Please try again.";
      await loadAvailabilityWindow();
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

  if (bookingApiEnabled) {
    loadAvailabilityWindow();
  } else {
    renderTimeOptions();
    renderCalendar();
    updateSummary();
  }
}