const DEFAULT_SERVICES = [
    { id: 1, name: "Desain Logo Usaha / UMKM", category: "Desain Grafis", price: 100000, unit: "paket", note: "Konsep original, file master siap cetak + PNG transparan. Garansi 2x revisi." },
    { id: 2, name: "Banner / X-Banner (Desain + Cetak)", category: "Banner & Dokumen", price: 75000, unit: "paket", note: "Bahan Flexi 280gr warna pekat + mata ayam / rangka X-Banner siap pasang." },
    { id: 3, name: "Brosur / Poster Promosi", category: "Banner & Dokumen", price: 50000, unit: "paket", note: "Desain layout tajam & informatif (A4/A5), siap cetak massal atau sebar sosmed." },
    { id: 4, name: "Sertifikat / Piagam Acara", category: "Banner & Dokumen", price: 35000, unit: "paket", note: "Desain formal/modern + cetak kertas Linen/Art Carton 260gr (bisa sekalian input nama)." },
    { id: 5, name: "Cover Buku / Modul / LKS", category: "Desain Grafis", price: 65000, unit: "paket", note: "Setting ukuran punggung buku (spine) & bleed presisi siap naik cetak." },
    { id: 6, name: "Stiker Label Kemasan A3+ (Include Cut)", category: "Cetak & Stiker", price: 15000, unit: "lembar", note: "Stiker Vinyl tahan air / Chromo + sudah termasuk potong pola (kiss-cut)." },
    { id: 7, name: "Kartu Nama Bisnis (1 Box Isi 100)", category: "Cetak & Stiker", price: 45000, unit: "box", note: "Bahan Art Carton 260gr tebal, cetak tajam 1 atau 2 sisi + box kartu." },
    { id: 8, name: "ID Card Panitia / Karyawan PVC", category: "Cetak & Stiker", price: 12000, unit: "pcs", note: "Bahan PVC tebal standar kartu ATM, anti luntur, warna cerah." },
    { id: 9, name: "Desain & Cetak Daftar Menu", category: "Banner & Dokumen", price: 55000, unit: "paket", note: "Layout menu menggugah selera + opsi cetak laminasi glossy/doff tahan cipratan air." },
    { id: 10, name: "Edit Foto / Ganti Background / Retouch", category: "Desain Grafis", price: 15000, unit: "foto", note: "Pas foto, hapus objek, perbaikan pencahayaan, atau kolase siap cetak." }
];

const WA_NUMBER = "6285701382605";
const CATEGORIES = ['Semua', 'Desain Grafis', 'Cetak & Stiker', 'Banner & Dokumen'];

const state = {
    services: [],
    cart: {},
    selectedCategory: 'Semua',
    isAdminUnlocked: false,
    isAdminMenuRevealed: false,
    adminUsername: '',
    adminToken: '',
    isMobileDrawerOpen: false,
    isMobileNavOpen: false,
    customerName: '',
    customerNote: '',
    logoTapCount: 0,
    logoTapTimer: null
};

const $ = (id) => document.getElementById(id);
const safeIcons = () => window.lucide?.createIcons?.();
const formatRupiah = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const getSelectedItems = () => Object.entries(state.cart)
    .map(([id, qty]) => {
        const item = state.services.find(s => s.id === Number(id));
        return item ? { ...item, qty, subtotal: item.price * qty } : null;
    })
    .filter(Boolean);

async function parseJsonSafe(res) {
    try {
        return await res.json();
    } catch {
        return {};
    }
}

function showToast(message) {
    const toast = $('toast'), msgEl = $('toast-msg');
    if (!toast || !msgEl) return;
    msgEl.textContent = message;
    toast.classList.remove('translate-y-2', 'opacity-0', 'pointer-events-none');
    setTimeout(() => toast.classList.add('translate-y-2', 'opacity-0', 'pointer-events-none'), 2500);
}

function authHeaders(withJson = false) {
    const h = {};
    if (withJson) h['Content-Type'] = 'application/json';
    if (state.adminToken) h['Authorization'] = `Bearer ${state.adminToken}`;
    return h;
}

function getCategoryBadgeStyle(category) {
    if (category === 'Desain Grafis') return 'bg-eras-gold/30 text-eras-deep border-eras-navy';
    if (category === 'Cetak & Stiker') return 'bg-eras-sky text-eras-navy border-eras-navy';
    return 'bg-eras-coral/15 text-eras-coral border-eras-coral';
}

// =========================================================================
// AUTH UI & NAVIGASI
// =========================================================================
function revealAdminNavButtons() {
    state.isAdminMenuRevealed = true;
    $('btn-mode-admin')?.classList.remove('hidden');
    $('btn-mode-admin-mobile')?.classList.remove('hidden');
    const grid = $('mobile-mode-grid');
    if (grid) {
        grid.classList.remove('grid-cols-1');
        grid.classList.add('grid-cols-2');
    }
}

function handleSecretAdminTrigger() {
    state.logoTapCount += 1;
    clearTimeout(state.logoTapTimer);
    state.logoTapTimer = setTimeout(() => { state.logoTapCount = 0; }, 2000);
    if (state.logoTapCount >= 5) {
        state.logoTapCount = 0;
        revealAdminNavButtons();
        switchMode('admin');
        showToast('Mode Admin terbuka');
    }
}

function togglePasswordVisibility(inputId, iconId) {
    const input = $(inputId), icon = $(iconId);
    if (!input) return;
    const hidden = input.type === 'password';
    input.type = hidden ? 'text' : 'password';
    icon?.setAttribute('data-lucide', hidden ? 'eye-off' : 'eye');
    safeIcons();
}

function switchAuthTab(tab) {
    $('auth-form-login')?.classList.toggle('hidden', tab !== 'login');
    $('auth-form-register')?.classList.toggle('hidden', tab !== 'register');
    $('auth-form-forgot')?.classList.toggle('hidden', tab !== 'forgot');
    ['pin-error', 'reg-feedback', 'forgot-feedback'].forEach(id => $(id)?.classList.add('hidden'));

    const tabLogin = $('tab-auth-login'), tabReg = $('tab-auth-register');
    if (tabLogin && tabReg) {
        const active = 'py-2 rounded-lg bg-eras-gold text-eras-deep border border-eras-navy transition-all';
        const idle = 'py-2 rounded-lg text-eras-navy hover:bg-white/70 transition-all';
        tabLogin.className = tab === 'login' ? active : idle;
        tabReg.className = tab === 'register' ? active : idle;
    }
    safeIcons();
}

function toggleMobileNav(forceState) {
    const menu = $('mobile-nav-menu'), btn = $('btn-mobile-hamburger'), icon = $('mobile-hamburger-icon');
    if (!menu || !btn || !icon) return;
    state.isMobileNavOpen = typeof forceState === 'boolean' ? forceState : !state.isMobileNavOpen;
    menu.classList.toggle('hidden', !state.isMobileNavOpen);
    btn.setAttribute('aria-expanded', String(state.isMobileNavOpen));
    icon.setAttribute('data-lucide', state.isMobileNavOpen ? 'x' : 'menu');
    safeIcons();
}

const closeMobileNav = () => { if (state.isMobileNavOpen) toggleMobileNav(false); };

function switchMode(mode) {
    const isUser = mode === 'user';
    if (!isUser) revealAdminNavButtons();

    $('view-user')?.classList.toggle('hidden', !isUser);
    $('view-admin')?.classList.toggle('hidden', isUser);
    $('mobile-bottom-bar')?.classList.toggle('hidden', !isUser);

    const deskActive = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all bg-eras-gold text-eras-deep shadow-xs';
    const deskIdle = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all text-eras-navy hover:bg-white/60';
    const mobActive = 'flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-extrabold border-2 border-eras-navy bg-eras-gold text-eras-deep shadow-[0_2px_0_#1E6091]';
    const mobIdle = 'flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold border-2 border-eras-navy/30 bg-eras-skylight text-eras-navy';

    if ($('btn-mode-user')) $('btn-mode-user').className = isUser ? deskActive : deskIdle;
    if ($('btn-mode-admin') && state.isAdminMenuRevealed) $('btn-mode-admin').className = !isUser ? deskActive : deskIdle;
    if ($('btn-mode-user-mobile')) $('btn-mode-user-mobile').className = isUser ? mobActive : mobIdle;
    if ($('btn-mode-admin-mobile') && state.isAdminMenuRevealed) $('btn-mode-admin-mobile').className = !isUser ? mobActive : mobIdle;

    if (isUser) {
        renderCategories();
        renderCatalog();
        updateCartUI();
    } else {
        renderAdminView();
    }
    safeIcons();
}

// =========================================================================
// KATALOG & KERANJANG
// =========================================================================
async function fetchServicesFromDb() {
    try {
        const res = await fetch('/api/items', { cache: 'no-store' });
        if (!res.ok) throw new Error('Gagal mengambil /api/items');
        const rows = await res.json();
        if (!Array.isArray(rows)) throw new Error('Format data /api/items tidak valid');
        state.services = rows.map(r => ({
            id: Number(r.id),
            name: String(r.name),
            category: String(r.category),
            price: Number(r.price),
            unit: String(r.unit),
            note: r.note ? String(r.note) : ''
        }));
    } catch (err) {
        console.error(err);
        state.services = [...DEFAULT_SERVICES];
        showToast('Mode fallback lokal: periksa koneksi Turso di Vercel');
    }

    renderCategories();
    renderCatalog();
    updateCartUI();
    if (state.isAdminUnlocked) renderAdminServiceList();
}

function renderCategories() {
    const container = $('category-pills');
    if (!container) return;
    container.innerHTML = CATEGORIES.map(cat => {
        const cls = state.selectedCategory === cat
            ? 'bg-eras-navy text-white border-eras-navy shadow-[0_2px_0_#17496D]'
            : 'bg-eras-skylight text-eras-navy border-eras-navy/30 hover:bg-eras-sky';
        return `<button onclick="selectCategory('${cat}')" class="px-3.5 py-1.5 rounded-xl text-xs font-extrabold border-2 whitespace-nowrap transition-all ${cls}">${cat}</button>`;
    }).join('');
}

function selectCategory(cat) {
    state.selectedCategory = cat;
    renderCategories();
    renderCatalog();
}

function resetFilters() {
    state.selectedCategory = 'Semua';
    if ($('search-input')) $('search-input').value = '';
    renderCategories();
    renderCatalog();
}

function renderCatalog() {
    const grid = $('catalog-grid'), emptyState = $('empty-search');
    if (!grid || !emptyState) return;

    const q = ($('search-input')?.value || '').toLowerCase().trim();
    const filtered = state.services.filter(item =>
        (state.selectedCategory === 'Semua' || item.category === state.selectedCategory) &&
        (item.name.toLowerCase().includes(q) || (item.note && item.note.toLowerCase().includes(q)))
    );

    if (!filtered.length) {
        grid.innerHTML = '';
        emptyState.classList.remove('hidden');
        safeIcons();
        return;
    }

    emptyState.classList.add('hidden');
    grid.innerHTML = filtered.map(item => {
        const qty = state.cart[item.id] || 0;
        const selected = qty > 0;
        return `
            <div class="${selected ? 'eras-card eras-card-selected' : 'eras-card'} rounded-2xl p-4 flex flex-col justify-between">
                <div>
                    <div class="flex items-center justify-between gap-2 mb-2.5">
                        <span class="px-2.5 py-0.5 rounded-lg text-[10px] font-extrabold border ${getCategoryBadgeStyle(item.category)}">${item.category}</span>
                        ${selected ? `<span class="text-[11px] font-mono font-bold text-eras-coral">Subtotal: ${formatRupiah(item.price * qty)}</span>` : ''}
                    </div>
                    <div class="flex items-start gap-2">
                        <i data-lucide="check-circle-2" class="w-4 h-4 text-eras-blue shrink-0 mt-0.5"></i>
                        <h3 class="font-display font-bold text-eras-navy text-base leading-snug">${item.name}</h3>
                    </div>
                    <p class="text-xs font-medium text-eras-deep/75 mt-1.5 leading-relaxed pl-6">${item.note || 'Standar warna CMYK akurat & siap naik cetak.'}</p>
                </div>
                <div class="mt-4 pt-3 border-t-2 border-eras-sky flex items-center justify-between gap-2">
                    <div>
                        <div class="font-mono font-bold text-base text-eras-navy">${formatRupiah(item.price)}</div>
                        <div class="text-[11px] font-bold text-eras-blue">per ${item.unit}</div>
                    </div>
                    ${qty === 0 ? `
                        <button onclick="updateQty(${item.id}, 1)" class="px-3.5 py-2 rounded-xl eras-btn-primary text-xs font-extrabold flex items-center gap-1.5">
                            <i data-lucide="plus" class="w-3.5 h-3.5"></i><span>Pilih</span>
                        </button>
                    ` : `
                        <div class="flex items-center bg-eras-skylight rounded-xl p-1 border-2 border-eras-navy">
                            <button onclick="updateQty(${item.id}, -1)" class="w-7 h-7 rounded-lg bg-white text-eras-navy hover:bg-eras-coral hover:text-white flex items-center justify-center font-bold border border-eras-navy/30 transition-colors">
                                <i data-lucide="minus" class="w-3.5 h-3.5"></i>
                            </button>
                            <input type="number" min="1" value="${qty}" onchange="setExactQty(${item.id}, this.value)" class="w-10 text-center font-mono font-bold text-xs bg-transparent focus:outline-none text-eras-navy">
                            <button onclick="updateQty(${item.id}, 1)" class="w-7 h-7 rounded-lg bg-eras-gold text-eras-deep hover:bg-eras-goldhover flex items-center justify-center font-bold border border-eras-navy transition-colors">
                                <i data-lucide="plus" class="w-3.5 h-3.5"></i>
                            </button>
                        </div>
                    `}
                </div>
            </div>`;
    }).join('');
    safeIcons();
}

function updateQty(id, delta) {
    const next = (state.cart[id] || 0) + delta;
    if (next <= 0) delete state.cart[id];
    else state.cart[id] = next;
    renderCatalog();
    updateCartUI();
}

function setExactQty(id, rawVal) {
    const val = parseInt(rawVal, 10);
    if (isNaN(val) || val <= 0) delete state.cart[id];
    else state.cart[id] = val;
    renderCatalog();
    updateCartUI();
}

function clearCart() {
    state.cart = {};
    if (state.isMobileDrawerOpen) toggleMobileDrawer(false);
    renderCatalog();
    updateCartUI();
}

function syncCustomerInputs(source) {
    const isDesk = source === 'desktop';
    state.customerName = $(isDesk ? 'customer-name-desktop' : 'customer-name-mobile')?.value || '';
    state.customerNote = $(isDesk ? 'customer-note-desktop' : 'customer-note-mobile')?.value || '';
    if ($('customer-name-desktop')) $('customer-name-desktop').value = state.customerName;
    if ($('customer-note-desktop')) $('customer-note-desktop').value = state.customerNote;
    if ($('customer-name-mobile')) $('customer-name-mobile').value = state.customerName;
    if ($('customer-note-mobile')) $('customer-note-mobile').value = state.customerNote;
}

function updateCartUI() {
    const selected = getSelectedItems();
    const totalCount = selected.reduce((sum, i) => sum + i.qty, 0);
    const grandTotal = selected.reduce((sum, i) => sum + i.subtotal, 0);

    const deskList = $('desktop-cart-items'), mobList = $('mobile-cart-items');
    const deskTotal = $('desktop-grand-total'), mobTotal = $('mobile-grand-total');
    const btnDesk = $('btn-wa-desktop'), btnMob = $('btn-wa-mobile');
    if (!deskList || !mobList || !deskTotal || !mobTotal || !btnDesk || !btnMob) return;

    deskTotal.textContent = formatRupiah(grandTotal);
    mobTotal.textContent = formatRupiah(grandTotal);

    if (!selected.length) {
        deskList.innerHTML = `<div class="py-6 text-center text-eras-blue/70"><i data-lucide="sparkles" class="w-8 h-8 mx-auto mb-2 text-eras-gold"></i><p class="text-xs font-semibold">Belum ada layanan dipilih.<br>Klik tombol <b class="text-eras-navy">+ Pilih</b> di samping.</p></div>`;
        mobList.innerHTML = '<p class="text-xs font-semibold text-eras-blue text-center py-2">Belum ada item dipilih.</p>';
        ['btn-clear-desktop', 'desktop-note-box', 'mobile-badge-count'].forEach(id => $(id)?.classList.add('hidden'));

        btnDesk.disabled = true;
        btnDesk.className = 'w-full py-3 px-4 rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 transition-all bg-slate-100 text-slate-400 border-2 border-slate-200 cursor-not-allowed';
        btnDesk.innerHTML = `<i data-lucide="message-circle" class="w-4 h-4"></i><span>Pilih Layanan Dulu</span>`;

        btnMob.disabled = true;
        btnMob.className = 'px-4 py-3 rounded-xl font-extrabold text-xs sm:text-sm flex items-center gap-2 shrink-0 transition-all bg-slate-100 text-slate-400 border-2 border-slate-200 cursor-not-allowed';
    } else {
        const html = selected.map(item => `
            <div class="flex items-start justify-between gap-2 bg-eras-skylight p-2.5 rounded-xl border border-eras-navy/25">
                <div class="min-w-0 flex-1">
                    <div class="font-bold text-xs text-eras-navy truncate">${item.name}</div>
                    <div class="text-[11px] font-semibold text-eras-blue mt-0.5">${item.qty} ${item.unit} × ${formatRupiah(item.price)}</div>
                </div>
                <div class="text-right shrink-0">
                    <div class="font-mono font-bold text-xs text-eras-deep">${formatRupiah(item.subtotal)}</div>
                    <button onclick="updateQty(${item.id}, -${item.qty})" class="text-[10px] font-extrabold text-eras-coral hover:underline mt-0.5">Hapus</button>
                </div>
            </div>`).join('');

        deskList.innerHTML = html;
        mobList.innerHTML = html;
        ['btn-clear-desktop', 'desktop-note-box'].forEach(id => $(id)?.classList.remove('hidden'));

        const badge = $('mobile-badge-count');
        if (badge) {
            badge.textContent = totalCount;
            badge.classList.remove('hidden');
        }

        btnDesk.disabled = false;
        btnDesk.className = 'w-full py-3 px-4 rounded-xl eras-btn-primary font-extrabold text-sm flex items-center justify-center gap-2 cursor-pointer';
        btnDesk.innerHTML = `<i data-lucide="message-circle" class="w-4 h-4"></i><span>Order via WhatsApp</span>`;

        btnMob.disabled = false;
        btnMob.className = 'px-4 py-3 rounded-xl eras-btn-primary font-extrabold text-xs sm:text-sm flex items-center gap-2 shrink-0 cursor-pointer';
    }
    safeIcons();
}

function toggleMobileDrawer(forceState) {
    const drawer = $('mobile-drawer'), chevron = $('mobile-drawer-chevron');
    if (!drawer || !chevron) return;
    state.isMobileDrawerOpen = typeof forceState === 'boolean' ? forceState : !state.isMobileDrawerOpen;
    drawer.classList.toggle('hidden', !state.isMobileDrawerOpen);
    chevron.classList.toggle('rotate-180', state.isMobileDrawerOpen);
}

// =========================================================================
// CHECKOUT WHATSAPP
// =========================================================================
function buildWhatsAppMessage() {
    const selected = getSelectedItems();
    const grandTotal = selected.reduce((sum, i) => sum + i.subtotal, 0);
    return [
        "Halo kak *ERAS DESIGN* (@onyoure_ra), saya mau order desain/cetak lewat katalog web:",
        ...(state.customerName.trim() ? [`Nama / Usaha: *${state.customerName.trim()}*`] : []),
        "",
        "*Rincian Layanan:*",
        ...selected.map((item, idx) => `${idx + 1}. ${item.name} (${item.qty} ${item.unit}) = ${formatRupiah(item.subtotal)}`),
        "",
        `*Estimasi Total: ${formatRupiah(grandTotal)}*`,
        ...(state.customerNote.trim() ? [`Catatan: ${state.customerNote.trim()}`] : []),
        "",
        "Mohon info antrean pengerjaan & detail kirim materinya ya kak. Terima kasih!"
    ].join("\n");
}

function openCheckoutModal() {
    const msg = buildWhatsAppMessage();
    if ($('wa-message-preview')) $('wa-message-preview').textContent = msg;
    const link = $('wa-direct-link');
    if (link) link.href = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`;
    if ($('copy-btn-text')) $('copy-btn-text').textContent = 'Salin Rincian';
    $('checkout-modal')?.classList.remove('hidden');
    safeIcons();
}

const closeCheckoutModal = () => $('checkout-modal')?.classList.add('hidden');

function copyWaMessage() {
    const text = $('wa-message-preview')?.textContent || '';
    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).catch(() => {});
    } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
    }
    if ($('copy-btn-text')) $('copy-btn-text').textContent = 'Tersalin!';
    showToast('Rincian pesanan disalin');
}

// =========================================================================
// ADMIN AUTH & CRUD
// =========================================================================
function setFeedback(elId, message, isError = true) {
    const el = $(elId);
    if (!el) return;
    el.textContent = message;
    el.className = `text-xs font-bold ${isError ? 'text-eras-coral' : 'text-eras-navy'}`;
    el.classList.remove('hidden');
}

function applyAdminSession(admin, token) {
    state.adminUsername = admin.username;
    state.adminToken = token;
    state.isAdminUnlocked = true;
    renderAdminView();
}

function lockAdmin() {
    state.isAdminUnlocked = false;
    state.adminUsername = '';
    state.adminToken = '';
    renderAdminView();
    showToast('Mode Admin dikunci');
}

async function adminRequest(url, options = {}, withJson = false) {
    const res = await fetch(url, {
        ...options,
        headers: { ...authHeaders(withJson), ...(options.headers || {}) }
    });
    if (res.status === 401) {
        showToast('Sesi Admin tidak valid atau kedaluwarsa');
        lockAdmin();
        return null;
    }
    return res;
}

async function verifyAdminPin() {
    const username = ($('admin-username-input')?.value || '').trim();
    const password = ($('admin-pin-input')?.value || '').trim();
    if (!username || !password) return setFeedback('pin-error', 'Nama admin dan sandi wajib diisi!');

    try {
        const res = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await parseJsonSafe(res);
        if (!res.ok || !data.ok || !data.token) {
            return setFeedback('pin-error', data.error || 'Nama admin atau sandi salah!');
        }
        if ($('admin-pin-input')) $('admin-pin-input').value = '';
        applyAdminSession(data.admin, data.token);
        showToast(`Selamat datang, ${state.adminUsername}`);
    } catch (err) {
        console.error(err);
        setFeedback('pin-error', 'Gagal menghubungi server / database Turso di Vercel');
    }
}

async function handleRegisterAdmin(event) {
    event.preventDefault();
    const username = ($('reg-username')?.value || '').trim();
    const password = ($('reg-password')?.value || '').trim();
    const invite_token = ($('reg-invite-token')?.value || '').trim();
    if (!username || !password || !invite_token) {
        return setFeedback('reg-feedback', 'Nama admin, sandi, dan token pendaftaran wajib diisi');
    }

    try {
        const res = await fetch('/api/admin/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, invite_token })
        });
        const data = await parseJsonSafe(res);
        if (!res.ok || !data.ok || !data.token) {
            return setFeedback('reg-feedback', data.error || 'Gagal mendaftarkan akun admin');
        }
        event.target.reset();
        applyAdminSession(data.admin, data.token);
        showToast(`Akun ${state.adminUsername} berhasil dibuat & terhubung ke database!`);
    } catch (err) {
        console.error(err);
        setFeedback('reg-feedback', 'Gagal terhubung ke server Turso di Vercel');
    }
}

async function handleResetPassword(event) {
    event.preventDefault();
    const username = ($('forgot-username')?.value || '').trim();
    const invite_token = ($('forgot-invite-token')?.value || '').trim();
    const new_password = ($('forgot-new-password')?.value || '').trim();
    if (!username || !invite_token || !new_password) return;

    try {
        const res = await fetch('/api/admin/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, invite_token, new_password })
        });
        const data = await parseJsonSafe(res);
        if (!res.ok || !data.ok) {
            return setFeedback('forgot-feedback', data.error || 'Gagal mereset sandi');
        }
        event.target.reset();
        switchAuthTab('login');
        if ($('admin-username-input')) $('admin-username-input').value = username;
        showToast('Sandi berhasil diperbarui! Silakan masuk.');
    } catch (err) {
        console.error(err);
        setFeedback('forgot-feedback', 'Gagal terhubung ke server Turso di Vercel');
    }
}

async function fetchInviteTokenFromDb() {
    const input = $('admin-invite-token-input');
    if (!input || !state.isAdminUnlocked || !state.adminToken) return;
    try {
        const res = await adminRequest('/api/admin/invite-token');
        if (!res || !res.ok) return;
        const data = await parseJsonSafe(res);
        if (data.ok && typeof data.invite_token === 'string') input.value = data.invite_token;
    } catch (err) {
        console.error('Gagal memuat invite token:', err);
    }
}

function generateRandomInviteToken() {
    const input = $('admin-invite-token-input');
    if (!input) return;
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
    input.value = `ERAS-${code}`;
}

async function handleUpdateInviteToken(event) {
    event.preventDefault();
    const input = $('admin-invite-token-input');
    const invite_token = (input?.value || '').trim();
    if (invite_token.length < 6 || /\s/.test(invite_token)) {
        return showToast('Token minimal 6 karakter dan tidak boleh mengandung spasi');
    }

    const res = await adminRequest('/api/admin/invite-token', {
        method: 'PUT',
        body: JSON.stringify({ invite_token })
    }, true);
    if (!res) return;

    const data = await parseJsonSafe(res);
    if (!res.ok || !data.ok) return showToast(data.error || 'Gagal menyimpan token ke database');
    input.value = data.invite_token;
    showToast('Token pendaftaran admin berhasil diperbarui di database!');
}

function renderAdminView() {
    $('admin-pin-screen')?.classList.toggle('hidden', state.isAdminUnlocked);
    $('admin-dashboard')?.classList.toggle('hidden', !state.isAdminUnlocked);
    const lockType = state.isAdminUnlocked ? 'unlock' : 'lock';
    $('admin-lock-icon')?.setAttribute('data-lucide', lockType);
    $('admin-lock-icon-mobile')?.setAttribute('data-lucide', lockType);

    if (state.isAdminUnlocked) {
        renderAdminServiceList();
        fetchInviteTokenFromDb();
    }
    safeIcons();
}

function renderAdminServiceList() {
    const listEl = $('admin-service-list'), countEl = $('admin-item-count');
    if (!listEl) return;
    if (countEl) countEl.textContent = state.services.length;

    if (!state.services.length) {
        listEl.innerHTML = `<div class="p-8 text-center text-xs font-semibold text-eras-blue">Belum ada layanan di katalog. Silakan tambah item baru di atas.</div>`;
        return;
    }

    listEl.innerHTML = state.services.map(item => `
        <div class="p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-eras-skylight/60 transition-colors">
            <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 mb-1">
                    <span class="px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${getCategoryBadgeStyle(item.category)}">${item.category}</span>
                    <span class="text-[11px] font-mono font-bold text-eras-blue">#ID-${item.id}</span>
                </div>
                <h4 class="font-display font-bold text-base text-eras-navy">${item.name}</h4>
                <p class="text-xs font-medium text-eras-deep/75 mt-0.5 line-clamp-1">${item.note || '-'}</p>
            </div>
            <div class="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-eras-sky">
                <div class="flex items-center gap-1.5 bg-eras-skylight px-3 py-1.5 rounded-xl border-2 border-eras-navy/40">
                    <span class="text-xs font-mono font-bold text-eras-blue">Rp</span>
                    <input type="number" value="${item.price}" min="500" step="500" onchange="handleInlinePriceUpdate(${item.id}, this.value)" class="w-20 font-mono font-bold text-xs bg-transparent focus:outline-none text-eras-navy">
                    <span class="text-[11px] font-bold text-eras-blue">/ ${item.unit}</span>
                </div>
                <button onclick="handleDeleteService(${item.id})" title="Hapus Layanan" class="p-2 rounded-xl bg-eras-coral/15 hover:bg-eras-coral text-eras-coral hover:text-white border border-eras-coral transition-colors">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            </div>
        </div>`).join('');
    safeIcons();
}

async function handleAddService(event) {
    event.preventDefault();
    const name = $('new-name').value.trim();
    const category = $('new-category').value;
    const price = parseInt($('new-price').value, 10);
    const unit = $('new-unit').value;
    const note = $('new-note').value.trim();
    if (!name || isNaN(price) || price < 500) return showToast('Nama dan harga minimal Rp 500 wajib diisi');

    const res = await adminRequest('/api/items', {
        method: 'POST',
        body: JSON.stringify({ name, category, price, unit, note })
    }, true);
    if (!res) return;

    const data = await parseJsonSafe(res);
    if (!res.ok) return showToast(data.error || 'Gagal menambah item ke database');

    event.target.reset();
    await fetchServicesFromDb();
    showToast(`"${name}" ditambahkan ke ERAS DESIGN`);
}

async function handleInlinePriceUpdate(id, newRawPrice) {
    const price = parseInt(newRawPrice, 10);
    if (isNaN(price) || price < 500) {
        showToast('Harga minimal Rp 500');
        return fetchServicesFromDb();
    }

    const res = await adminRequest(`/api/items/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ price })
    }, true);
    if (!res) return;

    const data = await parseJsonSafe(res);
    if (res.ok) {
        await fetchServicesFromDb();
        showToast('Harga layanan diperbarui');
    } else {
        showToast(data.error || 'Gagal memperbarui harga');
    }
}

async function handleDeleteService(id) {
    const res = await adminRequest(`/api/items/${id}`, { method: 'DELETE' });
    if (!res) return;

    if (res.ok) {
        delete state.cart[id];
        await fetchServicesFromDb();
        showToast('Item dihapus dari katalog');
    } else {
        showToast('Gagal menghapus item');
    }
}

async function resetDefaultData() {
    if (!confirm('Reset katalog di database ke 10 layanan default poster?')) return;

    const delResults = await Promise.all(
        [...state.services].map(s => adminRequest(`/api/items/${s.id}`, { method: 'DELETE' }))
    );
    if (delResults.some(r => r === null)) return;

    const postResults = await Promise.all(
        DEFAULT_SERVICES.map(item => adminRequest('/api/items', {
            method: 'POST',
            body: JSON.stringify({
                name: item.name,
                category: item.category,
                price: item.price,
                unit: item.unit,
                note: item.note
            })
        }, true))
    );
    if (postResults.some(r => r === null)) return;

    state.cart = {};
    await fetchServicesFromDb();
    showToast('10 Layanan poster berhasil dikembalikan');
}

window.addEventListener('DOMContentLoaded', () => {
    fetchServicesFromDb();
    safeIcons();
});