// Storage keys
const SK = "fc-cards-v1";
const PK = "fc-prefs-v1";

// State
let cards = [];
let view = "edit"; // "edit" | "review"
let order = "chronological"; // "chronological" | "random"
let direction = "term-first"; // "term-first" | "def-first"
let dark = false;

// Review state
let sessionSeed = Date.now();
let orderList = [];
let learned = new Set();
let idx = 0;
let flipped = false;

// History for undo/redo
const undoStackEdit = [];
const redoStackEdit = [];
const undoStackReview = [];
const redoStackReview = [];
const MAX_HISTORY = 100;
let lastHistoryPush = 0;
let typedSinceLastPush = false;

function cloneCards(src) { return src.map(c => ({ term: c.term, def: c.def })); }
function getState() {
    return { cards: cloneCards(cards), learned: Array.from(learned), idx, flipped, sessionSeed };
}
function applyState(s) {
    let focusRow = null, focusCol = null;
    if (view === "edit") {
        const active = document.activeElement;
        if (active && active.classList && active.classList.contains("cell")) {
            const tr = active.parentElement;
            focusRow = [...tbody.children].indexOf(tr);
            focusCol = [...tr.children].indexOf(active);
        }
    }
    cards = cloneCards(s.cards);
    learned = new Set(s.learned);
    sessionSeed = s.sessionSeed;
    if (view === "review") buildOrderList();
    idx = s.idx;
    flipped = s.flipped;
    renderView();
    scheduleSave();
    if (view === "edit" && focusRow !== null) {
        const row = tbody.children[focusRow];
        const cell = row && row.children[focusCol];
        if (cell) { cell.focus(); placeCaretEnd(cell); }
    }
}
function pushHistory(roundToWord = false) {
    let state = getState();
    if (roundToWord && view === "edit") {
        const active = document.activeElement;
        if (active && active.classList && active.classList.contains("cell")) {
            const tr = active.parentElement;
            const rowIndex = [...tbody.children].indexOf(tr);
            const colIndex = [...tr.children].indexOf(active);
            const key = colIndex === 0 ? "term" : "def";
            if (rowIndex >= 0 && rowIndex < state.cards.length) {
                const domText = active.textContent;
                const trimmed = /[\s.,!?;:]$/.test(domText)
                    ? domText.trim()
                    : domText.replace(/\s+\S*$/, "").trim();
                state.cards[rowIndex][key] = trimmed;
            }
        }
    }
    const uStack = view === "edit" ? undoStackEdit : undoStackReview;
    const rStack = view === "edit" ? redoStackEdit : redoStackReview;
    uStack.push(state);
    if (uStack.length > MAX_HISTORY) uStack.shift();
    rStack.length = 0;
    lastHistoryPush = Date.now();
    typedSinceLastPush = false;
}
function undo() {
    const uStack = view === "edit" ? undoStackEdit : undoStackReview;
    const rStack = view === "edit" ? redoStackEdit : redoStackReview;
    const prev = uStack.pop();
    if (!prev) return;
    rStack.push(getState());
    applyState(prev);
}
function redo() {
    const rStack = view === "edit" ? redoStackEdit : redoStackReview;
    const uStack = view === "edit" ? undoStackEdit : undoStackReview;
    const next = rStack.pop();
    if (!next) return;
    uStack.push(getState());
    applyState(next);
}

// Elements
const editView = document.getElementById("edit-view");
const reviewView = document.getElementById("review-view");
const tbody = document.getElementById("tbody");
const toastEl = document.getElementById("toast");
const cardEl = document.getElementById("card");
const cardText = document.getElementById("cardText");
const progress = document.getElementById("progress");

// Buttons
const btnEdit = document.getElementById("btnEdit");
const btnReview = document.getElementById("btnReview");
const btnTheme = document.getElementById("btnTheme");
const btnExport = document.getElementById("btnExport");
const btnImport = document.getElementById("btnImport");
const inputImport = document.getElementById("importFile");
const btnClear = document.getElementById("btnClear");
const btnMenu = document.getElementById("btnMenu");
const menu = document.getElementById("menu");
const clearDialog = document.getElementById("clearDialog");
const btnDeleteAll = document.getElementById("confirmDelete");
const btnCancelDelete = document.getElementById("cancelDelete");

const btnChrono = document.getElementById("btnChrono");
const btnRandom = document.getElementById("btnRandom");
const btnTermFirst = document.getElementById("btnTermFirst");
const btnDefFirst = document.getElementById("btnDefFirst");

const btnPrev = document.getElementById("btnPrev");
const btnFlip = document.getElementById("btnFlip");
const btnNext = document.getElementById("btnNext");
const btnLearned = document.getElementById("btnLearned");

// Init
loadPrefs();
loadCards();
setTheme(dark ? "dark" : "light");
renderView();

// Event wiring
btnEdit.onclick = () => showEdit();
btnReview.onclick = () => startReview();
btnTheme.onclick = () => { toggleTheme(); menu.classList.remove("show"); };

btnExport.onclick = () => { exportCSV(); menu.classList.remove("show"); };
btnImport.onclick = () => { inputImport.click(); menu.classList.remove("show"); };
inputImport.onchange = (e) => importCSV(e);
btnClear.onclick = () => { clearDialog.showModal(); menu.classList.remove("show"); };
btnDeleteAll.onclick = () => { clearAll(); clearDialog.close(); };
btnCancelDelete.onclick = () => clearDialog.close();

btnMenu.onclick = (e) => { e.stopPropagation(); menu.classList.toggle("show"); };
document.addEventListener("click", () => menu.classList.remove("show"));

btnChrono.onclick = () => setOrder("chronological");
btnRandom.onclick = () => setOrder("random");
btnTermFirst.onclick = () => setDirection("term-first");
btnDefFirst.onclick = () => setDirection("def-first");

btnPrev.onclick = () => prevCard();
btnFlip.onclick = () => flipCard();
btnNext.onclick = () => nextCard();
btnLearned.onclick = () => markLearned();

cardEl.onclick = () => flipCard();

// Delegated table events
tbody.addEventListener("input", onTableInput);
tbody.addEventListener("keydown", onTableKeydown);
tbody.addEventListener("dragover", onDragOver);
tbody.addEventListener("drop", onDrop);

// Global keys
document.addEventListener("keydown", onGlobalKey);

// ---------- Persistence ----------
function loadCards() {
    try { cards = JSON.parse(localStorage.getItem(SK) || "[]"); } catch { cards = []; }
    renderTable();
}
let saveTimer = null;
function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { localStorage.setItem(SK, JSON.stringify(cards)); }, 200);
}
function loadPrefs() {
    try {
        const p = JSON.parse(localStorage.getItem(PK) || "{}");
        if (p.order) order = p.order;
        if (p.direction) direction = p.direction;
        if (typeof p.dark === "boolean") dark = p.dark;
    } catch { }
}
function savePrefs() { localStorage.setItem(PK, JSON.stringify({ order, direction, dark })); }

// ---------- View control ----------
function renderView() {
    if (view === "edit") {
        editView.style.display = "";
        reviewView.style.display = "none";
        renderTable();
    } else {
        editView.style.display = "none";
        reviewView.style.display = "";
        renderReviewControls();
        renderCard();
    }
    // Header button states
    btnEdit.classList.toggle("primary", view === "edit");
    btnReview.classList.toggle("primary", view === "review");
    updateThemeButton();
    refreshIcons();
}
function showEdit() { view = "edit"; renderView(); }
function startReview() {
    const nonEmpty = cards.filter(c => (c.term?.trim() || c.def?.trim()));
    if (nonEmpty.length === 0) { toast("No cards yet"); return; }
    learned.clear();
    sessionSeed = Date.now();
    idx = 0;
    flipped = false;
    view = "review";
    buildOrderList();
    renderView();
}

// ---------- Table editor ----------
function renderTable() {
    tbody.innerHTML = "";
    for (const c of cards) appendRow(c.term, c.def);
    appendRow("", "");
    refreshRowHandles();
    refreshIcons();
}
function appendRow(term, def) {
    const tr = document.createElement("tr");
    const tdTerm = document.createElement("td");
    const tdDef = document.createElement("td");
    tdTerm.className = "cell";
    tdDef.className = "cell";
    tdTerm.contentEditable = "true";
    tdDef.contentEditable = "true";
    tdTerm.textContent = term;
    tdDef.textContent = def;
    const handle = document.createElement("button");
    handle.type = "button";
    handle.className = "drag-handle";
    handle.draggable = true;
    handle.tabIndex = -1;
    handle.innerHTML = '<i data-lucide="grip-vertical"></i>';
    handle.addEventListener("dragstart", (e) => onDragStart(e, tr));
    handle.addEventListener("dragend", onDragEnd);
    tdTerm.appendChild(handle);
    tr.appendChild(tdTerm);
    tr.appendChild(tdDef);
    tbody.appendChild(tr);
}

function refreshRowHandles() {
    const rows = [...tbody.querySelectorAll("tr")];
    rows.forEach((r, i) => {
        const handle = r.querySelector(".drag-handle");
        if (!handle) return;
        const term = r.children[0].textContent.trim();
        const def = r.children[1].textContent.trim();
        const isBlank = !term && !def && i === rows.length - 1;
        handle.style.display = isBlank ? "none" : "";
        handle.draggable = !isBlank;
    });
}
function clearAll() {
    pushHistory();
    cards = [];
    learned.clear();
    orderList = [];
    idx = 0;
    flipped = false;
    localStorage.setItem(SK, JSON.stringify(cards)); // save empty
    renderTable();                                    // rebuild with blank row
    if (view === 'review') showEdit();               // bounce back to Edit if needed
    toast('Cleared');
}
function onTableInput() {
    const rows = [...tbody.querySelectorAll("tr")];
    const next = [];
    for (const r of rows) {
        const term = r.children[0].textContent.trim();
        const def = r.children[1].textContent.trim();
        if (term || def) next.push({ term, def });
    }
    cards = next;
    const last = rows[rows.length - 1];
    const hasContent = !!(last?.children[0].textContent.trim() || last?.children[1].textContent.trim());
    if (hasContent) appendRow("", "");
    scheduleSave();
    refreshRowHandles();
    refreshIcons();
    const now = Date.now();
    if (!typedSinceLastPush || now - lastHistoryPush >= 5000) pushHistory(true);
    typedSinceLastPush = true;
}
function onTableKeydown(e) {
    const isCell = e.target && e.target.classList && e.target.classList.contains("cell");
    if (!isCell) return;

    if (e.key === "Backspace" || e.key === "Delete") { pushHistory(); typedSinceLastPush = true; }

    const td = e.target;
    const tr = td.parentElement;
    const rowIndex = [...tbody.children].indexOf(tr);
    const colIndex = [...tr.children].indexOf(td);

    // Enter moves across/adds row
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (colIndex === 0) {
            tr.children[1].focus();
            placeCaretEnd(tr.children[1]);
        } else {
            const nextRow = tbody.children[rowIndex + 1];
            if (!nextRow) appendRow("", "");
            const targetRow = tbody.children[rowIndex + 1];
            const targetCell = targetRow.children[0];
            targetCell.focus();
            placeCaretEnd(targetCell);
        }
        return;
    }

    // Ctrl/Cmd + Backspace clears current cell
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "backspace") {
        e.preventDefault();
        td.textContent = "";
        onTableInput();
        return;
    }

    // Delete on empty row removes it
    if (e.key === "Delete") {
        const rowEmpty = !tr.children[0].textContent.trim() && !tr.children[1].textContent.trim();
        if (rowEmpty && tbody.children.length > 1) {
            e.preventDefault();
            tr.remove();
            onTableInput();
            const newRow = tbody.children[Math.min(rowIndex, tbody.children.length - 1)];
            if (newRow) {
                const cell = newRow.children[Math.min(colIndex, 1)];
                cell.focus();
                placeCaretEnd(cell);
            }
        }
    }
}

// Drag and drop reordering
let draggedRow = null;
const dropLine = document.createElement("tr");
dropLine.className = "drop-line";
dropLine.innerHTML = '<td colspan="2"></td>';

function onDragStart(e, row) {
    draggedRow = row;
    draggedRow.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", "");
    e.dataTransfer.setDragImage(row, 0, 0);
}

function onDragOver(e) {
    if (!draggedRow) return;
    e.preventDefault();
    const target = e.target.closest("tr");
    if (!target || target === draggedRow || target === dropLine) return;
    const rect = target.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    tbody.insertBefore(dropLine, before ? target : target.nextSibling);
}

function onDrop(e) {
    if (!draggedRow) return;
    e.preventDefault();
    const moved = !!dropLine.parentElement;
    if (moved) {
        tbody.insertBefore(draggedRow, dropLine);
        dropLine.remove();
    }
    draggedRow.classList.remove("dragging");
    draggedRow = null;
    if (moved) {
        updateCardsFromDOM();
        pushHistory();
    }
}

function onDragEnd() {
    if (draggedRow) draggedRow.classList.remove("dragging");
    dropLine.remove();
    draggedRow = null;
}

function updateCardsFromDOM() {
    const rows = [...tbody.querySelectorAll("tr:not(.drop-line)")];
    const next = [];
    for (const r of rows) {
        const term = r.children[0].textContent.trim();
        const def = r.children[1].textContent.trim();
        if (term || def) next.push({ term, def });
    }
    cards = next;
    renderTable();
    scheduleSave();
}


// ---------- Review ----------
function renderReviewControls() {
    btnChrono.classList.toggle("active", order === "chronological");
    btnRandom.classList.toggle("active", order === "random");
    btnTermFirst.classList.toggle("active", direction === "term-first");
    btnDefFirst.classList.toggle("active", direction === "def-first");
    refreshIcons();
}
function buildOrderList() {
    let indices = cards.map((_, i) => i);
    if (order === "random") {
        const rng = mulberry32(sessionSeed);
        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }
    }
    orderList = indices.filter(i => !learned.has(i));
    if (idx >= orderList.length) idx = 0;
}
function renderCard() {
    if (orderList.length === 0) {
        cardText.textContent = "All done. You marked everything as learned.";
        progress.textContent = "";
        return;
    }
    const globalIndex = orderList[idx];
    const c = cards[globalIndex];
    const front = direction === "term-first" ? c.term : c.def;
    const back = direction === "term-first" ? c.def : c.term;
    cardText.textContent = flipped ? (back || "(empty)") : (front || "(empty)");
    progress.textContent = `${Math.min(idx + 1, orderList.length)} of ${orderList.length}`;
}
function nextCard() { if (orderList.length === 0) return; flipped = false; idx = (idx + 1) % orderList.length; renderCard(); }
function prevCard() { if (orderList.length === 0) return; flipped = false; idx = (idx - 1 + orderList.length) % orderList.length; renderCard(); }
function flipCard() { if (orderList.length === 0) return; flipped = !flipped; renderCard(); }
function setOrder(newOrder) {
    order = newOrder; savePrefs();
    if (view === "review") { sessionSeed = Date.now(); buildOrderList(); flipped = false; idx = 0; renderReviewControls(); renderCard(); toast("Order: " + (order === "random" ? "Random" : "Chronological")); }
}
function setDirection(newDir) {
    direction = newDir; savePrefs();
    if (view === "review") { flipped = false; renderReviewControls(); renderCard(); toast(direction === "term-first" ? "Term → Definition" : "Definition → Term"); }
}
function markLearned() {
    if (orderList.length === 0) return;
    pushHistory();
    const globalIndex = orderList[idx];
    learned.add(globalIndex);
    buildOrderList();
    flipped = false;
    idx = 0;
    renderCard();
}

// ---------- Theme ----------
function setTheme(mode) {
    document.body.dataset.theme = mode === "dark" ? "dark" : "light";
    dark = mode === "dark";
    savePrefs();
    updateThemeButton();
    refreshIcons();
}
function toggleTheme() { setTheme(dark ? "light" : "dark"); }
function updateThemeButton() {
    btnTheme.innerHTML = dark
        ? '<i data-lucide="sun"></i><span>Light Mode</span>'
        : '<i data-lucide="moon"></i><span>Dark Mode</span>';
}

// ---------- CSV ----------
function exportCSV() {
    const rows = cards.filter(c => c.term.trim() || c.def.trim());
    const csv = ["Term,Definition"].concat(rows.map(({ term, def }) => [term, def].map(csvEscape).join(","))).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "flashcards.csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast("Exported CSV");
}
function csvEscape(v = "") { return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function importCSV(e) {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        const text = String(reader.result || "");
        const parsed = parseCSV(text);
        if (parsed.length === 0) { toast("Nothing to import"); return; }
        pushHistory();
        cards = parsed; renderTable(); scheduleSave(); toast("Imported"); e.target.value = "";
    };
    reader.readAsText(file);
}
function parseCSV(text) {
    const lines = text.replace(/\r/g, "").split("\n").filter(l => l.length > 0);
    if (lines.length === 0) return [];
    const start = lines[0].toLowerCase().startsWith("term,definition") ? 1 : 0;
    const out = [];
    for (let i = start; i < lines.length; i++) {
        const fields = splitCSVLine(lines[i]);
        const term = fields[0] || ""; const def = fields[1] || "";
        if (term.trim() || def.trim()) out.push({ term, def });
    }
    return out;
}
function splitCSVLine(line) {
    const res = []; let cur = ""; let inQ = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQ) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else { inQ = false; } } else cur += ch; }
        else { if (ch === ",") { res.push(cur); cur = ""; } else if (ch === '"') { inQ = true; } else cur += ch; }
    }
    res.push(cur); return res;
}

// ---------- Global shortcuts ----------
function onGlobalKey(e) {
    if (clearDialog.open) return;
    const isEditingCell = document.activeElement && document.activeElement.classList && document.activeElement.classList.contains("cell");
    const key = e.key ? e.key.toLowerCase() : "";
    const ctrlOrMeta = e.ctrlKey || e.metaKey;

    // Allow save even while typing
    if (ctrlOrMeta && key === "s") {
        e.preventDefault();
        localStorage.setItem(SK, JSON.stringify(cards));
        toast("Saved");
        return;
    }

    // Undo/redo work even while typing
    if (ctrlOrMeta && key === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if (ctrlOrMeta && (key === "y" || (key === "z" && e.shiftKey))) { e.preventDefault(); redo(); return; }

    // If focused inside a table cell, ignore all other global shortcuts so typing never stops
    if (isEditingCell) return;

    if (view === "edit") {
        if (!e.metaKey && !e.ctrlKey) {
            if (key === "r") { startReview(); toast("Restarted review"); e.preventDefault(); return; }
            if (key === "e") { showEdit(); e.preventDefault(); return; }
        }
        return;
    }

    if (view === "review") {
        if (e.key === "Escape") { showEdit(); return; }
        const k = key;
        if (k === " " || k === "f") { e.preventDefault(); flipCard(); return; }
        if (k === "j" || e.key === "ArrowRight") { e.preventDefault(); nextCard(); return; }
        if (k === "k" || e.key === "ArrowLeft") { e.preventDefault(); prevCard(); return; }
        if (k === "1") { setOrder("chronological"); return; }
        if (k === "2" || k === "s") { setOrder(order === "random" ? "chronological" : "random"); return; }
        if (k === "t") { setDirection("term-first"); return; }
        if (k === "d") { setDirection("def-first"); return; }
        if (k === "l") { e.preventDefault(); markLearned(); return; }
        if (k === "e") { showEdit(); return; }
        if (k === "r") { startReview(); toast("Restarted review"); return; }
    }
}

// ---------- Helpers ----------
function toast(msg) {
    toastEl.textContent = msg; toastEl.classList.add("show");
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => toastEl.classList.remove("show"), 1200);
}
function placeCaretEnd(el) {
    const range = document.createRange(); range.selectNodeContents(el); range.collapse(false);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
}
function mulberry32(a) {
    return function () { let t = a += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }
}
function refreshIcons() { if (window.lucide && lucide.createIcons) try { lucide.createIcons(); } catch (_) { } }
    