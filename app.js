const bibleBooks = Array.isArray(window.BIBLE_BOOKS) ? window.BIBLE_BOOKS : [];
const hymnCatalog = Array.isArray(window.HYMN_CATALOG) ? window.HYMN_CATALOG : [];
const STORAGE_KEY = "gudstjanstplanering.v1";
let serviceGroupFetchSeq = 0;
const SERVICE_GROUP_API_URL = String(window.SERVICE_GROUP_API_URL || "").trim();
const bibleBookChapterCounts = [
  50, 40, 27, 36, 34, 24, 21, 4, 31, 24, 22, 25, 29, 36, 10, 13, 10, 42, 150, 31, 12, 8, 66, 52, 5, 48, 12, 14, 3,
  9, 1, 4, 7, 3, 3, 3, 2, 14, 4, 28, 16, 24, 21, 28, 16, 16, 13, 6, 6, 4, 4, 5, 3, 6, 4, 3, 1, 13, 5, 5, 3, 5, 1,
  1, 1, 22
];
const bibleBookChapters = Object.fromEntries(bibleBooks.map((book, index) => [book, bibleBookChapterCounts[index] || 1]));

const defaultResponsibleRoles = [
  "Predikant",
  "Ljudtekniker kyrksal",
  "Ljudtekniker inspelning",
  "Videoinspelning",
  "Projektoransvarig",
  "Organist",
  "Förebedjare",
  "Servicegruppansvarig"
];

function createDefaultAgenda() {
  return [
    { type: "custom", title: "Välkommen till gudstjänst", owner: "" },
    { type: "custom", title: "Pålysningar", owner: "" }
  ];
}

const defaultAgendaOwnerTitles = new Set(["välkommen till gudstjänst", "pålysningar"]);

let state = loadState();

const el = {
  serviceDate: document.querySelector("#serviceDate"),
  meetingLeader: document.querySelector("#meetingLeader"),
  serviceTheme: document.querySelector("#serviceTheme"),
  responsibleList: document.querySelector("#responsibleList"),
  agendaList: document.querySelector("#agendaList"),
  addResponsible: document.querySelector("#addResponsible"),
  addAgendaItem: document.querySelector("#addAgendaItem"),
  responsibleTemplate: document.querySelector("#responsibleTemplate"),
  agendaTemplate: document.querySelector("#agendaTemplate"),
  preview: document.querySelector("#livePreview"),
  previewBtn: document.querySelector("#previewBtn"),
  pdfBtn: document.querySelector("#pdfBtn"),
  imageBtn: document.querySelector("#imageBtn"),
  mailBtn: document.querySelector("#mailBtn"),
  clearBtn: document.querySelector("#clearBtn")
};

function init() {
  state = normalizeLoadedState(state);
  el.serviceDate.value = state.date;
  el.meetingLeader.value = state.meetingLeader;
  el.serviceTheme.value = state.theme;

  wireTopFields();
  wireActions();
  renderResponsible();
  renderAgenda();
  renderPreview();
  syncServiceGroupResponsibleFromCalendar(el.serviceDate.value || state.date);
}

function wireTopFields() {
  el.serviceDate.addEventListener("change", (event) => {
    state.date = event.target.value;
    renderPreview();
    syncServiceGroupResponsibleFromCalendar(event.target.value);
  });

  el.meetingLeader.addEventListener("input", (event) => {
    state.meetingLeader = event.target.value;
    renderPreview();
  });

  el.serviceTheme.addEventListener("input", (event) => {
    state.theme = event.target.value;
    renderPreview();
  });
}

function wireActions() {
  el.addResponsible.addEventListener("click", () => {
    state.responsible.push({ role: "", name: "", email: "", locked: false });
    renderResponsible();
    renderPreview();
  });

  el.addAgendaItem.addEventListener("click", () => {
    state.agenda.push({ type: "custom", title: "", owner: "" });
    renderAgenda();
    renderPreview();
  });

  el.previewBtn.addEventListener("click", () => openPrintPage(false));
  el.pdfBtn.addEventListener("click", () => openPrintPage(true));
  el.imageBtn.addEventListener("click", exportAsImageJpg);
  el.mailBtn.addEventListener("click", createMailDraft);
  el.clearBtn.addEventListener("click", resetAllData);
}

function renderResponsible() {
  el.responsibleList.innerHTML = "";

  state.responsible.forEach((person, index) => {
    const node = el.responsibleTemplate.content.firstElementChild.cloneNode(true);
    const role = node.querySelector('[data-field="role"]');
    const name = node.querySelector('[data-field="name"]');
    const email = node.querySelector('[data-field="email"]');
    const remove = node.querySelector('[data-remove="responsible"]');

    role.value = person.role;
    role.readOnly = Boolean(person.locked);
    role.classList.toggle("readonly", Boolean(person.locked));
    name.value = person.name;
    email.value = person.email;

    remove.hidden = Boolean(person.locked);

    role.addEventListener("input", (event) => {
      state.responsible[index].role = event.target.value;
      renderPreview();
    });

    name.addEventListener("input", (event) => {
      state.responsible[index].name = event.target.value;
      renderPreview();
    });

    email.addEventListener("input", (event) => {
      state.responsible[index].email = event.target.value;
      saveState();
    });

    remove.addEventListener("click", () => {
      state.responsible.splice(index, 1);
      renderResponsible();
      renderPreview();
    });

    el.responsibleList.appendChild(node);
  });
}

function renderAgenda() {
  el.agendaList.innerHTML = "";

  state.agenda.forEach((item, index) => {
    const normalizedItem = normalizeAgendaItem(item);
    state.agenda[index] = normalizedItem;

    const node = el.agendaTemplate.content.firstElementChild.cloneNode(true);
    const type = node.querySelector('[data-field="type"]');
    const title = node.querySelector('[data-field="title"]');
    const hymnPicker = node.querySelector('[data-field="hymnPicker"]');
    const hymnSearch = node.querySelector('[data-field="hymnSearch"]');
    const hymnSelect = node.querySelector('[data-field="hymnSelect"]');
    const bibleRef = node.querySelector('[data-field="bibleRef"]');
    const bibleBook = node.querySelector('[data-field="bibleBook"]');
    const bibleChapter = node.querySelector('[data-field="bibleChapter"]');
    const bibleVerses = node.querySelector('[data-field="bibleVerses"]');
    const owner = node.querySelector('[data-field="owner"]');
    const moveUp = node.querySelector('[data-move="up"]');
    const moveDown = node.querySelector('[data-move="down"]');
    const remove = node.querySelector('[data-remove="agenda"]');
    node.classList.add(index % 2 === 0 ? "row-even" : "row-odd");

    type.value = normalizedItem.type;
    title.value = normalizedItem.title || "";
    title.placeholder = getAgendaTitlePlaceholder(normalizedItem.type);
    const selectedHymn = normalizedItem.hymnInput || "";
    hymnSearch.value = normalizedItem.hymnSearchTerm || "";
    owner.value = normalizedItem.owner || "";
    populateHymnSelect(hymnSelect, hymnSearch.value, selectedHymn);

    populateBibleBooksSelect(bibleBook, normalizedItem.bibleBook || bibleBooks[0] || "");
    populateBibleChaptersSelect(
      bibleChapter,
      normalizedItem.bibleBook || bibleBooks[0] || "",
      normalizedItem.bibleChapter || "1"
    );
    bibleVerses.value = normalizedItem.bibleVerses || "";

    syncAgendaFieldVisibility(normalizedItem.type, { title, hymnPicker, bibleRef });

    type.addEventListener("change", (event) => {
      const nextType = event.target.value;
      const nextItem = { ...state.agenda[index], type: nextType };

      if (nextType === "bible") {
        nextItem.bibleBook = nextItem.bibleBook || bibleBooks[0] || "";
        nextItem.bibleChapter = nextItem.bibleChapter || "1";
        nextItem.bibleVerses = nextItem.bibleVerses || "";
        if (!(nextItem.owner || "").trim()) {
          nextItem.owner = getInitialsFromName(state.meetingLeader);
        }
      }

      if (nextType === "hymn") {
        nextItem.hymnInput = nextItem.hymnInput || hymnCatalog[0]?.label || "";
        nextItem.hymnSearchTerm = "";
        if (!(nextItem.owner || "").trim()) {
          nextItem.owner = getInitialsForRole("Organist");
        }
      }

      if (nextType === "sermon") {
        if (!(nextItem.owner || "").trim()) {
          nextItem.owner = getInitialsForRole("Predikant");
        }
      }

      state.agenda[index] = normalizeAgendaItem(nextItem);
      renderAgenda();
      renderPreview();
    });

    title.addEventListener("input", (event) => {
      state.agenda[index].title = event.target.value;
      renderPreview();
    });

    hymnSearch.addEventListener("input", (event) => {
      const filterText = event.target.value;
      state.agenda[index].hymnSearchTerm = filterText;
      populateHymnSelect(hymnSelect, filterText, state.agenda[index].hymnInput || "");
      const firstOption = hymnSelect.options[0];
      if (firstOption && firstOption.value && isCloseHymnMatch(filterText, firstOption.value)) {
        state.agenda[index].hymnInput = firstOption.value;
      }
      renderPreview();
    });

    hymnSelect.addEventListener("change", (event) => {
      const value = event.target.value;
      state.agenda[index].hymnInput = value;
      renderPreview();
    });

    bibleBook.addEventListener("change", (event) => {
      const nextBook = event.target.value;
      state.agenda[index].bibleBook = nextBook;

      const chapterCount = bibleBookChapters[nextBook] || 1;
      const currentChapter = Number.parseInt(state.agenda[index].bibleChapter || "1", 10);
      const nextChapter = Number.isFinite(currentChapter) && currentChapter >= 1 && currentChapter <= chapterCount ? currentChapter : 1;

      state.agenda[index].bibleChapter = String(nextChapter);
      populateBibleChaptersSelect(bibleChapter, nextBook, state.agenda[index].bibleChapter);
      renderPreview();
    });

    bibleChapter.addEventListener("change", (event) => {
      state.agenda[index].bibleChapter = event.target.value;
      renderPreview();
    });

    bibleVerses.addEventListener("input", (event) => {
      state.agenda[index].bibleVerses = event.target.value;
      renderPreview();
    });

    owner.addEventListener("input", (event) => {
      state.agenda[index].owner = event.target.value;
      renderPreview();
    });

    remove.addEventListener("click", () => {
      state.agenda.splice(index, 1);
      renderAgenda();
      renderPreview();
    });

    moveUp.addEventListener("click", () => {
      if (index === 0) return;
      [state.agenda[index - 1], state.agenda[index]] = [state.agenda[index], state.agenda[index - 1]];
      renderAgenda();
      renderPreview();
    });

    moveDown.addEventListener("click", () => {
      if (index >= state.agenda.length - 1) return;
      [state.agenda[index + 1], state.agenda[index]] = [state.agenda[index], state.agenda[index + 1]];
      renderAgenda();
      renderPreview();
    });

    moveUp.disabled = index === 0;
    moveDown.disabled = index === state.agenda.length - 1;

    el.agendaList.appendChild(node);
  });
}

function populateBibleBooksSelect(selectEl, selectedBook) {
  selectEl.innerHTML = "";

  bibleBooks.forEach((book) => {
    const option = document.createElement("option");
    option.value = book;
    option.textContent = book;
    option.selected = book === selectedBook;
    selectEl.appendChild(option);
  });
}

function populateHymnSelect(selectEl, filterText, selectedLabel) {
  const query = String(filterText || "").trim().toLowerCase();
  const matches = hymnCatalog.filter((hymn) => {
    if (!query) return true;
    return hymn.label.toLowerCase().includes(query);
  });

  selectEl.innerHTML = "";

  (matches.length ? matches : hymnCatalog).forEach((hymn) => {
    const option = document.createElement("option");
    option.value = hymn.label;
    option.textContent = hymn.label;
    option.selected = hymn.label === selectedLabel;
    selectEl.appendChild(option);
  });

  if (!selectEl.value && selectEl.options.length > 0) {
    selectEl.selectedIndex = 0;
  }
}

function populateBibleChaptersSelect(selectEl, book, selectedChapter) {
  const chapterCount = bibleBookChapters[book] || 1;
  const selectedValue = Number.parseInt(selectedChapter || "1", 10);
  const safeSelected = Number.isFinite(selectedValue) && selectedValue >= 1 && selectedValue <= chapterCount ? selectedValue : 1;

  selectEl.innerHTML = "";

  for (let chapter = 1; chapter <= chapterCount; chapter += 1) {
    const option = document.createElement("option");
    option.value = String(chapter);
    option.textContent = String(chapter);
    option.selected = chapter === safeSelected;
    selectEl.appendChild(option);
  }
}

function syncAgendaFieldVisibility(type, fields) {
  const { title, hymnPicker, bibleRef } = fields;
  const isBible = type === "bible";
  const isHymn = type === "hymn";

  title.classList.toggle("hidden", isBible || isHymn);
  hymnPicker.classList.toggle("hidden", !isHymn);
  bibleRef.classList.toggle("hidden", !isBible);

  title.hidden = isBible || isHymn;
  hymnPicker.hidden = !isHymn;
  bibleRef.hidden = !isBible;

  // Prevent stray focus/input in hidden controls; bible controls are only active for Bibeltext.
  [...bibleRef.querySelectorAll("select, input")].forEach((field) => {
    field.disabled = !isBible;
  });

  [...hymnPicker.querySelectorAll("select, input")].forEach((field) => {
    field.disabled = !isHymn;
  });
}

function getAgendaTitlePlaceholder(type) {
  if (type === "sermon") return "Rubrik på predikan";
  return "Titel";
}

function normalizeAgendaItem(item) {
  const next = { ...item };

  if (!next.type) {
    next.type = "custom";
  }

  if (next.type === "bible") {
    next.bibleBook = next.bibleBook || bibleBooks[0] || "";
    const chapterCount = bibleBookChapters[next.bibleBook] || 1;
    const rawChapter = Number.parseInt(next.bibleChapter || "1", 10);
    const boundedChapter = Number.isFinite(rawChapter) && rawChapter >= 1 && rawChapter <= chapterCount ? rawChapter : 1;
    next.bibleChapter = String(boundedChapter);
    next.bibleVerses = next.bibleVerses || "";
  }

  if (next.type === "hymn") {
    next.hymnInput = next.hymnInput || "";
    next.hymnSearchTerm = next.hymnSearchTerm || "";
  }

  next.owner = next.owner || "";
  next.title = next.title || "";

  return next;
}

function getInitialsForRole(roleName) {
  const person = state.responsible.find((entry) => entry.role === roleName);
  if (!person || !person.name) return "";
  return getInitialsFromName(person.name);
}

function setResponsibleNameByRole(roleName, fullName) {
  const index = state.responsible.findIndex((entry) => entry.role === roleName);
  if (index < 0) return false;
  state.responsible[index].name = String(fullName || "").trim();
  return true;
}

function setResponsibleAssignments(assignments) {
  const appliedRoles = [];
  for (const [roleName, person] of Object.entries(assignments || {})) {
    const value = String(person || "").trim();
    if (!value) continue;
    const updated = setResponsibleNameByRole(roleName, value);
    if (updated) {
      appliedRoles.push(roleName);
    }
  }
  return appliedRoles;
}

function applyMeetingLeaderToDefaultAgendaOwners(newMeetingLeader, previousMeetingLeader = "") {
  const newInitials = getInitialsFromName(newMeetingLeader);
  const prevInitials = getInitialsFromName(previousMeetingLeader);
  if (!newInitials) return false;

  let changed = false;
  for (const item of state.agenda) {
    if (!item || item.type !== "custom") continue;
    const titleKey = String(item.title || "").trim().toLowerCase();
    if (!defaultAgendaOwnerTitles.has(titleKey)) continue;

    const currentOwner = String(item.owner || "").trim();
    if (!currentOwner || currentOwner === prevInitials) {
      item.owner = newInitials;
      changed = true;
    }
  }

  return changed;
}

async function syncServiceGroupResponsibleFromCalendar(dateIso) {
  const targetDate = String(dateIso || "").trim();
  if (!isValidIsoDate(targetDate)) {
    return;
  }

  const seq = ++serviceGroupFetchSeq;

  try {
    const endpoint = buildServiceGroupApiEndpoint(targetDate);
    const response = await fetch(endpoint);
    const data = await response.json();
    if (seq !== serviceGroupFetchSeq) return;

    if (!response.ok || !data.ok) {
      return;
    }

    const appliedRoles = setResponsibleAssignments(data.assignments || {});
    let meetingLeaderChanged = false;
    let defaultAgendaOwnersChanged = false;

    if (typeof data.meetingLeader === "string" && data.meetingLeader.trim()) {
      const previousMeetingLeader = state.meetingLeader;
      const nextMeetingLeader = data.meetingLeader.trim();
      if (nextMeetingLeader !== previousMeetingLeader) {
        state.meetingLeader = nextMeetingLeader;
        el.meetingLeader.value = nextMeetingLeader;
        meetingLeaderChanged = true;
      }
      defaultAgendaOwnersChanged = applyMeetingLeaderToDefaultAgendaOwners(nextMeetingLeader, previousMeetingLeader);
    }

    if (appliedRoles.length || meetingLeaderChanged || defaultAgendaOwnersChanged) {
      renderResponsible();
      if (defaultAgendaOwnersChanged) {
        renderAgenda();
      }
      renderPreview();
    }
  } catch (_error) {
    if (seq !== serviceGroupFetchSeq) return;
  }
}

function buildServiceGroupApiEndpoint(targetDate) {
  if (!SERVICE_GROUP_API_URL) {
    return `/api/service-group?date=${encodeURIComponent(targetDate)}`;
  }

  try {
    const url = new URL(SERVICE_GROUP_API_URL, window.location.href);
    url.searchParams.set("date", targetDate);
    return url.toString();
  } catch (_error) {
    return `${SERVICE_GROUP_API_URL}${SERVICE_GROUP_API_URL.includes("?") ? "&" : "?"}date=${encodeURIComponent(targetDate)}`;
  }
}

function getInitialsFromName(name) {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() || "")
    .join("");
}

function isCloseHymnMatch(search, label) {
  const query = String(search || "").trim().toLowerCase();
  const target = String(label || "").trim().toLowerCase();
  return query.length >= 2 && target.includes(query);
}

function getAgendaTitle(item) {
  if (item.type === "bible") {
    return formatBibleReference(item.bibleBook, item.bibleChapter, item.bibleVerses);
  }

  if (item.type === "hymn") {
    const hymn = (item.hymnInput || "").trim();
    return hymn;
  }

  return (item.title || "").trim();
}

function getAgendaCategory(item) {
  if (item.type === "hymn") return "Psalmer och sånger";
  if (item.type === "bible") return "Bibelläsning";
  if (item.type === "sermon") return "Predikan";
  return "";
}

function formatBibleReference(book, chapter, verses) {
  const cleanBook = String(book || "").trim();
  const cleanChapter = String(chapter || "").trim();
  const cleanVerses = String(verses || "").trim();

  if (!cleanBook) return "";
  if (!cleanChapter && !cleanVerses) return cleanBook;
  if (cleanChapter && !cleanVerses) return `${cleanBook} ${cleanChapter}`;
  if (!cleanChapter && cleanVerses) return `${cleanBook} ${cleanVerses}`;

  return `${cleanBook} ${cleanChapter}:${cleanVerses}`;
}

function getFilledResponsibles() {
  return state.responsible.filter((person) => person.name.trim());
}

function buildPlanData() {
  return {
    dateLabel: formatDate(state.date),
    meetingLeader: state.meetingLeader || "Ej satt",
    theme: state.theme || "",
    responsibles: getFilledResponsibles().map((person) => ({ role: person.role, name: person.name })),
    agenda: state.agenda
      .map((item, index) => ({
        number: index + 1,
        category: getAgendaCategory(item),
        title: getAgendaTitle(item),
        owner: item.owner || ""
      }))
      .filter((item) => item.title || item.category || item.owner)
  };
}

function renderPreview() {
  const plan = buildPlanData();

  const responsibleList = plan.responsibles
    .map((person) => `<div><strong>${escapeHtml(person.role || "Roll")}</strong>: ${escapeHtml(person.name)}</div>`)
    .join("");

  const agendaRows = plan.agenda
    .map(
      (item) => `
        <tr>
          <td class="plan-col-num"><span class="plan-num-badge">${item.number}</span></td>
          <td class="plan-col-category">${escapeHtml(item.category || "")}</td>
          <td class="plan-col-title">${escapeHtml(item.title || "")}</td>
          <td class="plan-col-owner">${escapeHtml(item.owner || "")}</td>
        </tr>
      `
    )
    .join("");

  el.preview.innerHTML = `
    <h3>Gudstjänstordning ${plan.dateLabel}</h3>
    <p><strong>Mötesledare:</strong> ${escapeHtml(plan.meetingLeader)}</p>
    ${plan.theme ? `<p><strong>Tema:</strong> ${escapeHtml(plan.theme)}</p>` : ""}
    <h4>Ansvariga</h4>
    <div class="people-lines">${responsibleList || "<div>Inga ansvariga ifyllda.</div>"}</div>
    <h4>Ordning</h4>
    ${
      agendaRows
        ? `<table class="plan-table"><tbody>${agendaRows}</tbody></table>`
        : "<div>Inga mötespunkter inlagda.</div>"
    }
  `;

  saveState();
}

function createMailDraft() {
  const to = state.responsible
    .map((person) => person.email.trim())
    .filter(Boolean)
    .join(",");

  const plan = buildPlanData();
  const subject = `Gudstjänstordning ${plan.dateLabel}`;
  const agendaLines = plan.agenda.map((item) => {
    const category = String(item.category || "").trim();
    const title = String(item.title || "").trim();
    const owner = String(item.owner || "").trim();
    const ownerSuffix = owner ? ` (${owner})` : "";

    if (category && title) return `${item.number}. ${category}: ${title}${ownerSuffix}`;
    if (title) return `${item.number}. ${title}${ownerSuffix}`;
    return `${item.number}. ${category}${ownerSuffix}`;
  });

  const body = [
    "Hej!",
    "",
    `Här kommer gudstjänstordningen för ${plan.dateLabel}.`,
    "",
    `Datum: ${plan.dateLabel}`,
    `Mötesledare: ${plan.meetingLeader}`,
    ...(plan.theme ? [`Tema: ${plan.theme}`] : []),
    "",
    ...agendaLines,
    ""
  ].join("\n");

  const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = mailto;
}

async function exportAsImageJpg() {
  const plan = buildPlanData();
  const filename = `gudstjanstordning-${state.date || Date.now()}.jpg`;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const width = 1400;
  const side = 52;
  const lineHeight = 34;

  if (!ctx) {
    window.alert("Kunde inte skapa bildexport i den här webbläsaren.");
    return;
  }

  const loadImage = (src) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Kunde inte läsa logotypen."));
      img.src = src;
    });

  ctx.font = "600 28px Arial, sans-serif";
  const wrapText = (text, maxWidth, font = "500 28px Arial, sans-serif") => {
    ctx.font = font;
    const words = String(text || "").trim().split(/\s+/).filter(Boolean);
    if (!words.length) return [""];
    const lines = [];
    let current = words[0];
    for (let i = 1; i < words.length; i += 1) {
      const candidate = `${current} ${words[i]}`;
      if (ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
      } else {
        lines.push(current);
        current = words[i];
      }
    }
    lines.push(current);
    return lines;
  };

  const colNum = 0.07;
  const colCat = 0.23;
  const colTitle = 0.46;
  const colOwner = 0.24;
  const tableInner = width - side * 2;
  const colWidths = [
    Math.floor(tableInner * colNum),
    Math.floor(tableInner * colCat),
    Math.floor(tableInner * colTitle),
    Math.floor(tableInner * colOwner)
  ];

  let estimatedHeight = 270 + Math.max(1, plan.responsibles.length) * 44 + 58;
  for (const item of plan.agenda) {
    const linesCat = wrapText(item.category || "", colWidths[1] - 16).length;
    const linesTitle = wrapText(item.title || "", colWidths[2] - 16).length;
    const linesOwner = wrapText(item.owner || "", colWidths[3] - 16).length;
    const maxLines = Math.max(1, linesCat, linesTitle, linesOwner);
    estimatedHeight += Math.max(44, 20 + maxLines * lineHeight);
  }
  estimatedHeight += 60;

  canvas.width = width;
  canvas.height = Math.max(900, estimatedHeight);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const logoUrl = new URL("./gff_logga.jpg", window.location.href).href;
  let logoWidth = 0;
  let logoHeight = 0;
  try {
    const logo = await loadImage(logoUrl);
    const maxLogoHeight = 100;
    const ratio = logo.width > 0 ? logo.height / logo.width : 1;
    logoHeight = maxLogoHeight;
    logoWidth = Math.round(maxLogoHeight / Math.max(ratio, 0.0001));
    ctx.drawImage(logo, width - side - logoWidth, side - 8, logoWidth, logoHeight);
  } catch (_error) {
    // Continue without logo if image load fails.
    logoWidth = 0;
    logoHeight = 0;
  }

  ctx.fillStyle = "#1a1a1a";
  const headerTextX = side;
  let y = side + 6;
  ctx.font = "700 52px Arial, sans-serif";
  ctx.fillText(`Gudstjänstordning ${plan.dateLabel}`, headerTextX, y);
  y += 56;

  ctx.font = "500 30px Arial, sans-serif";
  ctx.fillText(`Mötesledare: ${plan.meetingLeader || "Ej satt"}`, headerTextX, y);
  y += 42;
  if (plan.theme) {
    ctx.fillText(`Tema: ${plan.theme}`, headerTextX, y);
    y += 42;
  }

  if (logoHeight > 0) {
    y = Math.max(y, side - 8 + logoHeight + 16);
  }

  ctx.strokeStyle = "#8daf3f";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(side, y);
  ctx.lineTo(width - side, y);
  ctx.stroke();
  y += 38;

  ctx.font = "700 34px Arial, sans-serif";
  ctx.fillText("Ansvariga", side, y);
  y += 38;
  ctx.font = "500 28px Arial, sans-serif";
  if (!plan.responsibles.length) {
    ctx.fillText("Inga ansvariga ifyllda.", side, y);
    y += 44;
  } else {
    for (const person of plan.responsibles) {
      const roleText = `${person.role}:`;
      ctx.font = "700 28px Arial, sans-serif";
      ctx.fillStyle = "#1a1a1a";
      ctx.fillText(roleText, side, y);
      const roleWidth = ctx.measureText(roleText).width;
      ctx.font = "500 28px Arial, sans-serif";
      ctx.fillText(` ${person.name}`, side + roleWidth + 2, y);
      y += 40;
    }
  }

  y += 24;
  ctx.font = "700 34px Arial, sans-serif";
  ctx.fillText("Ordning", side, y);
  y += 24;

  const rowX = side;
  const border = "#d6dcc9";
  const drawCellText = (text, x, top, maxWidth, rowHeight, font = "500 26px Arial, sans-serif", color = "#1a1a1a") => {
    const lines = wrapText(text, maxWidth, font);
    ctx.font = font;
    ctx.fillStyle = color;
    const textBlockHeight = lines.length * lineHeight;
    const firstLineY = top + (rowHeight - textBlockHeight) / 2 + 26;
    lines.forEach((line, idx) => {
      ctx.fillText(line, x, firstLineY + idx * lineHeight);
    });
    return lines.length;
  };

  if (!plan.agenda.length) {
    ctx.font = "500 28px Arial, sans-serif";
    y += 24;
    ctx.fillText("Inga mötespunkter inlagda.", side, y);
  } else {
    let rowTop = y + 12;
    for (const [rowIndex, item] of plan.agenda.entries()) {
      const linesCat = wrapText(item.category || "", colWidths[1] - 16, "500 26px Arial, sans-serif").length;
      const linesTitle = wrapText(item.title || "", colWidths[2] - 16, "500 26px Arial, sans-serif").length;
      const linesOwner = wrapText(item.owner || "", colWidths[3] - 16, "500 26px Arial, sans-serif").length;
      const maxLines = Math.max(1, linesCat, linesTitle, linesOwner);
      const rowHeight = Math.max(52, 20 + maxLines * lineHeight);
      const rowFill = rowIndex % 2 === 0 ? "#fbfbfa" : "#f1f3ef";

      let cellX = rowX;
      ctx.fillStyle = rowFill;
      for (const colWidth of colWidths) {
        ctx.fillRect(cellX, rowTop, colWidth, rowHeight);
        cellX += colWidth;
      }

      cellX = rowX;
      ctx.strokeStyle = border;
      ctx.lineWidth = 2;
      for (const colWidth of colWidths) {
        ctx.strokeRect(cellX, rowTop, colWidth, rowHeight);
        cellX += colWidth;
      }

      const badgeSize = 38;
      const badgeX = rowX + colWidths[0] / 2;
      const badgeY = rowTop + rowHeight / 2;
      ctx.beginPath();
      ctx.arc(badgeX, badgeY, badgeSize / 2, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fill();
      ctx.strokeStyle = "#c8d0c0";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.font = "700 22px Arial, sans-serif";
      ctx.fillStyle = "#1a1a1a";
      const numberText = String(item.number);
      const numWidth = ctx.measureText(numberText).width;
      ctx.fillText(numberText, badgeX - numWidth / 2, badgeY + 7);
      drawCellText(item.category || "", rowX + colWidths[0] + 8, rowTop, colWidths[1] - 16, rowHeight, "500 26px Arial, sans-serif", "#1a1a1a");
      drawCellText(item.title || "", rowX + colWidths[0] + colWidths[1] + 8, rowTop, colWidths[2] - 16, rowHeight, "700 26px Arial, sans-serif", "#1a1a1a");
      drawCellText(item.owner || "", rowX + colWidths[0] + colWidths[1] + colWidths[2] + 8, rowTop, colWidths[3] - 16, rowHeight, "500 26px Arial, sans-serif", "#1a1a1a");

      rowTop += rowHeight;
    }
  }

  canvas.toBlob(
    async (blob) => {
      if (!blob) {
        window.alert("Bildexport misslyckades.");
        return;
      }

      const file = new File([blob], filename, { type: "image/jpeg" });
      const canShareFile = !!navigator.share && !!navigator.canShare && navigator.canShare({ files: [file] });

      if (canShareFile) {
        try {
          await navigator.share({ files: [file], title: `Gudstjänstordning ${plan.dateLabel}` });
          return;
        } catch (_error) {
          // Fall through to download.
        }
      }

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1200);
    },
    "image/jpeg",
    0.9
  );
}

function openPrintPage(autoPrint) {
  const key = `planprint-${Date.now()}`;
  const payload = {
    ...buildPlanData(),
    logoPath: new URL("./gff_logga.jpg", window.location.href).href
  };

  sessionStorage.setItem(key, JSON.stringify(payload));
  const printUrl = `print.html?doc=${encodeURIComponent(key)}${autoPrint ? "&mode=pdf" : ""}`;
  window.open(printUrl, "_blank", "width=900,height=1100");
}

function formatDate(raw) {
  if (!raw) return "Datum saknas";
  const date = new Date(`${raw}T12:00:00`);
  return date.toLocaleDateString("sv-SE", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultState();
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : createDefaultState();
  } catch (_error) {
    return createDefaultState();
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (_error) {
    // Ignore storage errors (private mode/full quota).
  }
}

function createDefaultState() {
  return {
    date: getNextSundayDateISO(),
    meetingLeader: "",
    theme: "",
    responsible: defaultResponsibleRoles.map((role) => ({ role, name: "", email: "", locked: true })),
    agenda: createDefaultAgenda()
  };
}

function normalizeLoadedState(rawState) {
  const defaults = createDefaultState();
  const source = rawState && typeof rawState === "object" ? rawState : {};

  const loadedResponsible = Array.isArray(source.responsible) ? source.responsible : [];
  const normalizedResponsible = defaultResponsibleRoles.map((role) => {
    const existing = loadedResponsible.find((entry) => entry && entry.role === role) || {};
    return {
      role,
      name: typeof existing.name === "string" ? existing.name : "",
      email: typeof existing.email === "string" ? existing.email : "",
      locked: true
    };
  });

  loadedResponsible.forEach((entry) => {
    if (!entry || !entry.role || defaultResponsibleRoles.includes(entry.role)) return;
    normalizedResponsible.push({
      role: String(entry.role),
      name: typeof entry.name === "string" ? entry.name : "",
      email: typeof entry.email === "string" ? entry.email : "",
      locked: Boolean(entry.locked)
    });
  });

  return {
    ...defaults,
    date: isValidIsoDate(source.date) ? source.date : defaults.date,
    meetingLeader: typeof source.meetingLeader === "string" ? source.meetingLeader : "",
    theme: typeof source.theme === "string" ? source.theme : "",
    responsible: normalizedResponsible,
    agenda: Array.isArray(source.agenda) ? source.agenda : []
  };
}

function resetAllData() {
  const confirmed = window.confirm("Skapa ny gudstjänstordning och återställ till standardschemat?");
  if (!confirmed) return;

  state = createDefaultState();
  el.serviceDate.value = state.date;
  el.meetingLeader.value = state.meetingLeader;
  el.serviceTheme.value = state.theme;
  renderResponsible();
  renderAgenda();
  renderPreview();
  syncServiceGroupResponsibleFromCalendar(state.date);
}

function getNextSundayDateISO() {
  const now = new Date();
  const day = now.getDay();
  const daysUntilSunday = day === 0 ? 7 : 7 - day;
  const nextSunday = new Date(now);
  nextSunday.setHours(12, 0, 0, 0);
  nextSunday.setDate(now.getDate() + daysUntilSunday);

  const year = nextSunday.getFullYear();
  const month = String(nextSunday.getMonth() + 1).padStart(2, "0");
  const date = String(nextSunday.getDate()).padStart(2, "0");
  return `${year}-${month}-${date}`;
}

function isValidIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime());
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

init();
