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
  const getPacificClock = () => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    return {
      year: Number(values.year),
      month: Number(values.month),
      day: Number(values.day),
      hour: Number(values.hour),
      minute: Number(values.minute),
    };
  };

  const initialPacificClock = getPacificClock();
  const today = new Date(
    initialPacificClock.year,
    initialPacificClock.month - 1,
    initialPacificClock.day
  );
  today.setHours(0, 0, 0, 0);

  let visibleMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  let selectedDate = "";
  const timeSelect = bookingForm.elements.time;
  const submitButton = bookingForm.querySelector('button[type="submit"]');
  const bookingRelayUrl = "https://portal.3dvr.tech/api/calendar/reminder-email";
  const bookingRecipient = "gamboaesai@gmail.com";

  const formatDateKey = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const parseDateKey = (dateKey) => {
    const [year, month, day] = dateKey.split("-").map(Number);
    return new Date(year, month - 1, day);
  };

  const updateTimeAvailability = () => {
    const selectedIsToday = selectedDate === formatDateKey(today);
    const pacificClock = getPacificClock();
    const currentMinutes = pacificClock.hour * 60 + pacificClock.minute;

    Array.from(timeSelect.options).forEach((option, index) => {
      if (index === 0) return;
      option.disabled = false;

      if (!selectedIsToday) return;

      const match = option.textContent.match(/(\d+):(\d+)\s([AP]M)/);
      if (!match) return;

      let hour = Number(match[1]);
      const minute = Number(match[2]);
      if (match[3] === "PM" && hour !== 12) hour += 12;
      if (match[3] === "AM" && hour === 12) hour = 0;

      option.disabled = hour * 60 + minute <= currentMinutes;
    });

    if (timeSelect.selectedOptions[0]?.disabled) {
      timeSelect.value = "";
    }
  };

  const updateSummary = () => {
    const time = bookingForm.elements.time.value;
    const topic = bookingForm.elements.topic.value;

    if (!selectedDate) {
      bookingSummary.textContent = "Select a day to build your request.";
      return;
    }

    const dateLabel = parseDateKey(selectedDate).toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    const details = [dateLabel];
    if (time) details.push(time);
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
        updateTimeAvailability();

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

  const openMailFallback = (subject, body) => {
    bookingStatus.textContent =
      "Automatic send failed. Your email app is opening with the request ready — tap Send to finish.";
    window.location.href = `mailto:${bookingRecipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  bookingForm.addEventListener("submit", async (event) => {
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
    const dateLabel = parseDateKey(selectedDate).toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    const time = formData.get("time");
    const topic = formData.get("topic");
    const name = formData.get("name");
    const email = formData.get("email");
    const subject = `SD Day Traders consultation request — ${dateLabel}`;
    const body = [
      "Hello Esai,",
      "",
      "I'd like to request a consultation.",
      "",
      `Preferred date: ${dateLabel}`,
      `Preferred time: ${time}`,
      `Focus: ${topic}`,
      `Name: ${name}`,
      `Email: ${email}`,
      "",
      "Please confirm whether this time is available.",
    ].join("\n");

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 9000);

    if (submitButton) submitButton.disabled = true;
    bookingStatus.textContent = "Sending your request…";

    try {
      const response = await fetch(bookingRelayUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipients: [bookingRecipient],
          event: {
            title: subject,
            description: `New consultation request from ${name} (${email}).`,
            reminderMessage: body,
            timeZone: "America/Los_Angeles",
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Booking relay returned ${response.status}`);
      }

      bookingStatus.textContent =
        `Sent to Esai — you're done. He'll reply to ${email} to confirm the time.`;
    } catch (error) {
      console.warn("Automatic booking delivery failed; using email fallback.", error);
      openMailFallback(subject, body);
    } finally {
      window.clearTimeout(timeoutId);
      if (submitButton) submitButton.disabled = false;
    }
  });

  renderCalendar();
  updateSummary();
}
