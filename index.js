// --- CONFIGURATION ---
        const RESOURCES = [
            { id: 'PC-1', name: 'URANUS NM CLIENT', group: 'PC' },
            { id: 'PC-2', name: 'URANUS KMF CLIENT', group: 'PC' },
            { id: 'PC-3', name: 'URANUS DISPATCH', group: 'PC' },
            { id: 'PC-4', name: 'TYPE 2 NM CLIENT', group: 'PC' },
            { id: 'PC-5', name: 'TYPE 2 KMF CLIENT', group: 'PC' },
            { id: 'PC-6', name: 'TYPE 2 DISPATCH', group: 'PC' },
            { id: 'Laptop-1', name: 'FG Laptop 1', group: 'Laptop' },
            { id: 'Laptop-2', name: 'FG Laptop 2', group: 'Laptop' },
            { id: 'Laptop-3', name: 'FG Laptop 3', group: 'Laptop' },
            { id: 'Laptop-4', name: 'FG Laptop 4', group: 'Laptop' }, 
            { id: 'Laptop-4', name: 'FG Laptop 5', group: 'Laptop' }, 
            { id: 'MCH-Mobile', name: 'Multi Control Head Mobile', group: 'Mobile' }, 
        ];

        // --- GLOBAL STATE ---
        let currentUser = null;
        let userId; 
        let currentBookingDate = new Date();
        let allBookings = [];
        let allLogs = [];
        const LOCAL_STORAGE_KEY = 'resource_booking_data_v2';
        const AUTH_STORAGE_KEY = 'booking_system_auth';
        const USERS_STORAGE_KEY = 'booking_system_users';
        
        // --- DEMO USERS (Initialize on first load) ---
        function initializeDemoUsers() {
            const existingUsers = localStorage.getItem(USERS_STORAGE_KEY);
            if (!existingUsers) {
                const demoUsers = {
                    'demo': { password: 'demo123', email: 'demo@booking.local' },
                    'admin': { password: 'admin123', email: 'admin@booking.local' },
                };
                localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(demoUsers));
            }
        }
        
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
        
        // --- LOGIN SYSTEM ---
        function loginUser(username, password) {
            const usersJson = localStorage.getItem(USERS_STORAGE_KEY);
            if (!usersJson) {
                showToast("No users found. System not initialized.", true);
                return false;
            }
            
            const users = JSON.parse(usersJson);
            const user = users[username];
            
            if (!user || user.password !== password) {
                showToast("Invalid username or password.", true);
                return false;
            }
            
            currentUser = { username: username, loginTime: new Date().toISOString() };
            userId = username;
            localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(currentUser));
            showToast(`Welcome, ${username}!`);
            return true;
        }
        
        function logoutUser() {
            if (currentUser) {
                createLogEntry('User Logout', `${currentUser.username} logged out`);
            }
            currentUser = null;
            userId = null;
            localStorage.removeItem(AUTH_STORAGE_KEY);
            location.reload();
        }
        
        function checkAuthStatus() {
            const storedAuth = localStorage.getItem(AUTH_STORAGE_KEY);
            if (storedAuth) {
                currentUser = JSON.parse(storedAuth);
                userId = currentUser.username;
                return true;
            }
            return false;
        }
        
        function showLoginPage() {
            document.getElementById('loginPage').classList.remove('hidden');
            document.getElementById('appContainer').classList.add('hidden');
        }
        
        function showAppPage() {
            document.getElementById('loginPage').classList.add('hidden');
            document.getElementById('appContainer').classList.remove('hidden');
            document.getElementById('userIdDisplay').textContent = userId;
        }
        
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
        }
        
        function reloadDataAndRender() {
            loadData();
            allBookings.sort((a, b) => a.startTime - b.startTime);
            allLogs.sort((a, b) => b.timestamp - a.timestamp);
            renderLogsTable();
            renderBookingSchedule();
            renderDashboardStats();
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
            return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
        }
        
        function formatDateForBooking(date) {
            return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        }
        
        function formatDateForInput(date) { return date.toISOString().split('T')[0]; }
        
        function formatTimeForInput(date) {
            const hours = date.getHours().toString().padStart(2, '0');
            const minutes = Math.round(date.getMinutes() / 30) * 30;
            const finalMinutes = minutes === 60 ? '00' : minutes.toString().padStart(2, '0');
            return `${hours}:${finalMinutes}`;
        }

        function showToast(message, isError = false) {
            const toast = document.getElementById('toast');
            const toastMessage = document.getElementById('toastMessage');
            toastMessage.textContent = message;
            toast.className = `fixed bottom-10 right-10 ${isError ? 'bg-red-600' : 'bg-slate-900'} text-white py-3 px-6 rounded-lg shadow-xl transform transition-transform duration-300 ease-out z-50`;
            toast.classList.remove('translate-x-full');
            setTimeout(() => toast.classList.add('translate-x-full'), 3000);
        }

        function openModal(modalId) {
            document.getElementById(modalId).classList.add('active');
            document.getElementById('modalBackdrop').classList.add('active');
        }

        function closeModal() {
            document.querySelectorAll('.modal.active').forEach(modal => modal.classList.remove('active'));
            document.getElementById('modalBackdrop').classList.remove('active');
        }

        function createLogEntry(activityType, details = "") {
            allLogs.unshift({ id: 'log-' + Date.now(), timestamp: Date.now(), userId: userId, activityType: activityType, details: details });
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
        
        function renderDashboardStats() {
            const now = new Date();
            const pcGrid = document.getElementById('pc-stats-grid');
            const laptopGrid = document.getElementById('laptop-stats-grid');
            pcGrid.innerHTML = ''; laptopGrid.innerHTML = '';

            RESOURCES.forEach(res => {
                const card = document.createElement('div');
                card.className = "bg-white p-6 rounded-xl shadow-sm border border-slate-200";
                
                const bookings = allBookings.filter(b => b.resourceId === res.id);
                const current = bookings.find(b => now.getTime() >= b.startTime && now.getTime() < b.endTime);
                
                let statusText, statusClass, nextText;
                if (current) {
                    statusText = "Occupied";
                    statusClass = "text-red-600";
                    nextText = `Until ${new Date(current.endTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`;
                } else {
                    statusText = "Available";
                    statusClass = "text-green-600";
                    const next = bookings.filter(b => b.startTime > now.getTime()).sort((a,b)=>a.startTime-b.startTime)[0];
                    nextText = next ? `Next: ${new Date(next.startTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}` : "Free for today";
                }

                card.innerHTML = `
                    <div class="flex justify-between items-start mb-4">
                        <h3 class="font-bold text-slate-800">${res.name}</h3>
                        <span class="text-xl">${res.group === 'PC' ? '🖥️' : '💻'}</span>
                    </div>
                    <p class="text-xl font-bold ${statusClass}">${statusText}</p>
                    <p class="text-xs text-slate-500 mt-1">${nextText}</p>
                `;
                
                if (res.group === 'PC') pcGrid.appendChild(card);
                else laptopGrid.appendChild(card);
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
                        <p class="text-xs text-slate-500">${formatTimestamp(log.timestamp)}</p>
                    </div>
                </li>
            `).join('');
        }
        
        function renderBookingSchedule() {
            document.getElementById('bookingDateDisplay').textContent = formatDateForBooking(currentBookingDate);
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
                    const timeLabel = timeStart.toLocaleTimeString([], { hour: 'numeric', hour12: true });
                    const b = filteredBookings.find(x => new Date(x.startTime).getHours() === hour);
                    
                    if (b) {
                        slot.className = "p-3 bg-red-50 border border-red-100 rounded-lg flex justify-between items-center";
                        slot.innerHTML = `
                            <div><p class="font-bold text-red-900 text-sm">${timeLabel}</p><p class="text-[10px] text-red-700">Reserved: ${b.bookerId.substring(0, 6)}</p></div>
                            <button class="btn-delete-booking text-[10px] font-bold text-red-600 bg-white px-2 py-1 rounded border border-red-200 hover:bg-red-50" data-id="${b.id}">Cancel</button>
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
                    
                    document.getElementById('bookingResource').value = resId;
                    document.getElementById('bookingDate').value = formatDateForInput(start);
                    document.getElementById('bookingStartTime').value = formatTimeForInput(start);
                    document.getElementById('bookingEndTime').value = formatTimeForInput(end);
                    openModal('bookingModal');
                }

                // Handle Cancel Click
                if (target.classList.contains('btn-delete-booking')) {
                    const id = target.dataset.id;
                    const booking = allBookings.find(x => x.id === id);
                    
                    if (booking && confirm(`Cancel booking for ${booking.resourceId} at ${new Date(booking.startTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}?`)) {
                        allBookings = allBookings.filter(x => x.id !== id);
                        saveData();
                        createLogEntry(`Cancelled Booking`, `${booking.resourceId} at ${formatTimestamp(booking.startTime)}`);
                        showToast("Booking cancelled.");
                        reloadDataAndRender();
                    }
                }
            });
        }

        function setupEventListeners() {
            // LOGIN FORM SUBMIT
            document.getElementById('loginForm').onsubmit = (e) => {
                e.preventDefault();
                const username = document.getElementById('loginUsername').value.trim();
                const password = document.getElementById('loginPassword').value.trim();
                
                if (loginUser(username, password)) {
                    loadData();
                    showAppPage();
                    setupNavigation();
                    setupDelegatedListeners();
                    reloadDataAndRender();
                    document.getElementById('loginForm').reset();
                }
            };
            
            // LOGOUT BUTTON
            document.getElementById('logoutBtn').addEventListener('click', logoutUser);
            
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
                
                // Populate time dropdowns with hourly intervals (8:00 to 18:00)
                const startSelect = document.getElementById('bookingStartTime');
                const endSelect = document.getElementById('bookingEndTime');
                
                startSelect.innerHTML = '<option value="">Select start time...</option>';
                endSelect.innerHTML = '<option value="">Select end time...</option>';
                
                for (let hour = 8; hour <= 18; hour++) {
                    const timeStr = `${hour.toString().padStart(2, '0')}:00`;
                    const timeLabel = new Date(0, 0, 0, hour, 0).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                    
                    const opt1 = document.createElement('option');
                    opt1.value = timeStr;
                    opt1.textContent = timeLabel;
                    startSelect.appendChild(opt1);
                    
                    const opt2 = document.createElement('option');
                    opt2.value = timeStr;
                    opt2.textContent = timeLabel;
                    endSelect.appendChild(opt2);
                }
                
                openModal('bookingModal');
            };

            // Booking Form Submit
            document.getElementById('bookingForm').onsubmit = (e) => {
                e.preventDefault();
                const resId = document.getElementById('bookingResource').value;
                const d = document.getElementById('bookingDate').value;
                const sStr = document.getElementById('bookingStartTime').value;
                const eStr = document.getElementById('bookingEndTime').value;
                
                if (!sStr || !eStr) {
                    return showToast("Please select both start and end times.", true);
                }
                
                const start = new Date(d + 'T' + sStr);
                const end = new Date(d + 'T' + eStr);
                
                if (end <= start) return showToast("End time must be after start time.", true);
                
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
                    bookerId: userId,
                    createdAt: new Date().toISOString(),
                    status: 'confirmed'
                });
                
                saveData();
                createLogEntry(`New Booking`, `${resId} for ${formatTimestamp(startMs)}`);
                showToast("Booking confirmed!");
                closeModal();
                reloadDataAndRender();
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
        document.addEventListener('DOMContentLoaded', () => {
            initializeDemoUsers();
            
            if (checkAuthStatus()) {
                showAppPage();
                loadData();
                setupNavigation();
                setupEventListeners();
                setupDelegatedListeners();
                reloadDataAndRender();
            } else {
                showLoginPage();
                setupEventListeners();
            }
        });