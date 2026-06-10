const yearNode = document.querySelector("#year");

if (yearNode) {
  yearNode.textContent = new Date().getFullYear();
}

const revealNodes = document.querySelectorAll("[data-reveal]");
const bookingForm = document.querySelector("#bookingForm");
const bookingStatus = document.querySelector("#bookingStatus");
const esaiEmail = "gamboaesai@gmail.com";

const consultationSlots = {
  "chart-review": {
    title: "SD Day Traders chart review with Esai",
    duration: "30 minutes",
    description: "Bring one setup, one mistake, and one adjustment to review.",
  },
  "process-reset": {
    title: "SD Day Traders process reset with Esai",
    duration: "45 minutes",
    description: "Review routine, risk rules, and weekly trading structure.",
  },
  "group-consult": {
    title: "SD Day Traders group consultation with Esai",
    duration: "60 minutes",
    description: "Small-group Q&A for the SD Day Traders circle.",
  },
};

function openConsultationEmail(slotKey) {
  const slot = consultationSlots[slotKey];

  if (!slot) {
    return;
  }

  const subject = encodeURIComponent(`SD Day Traders consultation - ${slot.duration}`);
  const body = encodeURIComponent(
    [
      `Hi Esai,`,
      "",
      `I want to book the ${slot.title.replace("SD Day Traders ", "")}.`,
      `Session length: ${slot.duration}`,
      "",
      "My preferred days/times:",
      "",
      "What I want help with:",
      slot.description,
      "",
      "My contact info:",
    ].join("\n")
  );

  window.location.href = `mailto:${esaiEmail}?subject=${subject}&body=${body}`;
}

document.querySelectorAll("[data-slot]").forEach((button) => {
  button.addEventListener("click", () => {
    openConsultationEmail(button.dataset.slot);
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

    window.location.href = `mailto:${esaiEmail}?subject=${subject}&body=${body}`;

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
