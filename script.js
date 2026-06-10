const yearNode = document.querySelector("#year");

if (yearNode) {
  yearNode.textContent = new Date().getFullYear();
}

const revealNodes = document.querySelectorAll("[data-reveal]");
const bookingForm = document.querySelector("#bookingForm");
const bookingStatus = document.querySelector("#bookingStatus");

const consultationSlots = {
  "chart-review": {
    title: "SD Day Traders chart review with Esai",
    minutes: 30,
    description: "Bring one setup, one mistake, and one adjustment to review.",
  },
  "process-reset": {
    title: "SD Day Traders process reset with Esai",
    minutes: 45,
    description: "Review routine, risk rules, and weekly trading structure.",
  },
  "group-consult": {
    title: "SD Day Traders group consultation with Esai",
    minutes: 60,
    description: "Small-group Q&A for the SD Day Traders circle.",
  },
};

function formatCalendarDate(date) {
  return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function nextSaturdayAt(hour) {
  const date = new Date();
  const daysUntilSaturday = (6 - date.getDay() + 7) % 7 || 7;
  date.setDate(date.getDate() + daysUntilSaturday);
  date.setHours(hour, 0, 0, 0);
  return date;
}

function downloadCalendarHold(slotKey) {
  const slot = consultationSlots[slotKey];

  if (!slot) {
    return;
  }

  const start = nextSaturdayAt(10);
  const end = new Date(start.getTime() + slot.minutes * 60 * 1000);
  const uid = `${slotKey}-${Date.now()}@sd-day-traders`;
  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SD Day Traders//Consultations//EN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${formatCalendarDate(new Date())}`,
    `DTSTART:${formatCalendarDate(start)}`,
    `DTEND:${formatCalendarDate(end)}`,
    `SUMMARY:${slot.title}`,
    `DESCRIPTION:${slot.description} Educational consultation only. Confirm the final time with Esai.`,
    "LOCATION:San Diego or video call",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const blob = new Blob([body], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${slotKey}-sd-day-traders.ics`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

document.querySelectorAll("[data-slot]").forEach((button) => {
  button.addEventListener("click", () => {
    downloadCalendarHold(button.dataset.slot);
  });
});

if (bookingForm) {
  bookingForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(bookingForm);
    const name = formData.get("name");
    const contact = formData.get("contact");
    const session = formData.get("session");
    const availability = formData.get("availability");
    const message = formData.get("message") || "No extra notes.";
    const subject = encodeURIComponent(`SD Day Traders consultation request - ${name}`);
    const body = encodeURIComponent(
      [
        `Name: ${name}`,
        `Contact: ${contact}`,
        `Session: ${session}`,
        `Preferred days/times: ${availability}`,
        "",
        "What they want help with:",
        message,
      ].join("\n")
    );

    window.location.href = `mailto:?subject=${subject}&body=${body}`;

    if (bookingStatus) {
      bookingStatus.textContent = "Opening your email app with the booking request.";
    }
  });
}

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
    {
      threshold: 0.18,
    }
  );

  revealNodes.forEach((node) => observer.observe(node));
} else {
  revealNodes.forEach((node) => node.classList.add("is-visible"));
}
