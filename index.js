// --- CONFIGURATION ---
        const RESOURCES = [
            { id: 'PC-1', name: 'URANUS NM CLIENT', group: 'PC' },
            { id: 'PC-2', name: 'URANUS KMF CLIENT', group: 'PC' },
            { id: 'PC-3', name: 'URANUS DISPATCH', group: 'PC' },
            { id: 'PC-4', name: 'TYPE 2 NM CLIENT', group: 'PC' },
            { id: 'PC-5', name: 'TYPE 2 KMF CLIENT', group: 'PC' },
            { id: 'PC-6', name: 'TYPE 2 DISPATCH', group: 'PC' },
            { id: 'MCH-Mobile', name: 'Multi Control Head Mobile', group: 'Mobile' }, 
        ];

        // --- GLOBAL STATE ---
        let userId = '';
        let currentBookingDate = new Date();
        let allBookings = [];
        let allLogs = [];
        const LOCAL_STORAGE_KEY = 'resource_booking_data_v2';
        
        // --- TAILWIND STYLES ---
        const tableHeaderStyles = "p-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider";
        const tableCellStyles = "p-4 border-b border-slate-100 text-sm";
        const formLabelStyles = "block text-sm font-semibold text-slate-700 mb-1.5";
        const formInputStyles = "block w-full px-3 py-2.5 border border-slate-200 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition duration-200";
        const btnPrimaryStyles = "bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-5 rounded-lg shadow-sm transition duration-200";
        const btnSecondaryStyles = "bg-white hover:bg-slate-50 text-slate-600 font-bold py-2.5 px-5 rounded-lg border border-slate-200 shadow-sm transition duration-200";
        
        const navLinkBase = "nav-link flex items-center py-3.5 px-6 text-sm font-semibold border-l-4 transition duration-200";
        const activeNavStyles = "bg-indigo-50 text-indigo-600 border-indigo-500 active-nav";
        const inactiveNavStyles = "text-slate-500 hover:bg-slate-50 hover:text-slate-800 border-transparent";
        
        // --- PERSISTENCE ---
        function loadData() {
            const storedData = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (storedData) {
                const data = JSON.parse(storedData);
                allBookings = data.bookings || [];
                allLogs = data.logs || [];
            }
        }

        function saveData() {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ bookings: allBookings, logs: allLogs }));
            // Best-effort push to Google Apps Script to store centrally
            pushToGoogleSheet().catch(err => console.warn('Push to Google Sheet failed:', err));
        }
        
        // --- SYNC HELPERS ---
        const GOOGLE_SHEET_SYNC_URL = 'https://script.google.com/a/macros/motorolasolutions.com/s/AKfycbxFHwkHE9FSWDL35BAWOFz_rTVudORzJpF_hVqW8BleuAoiyaI1yhlqsN4n0OEzDIA/exec';

        async function pushToGoogleSheet() {
            try {
                const res = await fetch(GOOGLE_SHEET_SYNC_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ bookings: allBookings, logs: allLogs })
                });
                // Apps Script may not allow CORS; if response isn't ok we still consider request sent
                if (!res.ok) {
                    console.warn('Google Sheet push returned non-OK status', res.status);
                }
                return true;
            } catch (e) {
                console.warn('Push to Google Sheet failed', e);
                return false;
            }
        }

        async function pullFromGoogleSheet() {
            try {
                const res = await fetch(GOOGLE_SHEET_SYNC_URL);
                if (!res.ok) {
                    console.warn('Google Sheet pull failed with status', res.status);
                    return false;
                }
                const data = await res.json();
                if (data.bookings) {
                    allBookings = data.bookings.map(b => ({ ...b, startTime: Number(b.startTime), endTime: Number(b.endTime) }));
                }
                if (data.logs) {
                    allLogs = data.logs.map(l => ({ ...l, timestamp: Number(l.timestamp) }));
                }
                localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ bookings: allBookings, logs: allLogs }));
                return true;
            } catch (e) {
                console.warn('Pull from Google Sheet failed', e);
                return false;
            }
        }

        // Sync helper: push then pull and refresh UI
        async function syncAfterUpdate() {
            try {
                await pushToGoogleSheet();
                await pullFromGoogleSheet();
                loadData();
                cleanupExpiredBookings();
                reloadDataAndRender();
                showToast('Synced with Google Sheet');
                return true;
            } catch (e) {
                console.warn('syncAfterUpdate failed', e);
                showToast('Sync failed', true);
                return false;
            }
        }

        // --- CLEANUP EXPIRED BOOKINGS ---
        function cleanupExpiredBookings() {
            const nowMs = Date.now();
            const expired = allBookings.filter(b => (b.endTime || 0) <= nowMs);
            if (!expired || expired.length === 0) return;

            allBookings = allBookings.filter(b => (b.endTime || 0) > nowMs);

            const details = expired.slice(0, 10).map(b => `${b.resourceId} @ ${formatTimestamp(b.endTime)}`).join('; ');
            const summary = `${expired.length} expired booking(s) removed${expired.length > 10 ? ' (showing first 10)' : ''}: ${details}`;
            allLogs.unshift({ id: 'log-' + Date.now(), timestamp: Date.now(), userId: 'system', activityType: 'Expired bookings removed', details: summary });

            saveData();
            // push changes and pull latest
            syncAfterUpdate().catch(() => {});
        }

        // --- AUTO POLLING ---
        // Starts periodic polling to pull updates from the shared Google Sheet
        function setupAutoPolling(intervalMs = 60000) {
            if (window.__bookingAutoPoll) return; // already running
            window.__bookingAutoPoll = true;
            window.__bookingAutoPollTimer = setInterval(async () => {
                if (window.__bookingAutoSyncing) return;
                window.__bookingAutoSyncing = true;
                try {
                    const prevState = JSON.stringify({ b: allBookings, l: allLogs });
                    const ok = await pullFromGoogleSheet();
                    if (ok) {
                        const newState = JSON.stringify({ b: allBookings, l: allLogs });
                        if (newState !== prevState) {
                            cleanupExpiredBookings();
                            reloadDataAndRender();
                            const statusEl = document.getElementById('syncStatus');
                            if (statusEl) {
                                statusEl.classList.remove('hidden');
                                statusEl.textContent = 'Auto-synced';
                                setTimeout(() => { statusEl.classList.add('hidden'); }, 3000);
                            }
                        }
                    }
                } catch (e) {
                    console.warn('Auto-polling error', e);
                } finally {
                    window.__bookingAutoSyncing = false;
                }
            }, intervalMs);
        }

        function stopAutoPolling() {
            if (window.__bookingAutoPollTimer) {
                clearInterval(window.__bookingAutoPollTimer);
                window.__bookingAutoPollTimer = null;
                window.__bookingAutoPoll = false;
            }
        }

        function reloadDataAndRender() {
            loadData();
            allBookings.sort((a, b) => a.startTime - b.startTime);
            allLogs.sort((a, b) => b.timestamp - a.timestamp);
            renderLogsTable();
            renderBookingSchedule();
            renderDashboardStats();
            renderBookingsList();
            applyTailwindStyles(); 
        }

        // --- HELPERS ---
        function applyTailwindStyles() {
            document.querySelectorAll('.table-header').forEach(el => el.className = tableHeaderStyles);
            document.querySelectorAll('.form-label').forEach(el => el.className = formLabelStyles);
            document.querySelectorAll('.form-input').forEach(el => el.className = formInputStyles);
            document.querySelectorAll('.btn-primary').forEach(el => el.className = btnPrimaryStyles);
            document.querySelectorAll('.btn-secondary').forEach(el => el.className = btnSecondaryStyles);
            
            document.querySelectorAll('.nav-link').forEach(el => {
                const isActive = el.classList.contains('active-nav');
                el.className = `${navLinkBase} ${isActive ? activeNavStyles : inactiveNavStyles}`;
            });
        }

        function formatTimestamp(ts) {
            const date = new Date(ts);
            return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
        }
        
        function formatDateForBooking(date) {
            return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        }
        
        function formatDateForInput(date) { return date.toISOString().split('T')[0]; }
        
        function formatTimeForInput(date) {
            const hours = date.getHours().toString().padStart(2, '0');
            const minutes = date.getMinutes().toString().padStart(2, '0');
            return `${hours}:${minutes}`;
        }

        // Toast timeout handle (shared so repeated toasts clear the previous hide timer)
        let _toastTimeout = null;
        function showToast(message, isError = false) {
            const toast = document.getElementById('toast');
            const toastMessage = document.getElementById('toastMessage');
            if (!toast || !toastMessage) return;

            // Clear any pending hide timers so this toast's timeout is authoritative
            if (_toastTimeout) {
                clearTimeout(_toastTimeout);
                _toastTimeout = null;
            }

            // Update content and styles
            toastMessage.textContent = message;
            // Keep base classes and avoid overwriting utility classes used for show/hide
            toast.className = `fixed bottom-10 right-10 ${isError ? 'bg-red-600' : 'bg-slate-900'} text-white py-3 px-6 rounded-lg shadow-xl transform transition-transform duration-300 ease-out z-50`;
            // Ensure visible state
            toast.classList.remove('translate-x-full');

            // Hide after a duration (longer for errors)
            const hideAfter = isError ? 6000 : 3000;
            _toastTimeout = setTimeout(() => {
                toast.classList.add('translate-x-full');
                _toastTimeout = null;
            }, hideAfter);
        }

        function openModal(modalId) {
            document.getElementById(modalId).classList.add('active');
            document.getElementById('modalBackdrop').classList.add('active');
        }

        function closeModal() {
            document.querySelectorAll('.modal.active').forEach(modal => modal.classList.remove('active'));
            document.getElementById('modalBackdrop').classList.remove('active');
        }

        function createLogEntry(activityType, details = "", logUserId = null) {
            const uid = logUserId || userId;
            allLogs.unshift({ id: 'log-' + Date.now(), timestamp: Date.now(), userId: uid, activityType: activityType, details: details });
            saveData();
            renderLogsTable();
            renderDashboardStats();
        }
        
        // --- NAVIGATION ---
        function setupNavigation() {
            const navLinks = document.querySelectorAll('.nav-link');
            const pages = document.querySelectorAll('.page-content');

            navLinks.forEach(link => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    const targetPageId = link.getAttribute('data-page');
                    navLinks.forEach(nl => nl.classList.remove('active-nav'));
                    link.classList.add('active-nav');
                    pages.forEach(p => {
                        if (p.id === `page-${targetPageId}`) p.classList.add('active');
                        else p.classList.remove('active');
                    });
                    applyTailwindStyles();
                    window.location.hash = targetPageId;
                });
            });

            const initialHash = window.location.hash.substring(1) || 'dashboard';
            const initialLink = document.querySelector(`.nav-link[data-page="${initialHash}"]`);
            if (initialLink) initialLink.click();
        }
        
        // --- RENDERING ---
        function renderLogsTable() {
            const tbody = document.getElementById('logsTableBody');
            if (allLogs.length === 0) {
                tbody.innerHTML = `<tr><td colspan="4" class="text-center p-8 text-slate-400 italic">No activity recorded yet.</td></tr>`;
                return;
            }
            tbody.innerHTML = allLogs.map(log => `
                <tr class="hover:bg-slate-50 transition">
                    <td class="p-4 border-b border-slate-100 text-sm">${formatTimestamp(log.timestamp)}</td>
                    <td class="p-4 border-b border-slate-100 text-sm font-mono text-xs text-indigo-600">${log.userId}</td>
                    <td class="p-4 border-b border-slate-100 text-sm font-semibold">${log.activityType}</td>
                    <td class="p-4 border-b border-slate-100 text-sm text-slate-500">${log.details || '-'}</td>
                </tr>
            `).join('');
        }

        function renderBookingsList(filter = '') {
            const tbody = document.getElementById('bookingsTableBody');
            if (!tbody) return;

            const rows = allBookings
                .filter(b => !filter || (b.bookerId && b.bookerId.toLowerCase().includes(filter.toLowerCase())))
                .map(b => {
                    const res = RESOURCES.find(r => r.id === b.resourceId);
                    const date = new Date(b.startTime).toLocaleDateString('en-GB');
                    const start = new Date(b.startTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', hour12:false});
                    const end = new Date(b.endTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', hour12:false});
                    return `
                        <tr class="hover:bg-slate-50 transition">
                            <td class="p-4 border-b border-slate-100 text-sm">${res ? res.name : b.resourceId}</td>
                            <td class="p-4 border-b border-slate-100 text-sm">${date}</td>
                            <td class="p-4 border-b border-slate-100 text-sm">${start}</td>
                            <td class="p-4 border-b border-slate-100 text-sm">${end}</td>
                            <td class="p-4 border-b border-slate-100 text-sm font-semibold">${b.bookerId}</td>
                            <td class="p-4 border-b border-slate-100 text-sm">
                                <button class="btn-remove-booking bg-red-600 hover:bg-red-700 text-white font-semibold py-1 px-3 rounded" data-id="${b.id}">Remove</button>
                            </td>
                        </tr>
                    `;
                });

            if (rows.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" class="text-center p-8 text-slate-400 italic">No bookings found.</td></tr>`;
            } else {
                tbody.innerHTML = rows.join('');
            }
        }
        
        function renderDashboardStats() {
            const now = new Date();
            const pcGrid = document.getElementById('pc-stats-grid');
            const mobileGrid = document.getElementById('mobile-stats-grid');
            pcGrid.innerHTML = '';
            mobileGrid.innerHTML = '';

            RESOURCES.forEach(res => {
                const card = document.createElement('div');
                card.className = "bg-white p-6 rounded-xl shadow-sm border border-slate-200";
                
                const bookings = allBookings.filter(b => b.resourceId === res.id);
                const current = bookings.find(b => now.getTime() >= b.startTime && now.getTime() < b.endTime);
                
                let statusText, statusClass, nextText;
                if (current) {
                    statusText = "Occupied";
                    statusClass = "text-red-600";
                    nextText = `Until ${new Date(current.endTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', hour12: false})}`;
                } else {
                    statusText = "Available";
                    statusClass = "text-green-600";
                    const next = bookings.filter(b => b.startTime > now.getTime()).sort((a,b)=>a.startTime-b.startTime)[0];
                    nextText = next ? `Next: ${new Date(next.startTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', hour12: false})}` : "Free for today";
                }

                card.innerHTML = `
                    <div class="flex justify-between items-start mb-4">
                        <h3 class="font-bold text-slate-800">${res.name}</h3>
                        <span class="text-xl">${res.group === 'PC' ? '🖥️' : '📡'}</span>
                    </div>
                    <p class="text-xl font-bold ${statusClass}">${statusText}</p>
                    <p class="text-xs text-slate-500 mt-1">${nextText}</p>
                `;
                
                if (res.group === 'PC') {
                    pcGrid.appendChild(card);
                } else if (res.group === 'Mobile') {
                    mobileGrid.appendChild(card);
                }
            });

            const activityList = document.getElementById('recent-activity-list');
            if (allLogs.length === 0) {
                activityList.innerHTML = `<li class="text-center text-slate-400 py-4 italic">No recent activity.</li>`;
                return;
            }
            activityList.innerHTML = allLogs.slice(0, 5).map(log => `
                <li class="flex items-center space-x-4 p-3 hover:bg-slate-50 rounded-lg transition">
                    <div class="p-2.5 bg-indigo-50 text-indigo-600 rounded-lg text-lg">📅</div>
                    <div>
                        <p class="text-sm font-bold text-slate-800">${log.activityType}</p>
                        <p class="text-xs text-slate-500">${formatTimestamp(log.timestamp)} • <span class="font-semibold text-slate-700">${log.userId}</span></p>
                    </div>
                </li>
            `).join('');
        }
        
        function renderBookingSchedule() {
            document.getElementById('bookingDateDisplay').textContent = formatDateForBooking(currentBookingDate);
            // Hide 'previous day' button when viewing today's date
            try {
                const prevBtn = document.getElementById('prevDayBtn');
                const now = new Date();
                const isToday = now.getFullYear() === currentBookingDate.getFullYear() && now.getMonth() === currentBookingDate.getMonth() && now.getDate() === currentBookingDate.getDate();
                if (prevBtn) prevBtn.style.display = isToday ? 'none' : '';
            } catch (e) { /* ignore */ }
            const container = document.getElementById('schedules-container');
            container.innerHTML = '';
            
            const dayStartMs = new Date(currentBookingDate).setHours(8, 0, 0, 0);
            const dayEndMs = new Date(currentBookingDate).setHours(18, 0, 0, 0);
            const dayBookings = allBookings.filter(b => b.startTime >= dayStartMs && b.startTime < dayEndMs);

            RESOURCES.forEach(res => {
                const resBox = document.createElement('div');
                resBox.className = "bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden";
                resBox.innerHTML = `
                    <div class="bg-indigo-50 p-4 border-b border-indigo-100">
                        <h3 class="font-bold text-indigo-900 flex items-center">
                            <span class="mr-2">${res.group === 'PC' ? '🖥️' : '💻'}</span> ${res.name}
                        </h3>
                    </div>
                    <div id="schedule-${res.id}" class="p-4 space-y-3"></div>
                `;
                container.appendChild(resBox);
                
                const resSchedule = resBox.querySelector(`#schedule-${res.id}`);
                const filteredBookings = dayBookings.filter(b => b.resourceId === res.id);

                for (let hour = 8; hour < 18; hour++) {
                    const slot = document.createElement('div');
                    const timeStart = new Date(currentBookingDate); timeStart.setHours(hour, 0, 0, 0);
                    const timeEnd = new Date(currentBookingDate); timeEnd.setHours(hour + 1, 0, 0, 0);
                    const timeLabel = timeStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                    
                    // Find booking that overlaps with this hour slot
                    const b = filteredBookings.find(x => x.startTime < timeEnd.getTime() && x.endTime > timeStart.getTime());
                    
                    if (b) {
                        slot.className = "p-3 bg-red-50 border border-red-100 rounded-lg flex justify-between items-center";
                        slot.innerHTML = `
                            <div><p class="font-bold text-red-900 text-sm">${timeLabel}</p><p class="text-[10px] text-red-700">Reserved: ${b.bookerId.substring(0, 16)}</p></div>
                            <button class="btn-delete-booking text-[10px] font-bold text-red-600 bg-white px-2 py-1 rounded border border-red-200 hover:bg-red-50" data-id="${b.id}" data-slot-hour="${hour}">Cancel</button>
                        `;
                    } else {
                        slot.className = "p-3 bg-white border border-slate-100 rounded-lg flex justify-between items-center hover:border-indigo-200 transition group";
                        slot.innerHTML = `
                            <p class="font-bold text-slate-600 text-sm">${timeLabel}</p>
                            <button class="btn-book-slot bg-slate-50 text-indigo-600 border border-slate-200 px-3 py-1 rounded text-[10px] font-bold group-hover:bg-indigo-600 group-hover:text-white" data-resource="${res.id}" data-time="${hour}">Book</button>
                        `;
                    }
                    resSchedule.appendChild(slot);
                }
            });
            // We no longer call attachBookingScheduleListeners() here because we use delegation
        }

        // --- DELEGATED ACTIONS ---
        function setupDelegatedListeners() {
            const container = document.getElementById('schedules-container');
            
            container.addEventListener('click', (e) => {
                // Find closest button in case user clicked child icon or text
                const target = e.target.closest('button');
                if (!target) return;

                // Handle Booking Click
                if (target.classList.contains('btn-book-slot')) {
                    const resId = target.dataset.resource;
                    const hr = parseInt(target.dataset.time);
                    const start = new Date(currentBookingDate); start.setHours(hr, 0, 0, 0);
                    const end = new Date(currentBookingDate); end.setHours(hr + 1, 0, 0, 0);
                    // Prevent opening modal for past slots
                    if (start.getTime() < Date.now()) {
                        showToast('Cannot create bookings in the past.', true);
                        return;
                    }
                    
                    document.getElementById('bookingResource').value = resId;
                    document.getElementById('bookingDate').value = formatDateForInput(start);
                    document.getElementById('bookingStartTime').value = formatTimeForInput(start);
                    document.getElementById('bookingEndTime').value = formatTimeForInput(end);
                    // Prefill booker name with current userId
                    const bookerInput = document.getElementById('bookingBooker');
                    if (bookerInput) bookerInput.value = userId || '';
                    openModal('bookingModal');
                }

                // Handle Cancel Click
                if (target.classList.contains('btn-delete-booking')) {
                    const id = target.dataset.id;
                    const slotHour = target.dataset.slotHour ? parseInt(target.dataset.slotHour) : null;
                    const bookingIndex = allBookings.findIndex(x => x.id === id);
                    const booking = bookingIndex !== -1 ? allBookings[bookingIndex] : null;

                    if (!booking || slotHour === null) return;

                    const slotStart = new Date(currentBookingDate); slotStart.setHours(slotHour, 0, 0, 0);
                    const slotEnd = new Date(currentBookingDate); slotEnd.setHours(slotHour + 1, 0, 0, 0);
                    const slotStartMs = slotStart.getTime();
                    const slotEndMs = slotEnd.getTime();

                    if (!confirm(`Cancel booking for ${booking.resourceId} at ${slotStart.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', hour12: false})}?`)) return;

                    const bStart = booking.startTime;
                    const bEnd = booking.endTime;

                    // Case A: slot covers entire booking => remove booking
                    if (slotStartMs <= bStart && slotEndMs >= bEnd) {
                        allBookings.splice(bookingIndex, 1);
                        createLogEntry(`Cancelled Booking`, `${booking.resourceId} at ${formatTimestamp(bStart)}`, booking.bookerId);

                    // Case B: cancel at start portion => move booking start to slot end
                    } else if (slotStartMs <= bStart && slotEndMs < bEnd) {
                        allBookings[bookingIndex].startTime = slotEndMs;
                        createLogEntry(`Cancelled Booking (start trimmed)`, `${booking.resourceId} at ${formatTimestamp(bStart)}`, booking.bookerId);

                    // Case C: cancel at end portion => move booking end to slot start
                    } else if (slotStartMs > bStart && slotEndMs >= bEnd) {
                        allBookings[bookingIndex].endTime = slotStartMs;
                        createLogEntry(`Cancelled Booking (end trimmed)`, `${booking.resourceId} at ${formatTimestamp(slotStartMs)}`, booking.bookerId);

                    // Case D: slot in middle => split into two bookings
                    } else if (slotStartMs > bStart && slotEndMs < bEnd) {
                        // shorten original to end at slotStart
                        allBookings[bookingIndex].endTime = slotStartMs;
                        // create new booking for the right-hand portion
                        const newBooking = {
                            id: 'book-' + Date.now() + Math.random(),
                            resourceId: booking.resourceId,
                            startTime: slotEndMs,
                            endTime: bEnd,
                            bookerId: booking.bookerId,
                            createdAt: new Date().toISOString(),
                            status: booking.status || 'confirmed'
                        };
                        allBookings.push(newBooking);
                        createLogEntry(`Cancelled Booking (split)`, `${booking.resourceId} at ${formatTimestamp(slotStartMs)}`, booking.bookerId);
                    }

                    saveData();
                    showToast("Booking updated.");
                    reloadDataAndRender();
                    // Attempt to sync changes immediately
                    syncAfterUpdate().catch(() => {});
                }
            });
        }

        function setupEventListeners() {
            // Setup Resource Select
            const select = document.getElementById('bookingResource');
            RESOURCES.forEach(r => {
                const opt = document.createElement('option');
                opt.value = r.id; opt.textContent = r.name;
                select.appendChild(opt);
            });

            // Modal Controls
            document.getElementById('closeBookingModalBtn').onclick = closeModal;
            document.getElementById('cancelBookingModalBtn').onclick = closeModal;
            document.getElementById('modalBackdrop').onclick = closeModal;
            
            document.getElementById('openBookingModalBtn').onclick = () => {
                document.getElementById('bookingForm').reset();
                document.getElementById('bookingDate').value = formatDateForInput(currentBookingDate);
                // Prefill booker name
                const bookerInput = document.getElementById('bookingBooker');
                if (bookerInput) bookerInput.value = userId || '';
                // Set min date and time limits
                const dateInput = document.getElementById('bookingDate');
                const startInput = document.getElementById('bookingStartTime');
                const endInput = document.getElementById('bookingEndTime');
                if (dateInput) {
                    dateInput.min = formatDateForInput(new Date());
                }
                // If opening for today, ensure time min is now
                const todayStr = formatDateForInput(new Date());
                if (dateInput && dateInput.value === todayStr && startInput) {
                    startInput.min = formatTimeForInput(new Date());
                    endInput.min = formatTimeForInput(new Date());
                } else if (startInput) {
                    startInput.min = '';
                    endInput.min = '';
                }
                openModal('bookingModal');
            };

            // Today button
            const todayBtn = document.getElementById('todayBtn');
            if (todayBtn) {
                todayBtn.addEventListener('click', () => {
                    currentBookingDate = new Date();
                    reloadDataAndRender();
                });
            }

            // Manage bookings search
            const searchInput = document.getElementById('searchBookingInput');
            if (searchInput) {
                searchInput.addEventListener('input', (e) => {
                    renderBookingsList(e.target.value.trim());
                });
            }

            // Sync now button
            const syncBtn = document.getElementById('syncBtn');
            const syncStatus = document.getElementById('syncStatus');
            if (syncBtn) {
                syncBtn.addEventListener('click', async () => {
                    syncBtn.disabled = true;
                    if (syncStatus) { syncStatus.classList.remove('hidden'); syncStatus.textContent = 'Syncing...'; }
                    const pushOk = await pushToGoogleSheet();
                    const pullOk = await pullFromGoogleSheet();
                    loadData();
                    cleanupExpiredBookings();
                    reloadDataAndRender();
                    if (pushOk && pullOk) {
                        showToast('Sync complete!');
                        if (syncStatus) syncStatus.textContent = 'Synced just now';
                    } else if (pushOk) {
                        showToast('Push succeeded; pull failed (see console)', true);
                        if (syncStatus) syncStatus.textContent = 'Push succeeded';
                    } else if (pullOk) {
                        showToast('Pulled latest bookings from sheet');
                        if (syncStatus) syncStatus.textContent = 'Pulled just now';
                    } else {
                        showToast('Sync failed. Check console for details.', true);
                        if (syncStatus) syncStatus.textContent = 'Sync failed';
                    }
                    setTimeout(() => { if (syncStatus) syncStatus.classList.add('hidden'); }, 5000);
                    syncBtn.disabled = false;
                });
            }

            // Adjust time input minima when booking date changes
            const bookingDateInput = document.getElementById('bookingDate');
            if (bookingDateInput) {
                bookingDateInput.addEventListener('change', (e) => {
                    const startInput = document.getElementById('bookingStartTime');
                    const endInput = document.getElementById('bookingEndTime');
                    if (!startInput || !endInput) return;
                    const todayStr = formatDateForInput(new Date());
                    if (e.target.value === todayStr) {
                        const now = new Date();
                        startInput.min = formatTimeForInput(now);
                        endInput.min = formatTimeForInput(now);
                    } else {
                        startInput.min = '';
                        endInput.min = '';
                    }
                });
            }

            // Remove booking from Manage Bookings table (delegated)
            const bookingsBody = document.getElementById('bookingsTableBody');
            if (bookingsBody) {
                bookingsBody.addEventListener('click', (e) => {
                    const btn = e.target.closest('.btn-remove-booking');
                    if (!btn) return;
                    const id = btn.dataset.id;
                    const idx = allBookings.findIndex(x => x.id === id);
                    if (idx === -1) return;
                    const booking = allBookings[idx];
                    const confirmMsg = `Remove booking for ${booking.resourceId} on ${new Date(booking.startTime).toLocaleDateString()} ${new Date(booking.startTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', hour12:false})}?`;
                    if (!confirm(confirmMsg)) return;
                    allBookings.splice(idx, 1);
                    saveData();
                    createLogEntry('Removed Booking', `${booking.resourceId} at ${formatTimestamp(booking.startTime)}`, booking.bookerId);
                    showToast('Booking removed.');
                    renderBookingsList(searchInput ? searchInput.value.trim() : '');
                    reloadDataAndRender();
                    // Sync the deletion to Google Sheet
                    syncAfterUpdate().catch(() => {});
                });
            }

            // Booking Form Submit
            document.getElementById('bookingForm').onsubmit = (e) => {
                e.preventDefault();
                const resId = document.getElementById('bookingResource').value;
                const d = document.getElementById('bookingDate').value;
                const sStr = document.getElementById('bookingStartTime').value;
                const eStr = document.getElementById('bookingEndTime').value;
                const booker = document.getElementById('bookingBooker') ? document.getElementById('bookingBooker').value.trim() : '';
                
                if (!sStr || !eStr) {
                    return showToast("Please select both start and end times.", true);
                }
                if (!booker) {
                    return showToast("Please enter your name.", true);
                }
                
                const start = new Date(d + 'T' + sStr);
                const end = new Date(d + 'T' + eStr);
                
                if (end <= start) return showToast("End time must be after start time.", true);
                // Prevent bookings in the past
                if (start.getTime() < Date.now()) return showToast("Cannot create a booking in the past.", true);
                
                // Validate selected date is not in the past
                const selectedDate = new Date(d);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                selectedDate.setHours(0, 0, 0, 0);
                
                if (selectedDate < today) {
                    return showToast("Error: Cannot book in the past", true);
                }
                
                const startMs = start.getTime();
                const endMs = end.getTime();
                
                // Conflict Check
                const hasConflict = allBookings.find(b => b.resourceId === resId && (startMs < b.endTime && endMs > b.startTime));
                if (hasConflict) return showToast("This time slot is already reserved.", true);

                allBookings.push({ 
                    id: 'book-' + Date.now(), 
                    resourceId: resId, 
                    startTime: startMs, 
                    endTime: endMs, 
                    bookerId: booker,
                    createdAt: new Date().toISOString(),
                    status: 'confirmed'
                });

                saveData();
                createLogEntry(`New Booking`, `${resId} for ${formatTimestamp(startMs)}`, booker);
                
                // Send booking to Google Apps Script
                const res = RESOURCES.find(r => r.id === resId);
                const bookingData = {
                    bookingId: 'B-' + Date.now(),
                    pcName: res ? res.name : resId,
                    date: formatDateForInput(start),
                    startTime: formatTimeForInput(start),
                    endTime: formatTimeForInput(end),
                    userName: booker
                };
                
                fetch('https://script.google.com/a/macros/motorolasolutions.com/s/AKfycbzqWkGQmNmUOqGWXkmlMtg6mv5GHn3p92cIZpfDCd_oiSr3AmJDyZLsvMg3J6VD3oLF/exec', {
                    method: 'POST',
                    body: JSON.stringify(bookingData)
                })
                .then(response => console.log('Booking Saved!'))
                .catch(err => console.warn('Failed to save booking to Google Apps Script:', err));
                
                showToast("Booking confirmed!");
                closeModal();
                reloadDataAndRender();
                // Immediately sync new booking to shared sheet
                syncAfterUpdate().catch(() => {});
            };

            // Day Navigation
            document.getElementById('prevDayBtn').onclick = () => { 
                currentBookingDate.setDate(currentBookingDate.getDate() - 1); 
                reloadDataAndRender(); 
            };
            document.getElementById('nextDayBtn').onclick = () => { 
                currentBookingDate.setDate(currentBookingDate.getDate() + 1); 
                reloadDataAndRender(); 
            };
        }

        // --- INIT ---
        document.addEventListener('DOMContentLoaded', async () => {
            try {
                await pullFromGoogleSheet();
            } catch (e) {
                console.warn('Initial sheet pull failed:', e);
            }

            loadData();
            setupNavigation();
            setupEventListeners();
            setupDelegatedListeners();
            reloadDataAndRender();

            // Start automatic polling every 1 minute
            setupAutoPolling(60 * 1000);
        });