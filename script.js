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
  const bookingRecipient = "gamboaesai@gmail.com";

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

      option.disabled = instant <= new Date();
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

      button.addEventListener("click", () => {
        selectedDate = dateKey;
        bookingStatus.textContent = "";
        renderTimeOptions();

        if (isOutsideMonth) {
          visibleMonth = new Date(date.getFullYear(), date.getMonth(), 1);
        }

        renderCalendar();
        updateSummary();
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

  bookingForm.addEventListener("submit", (event) => {
    event.preventDefault();
    bookingStatus.textContent = "";

    if (!selectedDate) {
      bookingStatus.textContent = "Choose a date first.";
      return;
    }

    if (!bookingForm.reportValidity()) {
      return;
    }

    const formData = new FormData(bookingForm);
    const selectedInstant = getSelectedInstant();
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

    bookingStatus.textContent =
      "Your request is ready. Your email app is opening — tap Send to deliver it to Esai.";
    window.location.href = `mailto:${bookingRecipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
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
