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
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let visibleMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  let selectedDate = "";
  const timeSelect = bookingForm.elements.time;

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
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

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

    const firstDay = visibleMonth.getDay();
    const daysInMonth = new Date(
      visibleMonth.getFullYear(),
      visibleMonth.getMonth() + 1,
      0
    ).getDate();

    for (let index = 0; index < firstDay; index += 1) {
      const spacer = document.createElement("span");
      spacer.className = "calendar-spacer";
      spacer.setAttribute("aria-hidden", "true");
      calendarGrid.append(spacer);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day);
      const dateKey = formatDateKey(date);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "calendar-day";
      button.textContent = String(day);
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

      if (date < today) {
        button.disabled = true;
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
        renderCalendar();
        updateSummary();
      });

      calendarGrid.append(button);
    }

    const isCurrentMonth =
      visibleMonth.getFullYear() === today.getFullYear() &&
      visibleMonth.getMonth() === today.getMonth();
    previousMonthButton.disabled = isCurrentMonth;
  };

  previousMonthButton.addEventListener("click", () => {
    const previous = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1);
    const current = new Date(today.getFullYear(), today.getMonth(), 1);
    if (previous >= current) {
      visibleMonth = previous;
      renderCalendar();
    }
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
    const dateLabel = parseDateKey(selectedDate).toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    const subject = `SD Day Traders consultation request — ${dateLabel}`;
    const body = [
      "Hello Esai,",
      "",
      "I'd like to request a consultation.",
      "",
      `Preferred date: ${dateLabel}`,
      `Preferred time: ${formData.get("time")}`,
      `Focus: ${formData.get("topic")}`,
      `Name: ${formData.get("name")}`,
      `Email: ${formData.get("email")}`,
      "",
      "Please confirm whether this time is available.",
    ].join("\n");

    bookingStatus.textContent = "Opening your email app with the request filled in…";
    window.location.href = `mailto:gamboaesai@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  });

  renderCalendar();
  updateSummary();
}
