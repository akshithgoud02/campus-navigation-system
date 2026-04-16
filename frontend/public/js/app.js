// ── CampusNav Frontend App v2 ─────────────────────────────────────────────
const API = '/api';
let adminToken = null;
let allRoomsCache = [];
let blocksCache = [];
let editingRoomId  = null;
let editingTTId    = null;
let editingBlockId = null;

document.addEventListener('DOMContentLoaded', async () => {
  await loadBlocks();
  await loadAllRooms();
  setupPageNav();
  setupStudentTabs();
  setupAdminTabs();
  setupSearch();
  setDefaultDay();
  browseRooms();
  const saved = localStorage.getItem('cn_token');
  if (saved) { adminToken = saved; showAdminDashboard(); }
});

function setDefaultDay() {
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const today = days[new Date().getDay()];
  const sel = document.getElementById('empty-day');
  if (sel) [...sel.options].forEach(o => { if (o.value === today) o.selected = true; });
  const h = new Date().getHours().toString().padStart(2,'0') + ':00';
  const sel2 = document.getElementById('empty-from');
  if (sel2) [...sel2.options].forEach(o => { if (o.value === h) o.selected = true; });
}

async function loadBlocks() {
  try {
    blocksCache = await fetchJSON(`${API}/blocks`);
    populateBlockSelect('empty-block', true);
    populateBlockSelect('browse-block', true);
    populateBlockSelect('new-room-block', false);
  } catch(e) { console.error('loadBlocks', e); }
}

function populateBlockSelect(id, withAll) {
  const sel = document.getElementById(id);
  if (!sel) return;
  sel.innerHTML = withAll ? '<option value="">All Blocks</option>' : '<option value="">Select Block</option>';
  blocksCache.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.id; opt.textContent = b.name;
    sel.appendChild(opt);
  });
}

async function loadAllRooms() {
  try { allRoomsCache = await fetchJSON(`${API}/rooms`); }
  catch(e) { console.error('loadAllRooms', e); }
}

function setupPageNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.page').forEach(p => { p.classList.remove('active'); p.classList.add('hidden'); });
      btn.classList.add('active');
      const page = document.getElementById('page-' + btn.dataset.page);
      page.classList.remove('hidden'); page.classList.add('active');
    });
  });
}

function setupStudentTabs() {
  document.querySelectorAll('.tabs .tab[data-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tabs .tab[data-tab]').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => { c.classList.remove('active'); c.classList.add('hidden'); });
      tab.classList.add('active');
      const tc = document.getElementById('tab-' + tab.dataset.tab);
      if (tc) { tc.classList.remove('hidden'); tc.classList.add('active'); }
    });
  });
}

function setupAdminTabs() {
  document.querySelectorAll('.tab[data-admin-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab[data-admin-tab]').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('[id^="admin-tab-"]').forEach(c => { c.classList.remove('active'); c.classList.add('hidden'); });
      tab.classList.add('active');
      const tc = document.getElementById('admin-tab-' + tab.dataset.adminTab);
      if (tc) { tc.classList.remove('hidden'); tc.classList.add('active'); }
    });
  });
}

function setupSearch() {
  const input = document.getElementById('quick-search');
  const dropdown = document.getElementById('search-dropdown');
  let debounce;
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    const q = input.value.trim();
    if (q.length < 1) { dropdown.classList.add('hidden'); return; }
    debounce = setTimeout(async () => {
      try {
        const results = await fetchJSON(`${API}/search?q=${encodeURIComponent(q)}`);
        if (!results.length) { dropdown.classList.add('hidden'); return; }
        dropdown.innerHTML = results.slice(0,8).map(r => `
          <div class="search-dropdown-item" onclick="selectRoom('${r.room_no}')">
            <span class="di-no">${r.room_no}</span>
            <span class="di-block">${r.block_name} · ${r.type}</span>
          </div>`).join('');
        dropdown.classList.remove('hidden');
      } catch(e) {}
    }, 250);
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.search-bar') && !e.target.closest('.search-dropdown'))
      dropdown.classList.add('hidden');
  });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') quickSearch(); });
}

function selectRoom(roomNo) {
  document.getElementById('quick-search').value = roomNo;
  document.getElementById('search-dropdown').classList.add('hidden');
  document.getElementById('loc-room').value = roomNo;
  document.querySelectorAll('.tab[data-tab]').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => { c.classList.remove('active'); c.classList.add('hidden'); });
  document.querySelector('.tab[data-tab="location"]').classList.add('active');
  document.getElementById('tab-location').classList.remove('hidden');
  document.getElementById('tab-location').classList.add('active');
  findLocation();
}

function quickSearch() {
  const q = document.getElementById('quick-search').value.trim();
  if (q) selectRoom(q);
}

// ── FIND LOCATION ──────────────────────────────────────────────────────────
async function findLocation() {
  const roomNo = document.getElementById('loc-room').value.trim();
  if (!roomNo) { showToast('Please enter a room number', 'error'); return; }
  const result = document.getElementById('location-result');
  result.classList.remove('hidden');
  result.innerHTML = '<div class="loading-row"><div class="spinner"></div> Looking up room...</div>';
  try {
    const data = await fetchJSON(`${API}/location/${encodeURIComponent(roomNo)}`);
    const floorEmoji = ['🏠','1️⃣','2️⃣','3️⃣','4️⃣'][data.floor_num] || '🏢';
    const typeLabel  = data.is_lab ? 'Lab' : data.type === 'seminar' ? 'Seminar Hall' : 'Classroom';
    const badges = [
      `<span class="badge badge-${data.is_lab?'lab':data.type==='seminar'?'seminar':'class'}">${typeLabel}</span>`,
      data.has_ac ? '<span class="badge badge-ac">❄️ AC</span>' : '',
      `<span class="badge badge-class">👥 ${data.capacity} seats</span>`
    ].filter(Boolean).join('');
    const steps = data.directions
      ? data.directions.split('→').map((s,i) => `<div class="dir-step"><div class="dir-step-num">${i+1}</div><div>${s.trim()}</div></div>`).join('')
      : '<div class="dir-step"><div class="dir-step-num">📍</div><div>No directions available</div></div>';
    result.innerHTML = `
      <div class="location-card">
        <div class="location-card-head">
          <div><div class="loc-room-no">${data.room_no}</div><div class="loc-badges">${badges}</div></div>
        </div>
        <div class="location-body">
          <div class="loc-grid">
            <div class="loc-item"><label>🏢 Block</label><p>${data.block_name}</p></div>
            <div class="loc-item"><label>${floorEmoji} Floor</label><p>${data.floor}</p></div>
            ${data.nearby ? `<div class="loc-item"><label>📌 Nearby</label><p>${data.nearby}</p></div>` : ''}
            ${data.notes  ? `<div class="loc-item"><label>📝 Notes</label><p>${data.notes}</p></div>`  : ''}
          </div>
          ${data.directions ? `<div class="directions"><h4>📍 How to Get There</h4><div class="dir-steps">${steps}</div></div>` : ''}
        </div>
      </div>`;
  } catch(e) { result.innerHTML = `<div class="error-card">❌ ${e.message}</div>`; }
}

// ── CHECK AVAILABILITY ────────────────────────────────────────────────────
async function checkAvailability() {
  const roomNo = document.getElementById('avail-room').value.trim();
  if (!roomNo) { showToast('Please enter a room number','error'); return; }
  const result = document.getElementById('availability-result');
  result.classList.remove('hidden');
  result.innerHTML = '<div class="loading-row"><div class="spinner"></div> Checking availability...</div>';
  try {
    const data = await fetchJSON(`${API}/availability/${encodeURIComponent(roomNo)}`);
    const color = data.is_occupied ? '#ef4444' : '#22c55e';
    result.innerHTML = `
      <div class="avail-card" style="border-left:4px solid ${color}">
        <div class="avail-head">
          <span class="avail-room">${data.room_no}</span>
          <span class="avail-status" style="color:${color}">${data.is_occupied ? '🔴 Occupied' : '🟢 Available'}</span>
        </div>
        <div style="color:var(--muted);font-size:0.85rem">${data.block_name}</div>
        ${data.is_occupied && data.current_class ? `
          <div class="avail-class-info">
            <div class="aci-label">Currently in use:</div>
            <b>${data.current_class.subject||'Class'}</b> — ${data.current_class.dept} ${data.current_class.batch}<br>
            Faculty: ${data.current_class.faculty||'—'} &nbsp;|&nbsp; Until: <b>${formatTime(data.current_class.until)}</b>
          </div>` : !data.is_occupied ? `<div class="avail-free">✅ This room is free right now!</div>` : ''}
        ${data.next_class ? `<div class="avail-next">⏭️ Next class at <b>${formatTime(data.next_class.from)}</b> — ${data.next_class.dept} ${data.next_class.batch}</div>` : ''}
      </div>`;
    loadRoomTimetable(roomNo);
  } catch(e) { result.innerHTML = `<div class="error-card">❌ ${e.message}</div>`; }
}

async function loadRoomTimetable(roomNo) {
  try {
    const data = await fetchJSON(`${API}/timetable/${encodeURIComponent(roomNo)}`);
    document.getElementById('timetable-card').style.display = 'block';
    document.getElementById('timetable-room-label').textContent = `Weekly schedule for ${data.room_no}`;
    const days = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
    document.getElementById('timetable-grid').innerHTML = days.map(day => {
      const slots = data.timetable.filter(s => s.day === day);
      return `<div class="tt-day-group"><div class="tt-day-label">${day}</div>
        ${!slots.length ? '<div class="tt-empty-day">No classes</div>' : slots.map(s => `
          <div class="tt-slot-row">
            <span class="tt-time">${formatTime(s.slot_start)}–${formatTime(s.slot_end)}</span>
            <span class="tt-subject">${s.subject||'—'}</span>
            <span class="tt-dept">${s.dept} ${s.batch}</span>
            <span class="tt-fac">${s.faculty||'—'}</span>
          </div>`).join('')}
      </div>`;
    }).join('');
  } catch(e) {}
}

// ── EMPTY ROOMS ───────────────────────────────────────────────────────────
async function findEmptyRooms() {
  const block_id   = document.getElementById('empty-block').value;
  const day        = document.getElementById('empty-day').value;
  const slot_start = document.getElementById('empty-from').value;
  const slot_end   = document.getElementById('empty-to').value;
  if (slot_start >= slot_end) { showToast('End time must be after start time','error'); return; }
  const result = document.getElementById('empty-result');
  result.classList.remove('hidden');
  result.innerHTML = '<div class="loading-row"><div class="spinner"></div> Finding empty rooms...</div>';
  try {
    let url = `${API}/empty-rooms?day=${day}&slot_start=${slot_start}&slot_end=${slot_end}`;
    if (block_id) url += `&block_id=${block_id}`;
    const data = await fetchJSON(url);
    if (!data.rooms.length) { result.innerHTML = '<div class="no-result">😔 No empty rooms found for this time slot.</div>'; return; }
    result.innerHTML = `
      <div class="result-header">🟢 ${data.total_empty} empty rooms on ${data.day}, ${formatTime(data.slot_start)}–${formatTime(data.slot_end)}</div>
      <div class="room-grid">${data.rooms.map(r => `
        <div class="room-mini-card" onclick="selectRoom('${r.room_no}')">
          <div class="rmc-no">${r.room_no}</div>
          <div class="rmc-block">${r.block_name} · ${r.floor}</div>
          <div class="rmc-tags">
            ${r.has_ac ? '<span class="tag tag-ac">AC</span>' : ''}
            ${r.is_lab ? '<span class="tag tag-lab">Lab</span>' : ''}
            <span class="tag">${r.capacity} seats</span>
          </div>
        </div>`).join('')}
      </div>`;
  } catch(e) { result.innerHTML = `<div class="error-card">❌ ${e.message}</div>`; }
}

// ── SUGGEST ───────────────────────────────────────────────────────────────
async function suggestRooms() {
  const result = document.getElementById('suggest-result');
  result.classList.remove('hidden');
  result.innerHTML = '<div class="loading-row"><div class="spinner"></div> Finding best rooms...</div>';
  try {
    const data = await fetchJSON(`${API}/suggest`);
    if (!data.suggestions.length) { result.innerHTML = '<div class="no-result">😔 All rooms seem occupied right now.</div>'; return; }
    result.innerHTML = `
      <div class="result-header">✨ Best rooms right now (${data.current_time})</div>
      <div class="suggest-grid">${data.suggestions.map((r,i) => `
        <div class="suggest-card" onclick="selectRoom('${r.room_no}')">
          <div class="sc-rank">#${i+1}</div>
          <div class="sc-no">${r.room_no}</div>
          <div class="sc-block">${r.block_name} · ${r.floor}</div>
          <div class="sc-tags">${r.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>
          <div class="sc-free">Free until ${formatTime(r.free_until)}</div>
        </div>`).join('')}
      </div>`;
  } catch(e) { result.innerHTML = `<div class="error-card">❌ ${e.message}</div>`; }
}

// ── BROWSE ROOMS ──────────────────────────────────────────────────────────
async function browseRooms() {
  const blockId = document.getElementById('browse-block')?.value || '';
  const type    = document.getElementById('browse-type')?.value  || '';
  let rooms = allRoomsCache;
  if (blockId) rooms = rooms.filter(r => String(r.block_id) === blockId);
  if (type)    rooms = rooms.filter(r => r.type === type);
  const el = document.getElementById('browse-result');
  if (!el) return;
  el.innerHTML = !rooms.length ? '<div class="no-result">No rooms found.</div>' : rooms.map(r => `
    <div class="room-mini-card" onclick="selectRoom('${r.room_no}')">
      <div class="rmc-no">${r.room_no}</div>
      <div class="rmc-block">${r.block_name}</div>
      <div class="rmc-tags">
        ${r.has_ac ? '<span class="tag tag-ac">AC</span>' : ''}
        ${r.is_lab ? '<span class="tag tag-lab">Lab</span>' : ''}
        <span class="tag">${r.capacity} seats</span>
      </div>
    </div>`).join('');
}

// ── ADMIN LOGIN ────────────────────────────────────────────────────────────
async function adminLogin() {
  const username = document.getElementById('admin-username').value.trim();
  const password = document.getElementById('admin-password').value.trim();
  const errEl    = document.getElementById('login-error');
  errEl.classList.add('hidden');
  try {
    const data = await fetchJSON(`${API}/admin/login`, {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username,password})
    });
    adminToken = data.token;
    localStorage.setItem('cn_token', adminToken);
    showAdminDashboard();
  } catch(e) {
    errEl.textContent = '❌ '+(e.message||'Invalid credentials');
    errEl.classList.remove('hidden');
  }
}

function adminLogout() {
  adminToken = null;
  localStorage.removeItem('cn_token');
  document.getElementById('admin-login-screen').classList.remove('hidden');
  document.getElementById('admin-dashboard').classList.add('hidden');
}

async function showAdminDashboard() {
  document.getElementById('admin-login-screen').classList.add('hidden');
  document.getElementById('admin-dashboard').classList.remove('hidden');
  await loadAdminStats();
  await loadRoomsTable();
  await loadTimetableAdmin();
  await loadBlocksList();
  await loadAdminRoomDropdowns();
}

// ── STATS ─────────────────────────────────────────────────────────────────
async function loadAdminStats() {
  try {
    const s = await fetchJSON(`${API}/admin/stats`, authHeaders());
    document.getElementById('stat-rooms').textContent    = s.totalRooms;
    document.getElementById('stat-blocks').textContent   = s.totalBlocks;
    document.getElementById('stat-labs').textContent     = s.labs;
    document.getElementById('stat-occupied').textContent = s.currentlyOccupied;
    document.getElementById('stat-empty').textContent    = s.currentlyEmpty;
    document.getElementById('stat-slots').textContent    = s.totalSlots;
  } catch(e) {}
}

// ── ROOMS TABLE ────────────────────────────────────────────────────────────
async function loadRoomsTable() {
  try {
    const rooms = await fetchJSON(`${API}/admin/rooms`, authHeaders());
    document.getElementById('rooms-tbody').innerHTML = rooms.map(r => `
      <tr id="room-row-${r.id}">
        <td class="mono">${r.room_no}</td>
        <td>${r.block_name}</td>
        <td>${['Ground','1st','2nd','3rd','4th'][r.floor]||r.floor}</td>
        <td>${r.type}</td>
        <td>${r.capacity}</td>
        <td>${r.has_ac?'✅':'—'}</td>
        <td style="max-width:140px;font-size:0.8rem;color:var(--muted)">${r.nearby||'—'}</td>
        <td class="action-cell">
          <button class="btn btn-edit btn-sm" onclick="startEditRoom(${r.id})">✏️ Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteRoom(${r.id})">🗑</button>
        </td>
      </tr>`).join('');
  } catch(e) {}
}

function filterRoomsTable() {
  const q = document.getElementById('room-filter').value.toLowerCase();
  document.querySelectorAll('#rooms-tbody tr').forEach(row => {
    row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

async function startEditRoom(id) {
  const rooms = await fetchJSON(`${API}/admin/rooms`, authHeaders());
  const r = rooms.find(x => x.id === id);
  if (!r) return;
  editingRoomId = id;
  document.getElementById('new-room-no').value     = r.room_no;
  document.getElementById('new-room-block').value  = r.block_id;
  document.getElementById('new-room-floor').value  = r.floor;
  document.getElementById('new-room-type').value   = r.type;
  document.getElementById('new-room-cap').value    = r.capacity;
  document.getElementById('new-room-ac').checked   = !!r.has_ac;
  document.getElementById('new-room-lab').checked  = !!r.is_lab;
  document.getElementById('new-room-nearby').value = r.nearby||'';
  document.getElementById('new-room-dir').value    = r.directions||'';
  document.getElementById('new-room-notes').value  = r.notes||'';
  const btn = document.getElementById('room-submit-btn');
  btn.textContent = '💾 Update Room'; btn.onclick = saveEditRoom;
  document.getElementById('room-cancel-btn').classList.remove('hidden');
  document.getElementById('room-form-card').scrollIntoView({behavior:'smooth'});
  showToast(`Editing room ${r.room_no}`, 'success');
}

async function saveEditRoom() {
  const body = {
    room_no:    document.getElementById('new-room-no').value.trim(),
    block_id:   document.getElementById('new-room-block').value,
    floor:      document.getElementById('new-room-floor').value,
    type:       document.getElementById('new-room-type').value,
    capacity:   document.getElementById('new-room-cap').value,
    has_ac:     document.getElementById('new-room-ac').checked,
    is_lab:     document.getElementById('new-room-lab').checked,
    nearby:     document.getElementById('new-room-nearby').value,
    directions: document.getElementById('new-room-dir').value,
    notes:      document.getElementById('new-room-notes').value
  };
  if (!body.room_no || !body.block_id) { showMsg('room-msg','Room number and block required.','error'); return; }
  try {
    await fetchJSON(`${API}/admin/rooms/${editingRoomId}`, {
      method:'PUT', headers:{'Content-Type':'application/json',...authHeaders().headers}, body:JSON.stringify(body)
    });
    showMsg('room-msg','✅ Room updated!','success');
    cancelEditRoom();
    await loadAllRooms(); await loadRoomsTable(); await loadAdminRoomDropdowns(); await loadAdminStats();
  } catch(e) { showMsg('room-msg','❌ '+e.message,'error'); }
}

function cancelEditRoom() {
  editingRoomId = null;
  ['new-room-no','new-room-nearby','new-room-dir','new-room-notes'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('new-room-cap').value = '60';
  document.getElementById('new-room-ac').checked = false;
  document.getElementById('new-room-lab').checked = false;
  const btn = document.getElementById('room-submit-btn');
  btn.textContent = '➕ Add Room'; btn.onclick = addRoom;
  document.getElementById('room-cancel-btn').classList.add('hidden');
}

async function addRoom() {
  const body = {
    room_no:    document.getElementById('new-room-no').value.trim(),
    block_id:   document.getElementById('new-room-block').value,
    floor:      document.getElementById('new-room-floor').value,
    type:       document.getElementById('new-room-type').value,
    capacity:   document.getElementById('new-room-cap').value,
    has_ac:     document.getElementById('new-room-ac').checked,
    is_lab:     document.getElementById('new-room-lab').checked,
    nearby:     document.getElementById('new-room-nearby').value,
    directions: document.getElementById('new-room-dir').value,
    notes:      document.getElementById('new-room-notes').value
  };
  if (!body.room_no || !body.block_id) { showMsg('room-msg','Room number and block are required.','error'); return; }
  try {
    await fetchJSON(`${API}/admin/rooms`, {
      method:'POST', headers:{'Content-Type':'application/json',...authHeaders().headers}, body:JSON.stringify(body)
    });
    showMsg('room-msg','✅ Room added successfully!','success');
    cancelEditRoom();
    await loadAllRooms(); await loadRoomsTable(); await loadAdminRoomDropdowns(); await loadAdminStats();
  } catch(e) { showMsg('room-msg','❌ '+e.message,'error'); }
}

async function deleteRoom(id) {
  if (!confirm('Delete this room and all its timetable entries?')) return;
  try {
    await fetchJSON(`${API}/admin/rooms/${id}`, {method:'DELETE',...authHeaders()});
    document.getElementById(`room-row-${id}`)?.remove();
    await loadAllRooms(); await loadAdminStats(); await loadAdminRoomDropdowns();
    showToast('Room deleted','success');
  } catch(e) { showToast('Error: '+e.message,'error'); }
}

// ── TIMETABLE TABLE ────────────────────────────────────────────────────────
async function loadTimetableAdmin() {
  try {
    const slots = await fetchJSON(`${API}/admin/timetable`, authHeaders());
    document.getElementById('tt-tbody').innerHTML = slots.map(s => `
      <tr id="tt-row-${s.id}">
        <td class="mono">${s.room_no}</td>
        <td>${s.day}</td>
        <td class="tt-slot">${formatTime(s.slot_start)}–${formatTime(s.slot_end)}</td>
        <td>${s.batch}</td>
        <td>${s.dept}</td>
        <td>${s.subject}</td>
        <td>${s.faculty}</td>
        <td class="action-cell">
          <button class="btn btn-edit btn-sm" onclick="startEditTT(${s.id})">✏️</button>
          <button class="btn btn-danger btn-sm" onclick="deleteTTSlot(${s.id})">✕</button>
        </td>
      </tr>`).join('');
  } catch(e) {}
}

async function startEditTT(id) {
  const slots = await fetchJSON(`${API}/admin/timetable`, authHeaders());
  const s = slots.find(x => x.id === id);
  if (!s) return;
  editingTTId = id;
  const room = allRoomsCache.find(r => r.room_no === s.room_no);
  if (room) document.getElementById('tt-room').value = room.id;
  document.getElementById('tt-day').value     = s.day;
  document.getElementById('tt-from').value    = s.slot_start;
  document.getElementById('tt-to').value      = s.slot_end;
  document.getElementById('tt-batch').value   = s.batch;
  document.getElementById('tt-dept').value    = s.dept;
  document.getElementById('tt-subject').value = s.subject;
  document.getElementById('tt-faculty').value = s.faculty;
  const btn = document.getElementById('tt-submit-btn');
  btn.textContent = '💾 Update Slot'; btn.onclick = saveEditTT;
  document.getElementById('tt-cancel-btn').classList.remove('hidden');
  document.getElementById('tt-form-card').scrollIntoView({behavior:'smooth'});
  showToast(`Editing slot for ${s.room_no}`,'success');
}

async function saveEditTT() {
  const body = {
    room_id:    document.getElementById('tt-room').value,
    day:        document.getElementById('tt-day').value,
    slot_start: document.getElementById('tt-from').value,
    slot_end:   document.getElementById('tt-to').value,
    batch:      document.getElementById('tt-batch').value,
    dept:       document.getElementById('tt-dept').value,
    subject:    document.getElementById('tt-subject').value,
    faculty:    document.getElementById('tt-faculty').value
  };
  if (body.slot_start >= body.slot_end) { showMsg('tt-msg','End time must be after start time.','error'); return; }
  try {
    await fetchJSON(`${API}/admin/timetable/${editingTTId}`, {
      method:'PUT', headers:{'Content-Type':'application/json',...authHeaders().headers}, body:JSON.stringify(body)
    });
    showMsg('tt-msg','✅ Slot updated!','success');
    cancelEditTT();
    await loadTimetableAdmin(); await loadAdminStats();
  } catch(e) { showMsg('tt-msg','❌ '+(e.message||'Error'),'error'); }
}

function cancelEditTT() {
  editingTTId = null;
  ['tt-dept','tt-subject','tt-faculty'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  const btn = document.getElementById('tt-submit-btn');
  btn.textContent = '➕ Add Slot'; btn.onclick = addTimetableSlot;
  document.getElementById('tt-cancel-btn').classList.add('hidden');
}

async function addTimetableSlot() {
  const body = {
    room_id:    document.getElementById('tt-room').value,
    day:        document.getElementById('tt-day').value,
    slot_start: document.getElementById('tt-from').value,
    slot_end:   document.getElementById('tt-to').value,
    batch:      document.getElementById('tt-batch').value,
    dept:       document.getElementById('tt-dept').value,
    subject:    document.getElementById('tt-subject').value,
    faculty:    document.getElementById('tt-faculty').value
  };
  if (body.slot_start >= body.slot_end) { showMsg('tt-msg','End time must be after start time.','error'); return; }
  try {
    await fetchJSON(`${API}/admin/timetable`, {
      method:'POST', headers:{'Content-Type':'application/json',...authHeaders().headers}, body:JSON.stringify(body)
    });
    showMsg('tt-msg','✅ Slot added!','success');
    await loadTimetableAdmin(); await loadAdminStats();
  } catch(e) { showMsg('tt-msg','❌ '+(e.message||'Conflict or error'),'error'); }
}

async function deleteTTSlot(id) {
  if (!confirm('Delete this timetable slot?')) return;
  try {
    await fetchJSON(`${API}/admin/timetable/${id}`, {method:'DELETE',...authHeaders()});
    document.getElementById(`tt-row-${id}`)?.remove();
    await loadAdminStats();
    showToast('Slot deleted','success');
  } catch(e) { showToast('Error','error'); }
}

// ── BLOCKS TABLE ───────────────────────────────────────────────────────────
async function loadBlocksList() {
  try {
    const blocks = await fetchJSON(`${API}/blocks`);
    blocksCache = blocks;
    document.getElementById('blocks-list').innerHTML = blocks.map(b => `
      <div class="block-card" id="block-card-${b.id}">
        <div class="block-card-main">
          <div style="display:flex;align-items:center;gap:0.5rem">
            <div class="block-short">[${b.short}]</div>
            <div class="block-name">${b.name}</div>
          </div>
          <div class="block-desc">${b.desc||'—'}</div>
        </div>
        <div class="block-actions">
          <button class="btn btn-edit btn-sm" onclick="startEditBlock(${b.id})">✏️ Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteBlock(${b.id},'${b.name.replace(/'/g,"\\'")}')">🗑 Delete</button>
        </div>
      </div>`).join('');
    populateBlockSelect('empty-block', true);
    populateBlockSelect('browse-block', true);
    populateBlockSelect('new-room-block', false);
  } catch(e) {}
}

async function startEditBlock(id) {
  const b = blocksCache.find(x => x.id === id);
  if (!b) return;
  editingBlockId = id;
  document.getElementById('new-block-name').value  = b.name;
  document.getElementById('new-block-short').value = b.short;
  document.getElementById('new-block-desc').value  = b.desc||'';
  const btn = document.getElementById('block-submit-btn');
  btn.textContent = '💾 Update Block'; btn.onclick = saveEditBlock;
  document.getElementById('block-cancel-btn').classList.remove('hidden');
  document.getElementById('block-form-card').scrollIntoView({behavior:'smooth'});
  showToast(`Editing block: ${b.name}`,'success');
}

async function saveEditBlock() {
  const body = {
    name:  document.getElementById('new-block-name').value.trim(),
    short: document.getElementById('new-block-short').value.trim(),
    desc:  document.getElementById('new-block-desc').value.trim()
  };
  if (!body.name || !body.short) { showMsg('block-msg','Name and short code required.','error'); return; }
  try {
    await fetchJSON(`${API}/admin/blocks/${editingBlockId}`, {
      method:'PUT', headers:{'Content-Type':'application/json',...authHeaders().headers}, body:JSON.stringify(body)
    });
    showMsg('block-msg','✅ Block updated!','success');
    cancelEditBlock();
    await loadBlocksList(); await loadBlocks(); await loadAdminStats();
  } catch(e) { showMsg('block-msg','❌ '+e.message,'error'); }
}

function cancelEditBlock() {
  editingBlockId = null;
  document.getElementById('new-block-name').value  = '';
  document.getElementById('new-block-short').value = '';
  document.getElementById('new-block-desc').value  = '';
  const btn = document.getElementById('block-submit-btn');
  btn.textContent = '➕ Add Block'; btn.onclick = addBlock;
  document.getElementById('block-cancel-btn').classList.add('hidden');
}

async function addBlock() {
  const body = {
    name:  document.getElementById('new-block-name').value.trim(),
    short: document.getElementById('new-block-short').value.trim(),
    desc:  document.getElementById('new-block-desc').value.trim()
  };
  if (!body.name || !body.short) { showMsg('block-msg','Name and short code required.','error'); return; }
  try {
    await fetchJSON(`${API}/admin/blocks`, {
      method:'POST', headers:{'Content-Type':'application/json',...authHeaders().headers}, body:JSON.stringify(body)
    });
    showMsg('block-msg','✅ Block added!','success');
    cancelEditBlock();
    await loadBlocksList(); await loadBlocks(); await loadAdminStats();
  } catch(e) { showMsg('block-msg','❌ '+e.message,'error'); }
}

async function deleteBlock(id, name) {
  if (!confirm(`Delete block "${name}"?\nThis will fail if any rooms still belong to this block.`)) return;
  try {
    await fetchJSON(`${API}/admin/blocks/${id}`, {method:'DELETE',...authHeaders()});
    document.getElementById(`block-card-${id}`)?.remove();
    await loadBlocks(); await loadAdminStats();
    showToast(`Block "${name}" deleted`,'success');
  } catch(e) { showToast('❌ '+e.message,'error'); }
}

async function loadAdminRoomDropdowns() {
  try {
    const rooms = await fetchJSON(`${API}/admin/rooms`, authHeaders());
    allRoomsCache = rooms;
    const ttRoom = document.getElementById('tt-room');
    if (ttRoom) ttRoom.innerHTML = rooms.map(r => `<option value="${r.id}">${r.room_no} (${r.block_name})</option>`).join('');
  } catch(e) {}
}

// ── HELPERS ────────────────────────────────────────────────────────────────
async function fetchJSON(url, options={}) {
  const res  = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error||'Request failed');
  return data;
}
function authHeaders() { return { headers: { Authorization: `Bearer ${adminToken}` } }; }
function formatTime(t) {
  if (!t) return '—';
  const [h,m] = t.split(':').map(Number);
  return `${h%12||12}:${m.toString().padStart(2,'0')} ${h>=12?'PM':'AM'}`;
}
function showToast(msg, type='success') {
  const toast = document.getElementById('toast');
  toast.textContent = (type==='success'?'✅ ':'❌ ')+msg;
  toast.className = `toast ${type}`;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3000);
}
function showMsg(id, msg, type) {
  const el = document.getElementById(id);
  el.textContent = msg; el.className = `msg ${type}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}
