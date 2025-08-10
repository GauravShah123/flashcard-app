(function () {
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
    const USED_KEY = 'fc-kb-used-v1';
    const CELEB_KEY = 'fc-kb-celebrated-v1';
    const BACKDROP = document.getElementById('kbBackdrop');
    const MODAL = document.getElementById('kbModal');
    const EL_GLOBAL = document.getElementById('kbGlobal');
    const EL_EDIT = document.getElementById('kbEdit');
    const EL_REVIEW = document.getElementById('kbReview');

    const KB = {
        global: [
            { id: 'help', title: 'Open shortcuts menu', combos: [[isMac ? 'Cmd' : 'Ctrl', 'Shift', '/']], track: true },
            { id: 'save', title: 'Save', combos: [[isMac ? 'Cmd' : 'Ctrl', 'S']], track: true },
            { id: 'edit', title: 'Go to Edit view', combos: [['E']], track: true },
            { id: 'review', title: 'Start or restart review', combos: [['R']], track: true },
        ],
        edit: [
            { id: 'clear', title: 'Clear current cell', combos: [[isMac ? 'Cmd' : 'Ctrl', 'Backspace']], track: false },
        ],
        review: [
            { id: 'flip', title: 'Flip', combos: [["Space"], ["F"]], track: true },
            { id: 'next', title: 'Next card', combos: [["J"], ["→"]], track: true },
            { id: 'prev', title: 'Previous card', combos: [["K"], ["←"]], track: true },
            { id: 'learned', title: 'Mark learned', combos: [["L"]], track: true },
            { id: 'chrono', title: 'Chronological order', combos: [["1"]], track: true },
            { id: 'random', title: 'Toggle random', combos: [["2"], ["S"]], track: true },
            { id: 'termfirst', title: 'Term first', combos: [["T"]], track: true },
            { id: 'deffirst', title: 'Definition first', combos: [["D"]], track: true },
        ]
    };
    const TRACKED = [...KB.global, ...KB.review].filter(x => x.track).map(x => x.id);

    let used = {};
    try { used = JSON.parse(localStorage.getItem(USED_KEY) || '{}'); } catch { used = {}; }
    let celebrated = localStorage.getItem(CELEB_KEY) === '1';
    let open = false;

    function saveUsed() { localStorage.setItem(USED_KEY, JSON.stringify(used)); }

    function markUsed(id) {
        if (!id) return;
        if (!used[id]) {
            used[id] = true;
            saveUsed();
            render();
            checkWin();
        }
    }

    function escapeHtml(s) { return s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
    function comboHTML(keys) { return keys.map(k => `<span class="keycap">${escapeHtml(k)}</span>`).join(' '); }
    function combosHTML(list) { return list.map((keys, i) => comboHTML(keys)).join('<span class="or">or</span>'); }
    function rowHTML(item) {
        const done = !!used[item.id];
        return `<div class="kb-row"><div class="kb-left">${item.title}</div><div class="kb-right ${done ? 'done' : ''}">${combosHTML(item.combos)}</div></div>`;
    }

    function render() {
        EL_GLOBAL.innerHTML = KB.global.map(rowHTML).join('');
        EL_EDIT.innerHTML = KB.edit.map(rowHTML).join('');
        EL_REVIEW.innerHTML = KB.review.map(rowHTML).join('');
    }

    function openModal() {
        open = true;
        BACKDROP.classList.add('show');
        BACKDROP.setAttribute('aria-hidden', 'false');
        MODAL.focus();
    }
    function closeModal() {
        open = false;
        BACKDROP.classList.remove('show');
        BACKDROP.setAttribute('aria-hidden', 'true');
    }

    // Click outside to close
    BACKDROP.addEventListener('click', function (e) { if (e.target === BACKDROP) closeModal(); });

    function checkWin() {
        const total = TRACKED.length;
        const count = TRACKED.filter(k => used[k]).length;
        if (count === total && !celebrated) {
            celebrated = true;
            localStorage.setItem(CELEB_KEY, '1');
            confetti();
        }
    }

    function confetti() {
        const layer = document.createElement('div');
        layer.className = 'confetti';
        document.body.appendChild(layer);
        const n = 60;
        for (let i = 0; i < n; i++) {
            const el = document.createElement('i');
            el.style.left = Math.random() * 100 + 'vw';
            el.style.top = '-10px';
            el.style.background = `hsl(${Math.floor(Math.random() * 360)},80%,60%)`;
            el.style.transform = `translateY(-20px) rotate(${Math.random() * 180}deg)`;
            el.style.animationDelay = Math.random() * 0.3 + 's';
            layer.appendChild(el);
        }
        setTimeout(() => { layer.remove(); }, 1400);
    }

    // Initial render
    render();

    function isEditingCell() {
        const a = document.activeElement; return !!(a && a.classList && a.classList.contains('cell'));
    }

    // Capture keydown first to handle modal open or close cleanly
    document.addEventListener('keydown', function (e) {
        const ctrlOrMeta = e.ctrlKey || e.metaKey;
        const helpCombo = ctrlOrMeta && e.shiftKey && (e.key === '?' || e.key === '/');
        if (open) {
            if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closeModal(); return; }
            if (helpCombo) { e.preventDefault(); e.stopImmediatePropagation(); closeModal(); return; }
        } else {
            if (helpCombo) { e.preventDefault(); e.stopImmediatePropagation(); openModal(); markUsed('help'); return; }
        }
    }, true);

    // Track usage without changing existing handlers
    document.addEventListener('keydown', function (e) {
        if (isEditingCell()) {
            const ctrlOrMeta = e.ctrlKey || e.metaKey;
            if (ctrlOrMeta && e.key && e.key.toLowerCase() === 's') { markUsed('save'); }
            return;
        }
        if (open) return; // don't count usage while menu is open
        const k = e.key; const lower = k ? k.toLowerCase() : ''; const ctrlOrMeta = e.ctrlKey || e.metaKey;

        // Global
        if (ctrlOrMeta && lower === 's') { markUsed('save'); }
        if (!ctrlOrMeta && lower === 'e') { markUsed('edit'); }
        if (!ctrlOrMeta && lower === 'r') { markUsed('review'); }

        // Review-only
        if (typeof view !== 'undefined' && view === 'review') {
            if (lower === ' ' || lower === 'f') { markUsed('flip'); }
            if (lower === 'j' || k === 'ArrowRight') { markUsed('next'); }
            if (lower === 'k' || k === 'ArrowLeft') { markUsed('prev'); }
            if (lower === 'l') { markUsed('learned'); }
            if (lower === '1') { markUsed('chrono'); }
            if (lower === '2' || lower === 's') { markUsed('random'); }
            if (lower === 't') { markUsed('termfirst'); }
            if (lower === 'd') { markUsed('deffirst'); }
        }
    }, false);
})();
    