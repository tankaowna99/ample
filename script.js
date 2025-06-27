document.addEventListener('DOMContentLoaded', () => {
    // ★★★ CONFIGURATION ★★★
    const APPS_SCRIPT_URL = '★★★ YOUR_APPS_SCRIPT_WEB_APP_URL ★★★';

    // --- ELEMENTS ---
    const clockElement = document.getElementById('clock');
    const employeeSelect = document.getElementById('employee-select');
    const checkinBtn = document.getElementById('checkin-btn');
    const checkoutBtn = document.getElementById('checkout-btn');
    const video = document.getElementById('camera-video');
    const canvas = document.getElementById('photo-canvas');
    const photoPreview = document.getElementById('photo-preview');
    const flipCameraBtn = document.getElementById('flip-camera-btn');
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    const loader = document.getElementById('loader');
    const loaderText = document.getElementById('loader-text');
    const loginSection = document.getElementById('login-section');
    const appSection = document.getElementById('app-section');
    const saveEmpBtn = document.getElementById('save-emp-btn');
    const cancelEditBtn = document.getElementById('cancel-edit-btn');
    const filterBtn = document.getElementById('filter-btn');

    // --- STATE ---
    let currentStream;
    let useFrontCamera = true;
    let locationChart, trendChart;

    // --- INITIALIZATION ---
    M.Tabs.init(document.querySelector('.tabs'));
    updateClock();
    setInterval(updateClock, 1000);
    loadEmployees();
    startCamera();
    setupEventListeners();
    initDarkMode();

    // --- CORE FUNCTIONS ---
    function updateClock() {
        const now = new Date();
        clockElement.textContent = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    async function loadEmployees() {
        showLoader('Loading employees...');
        try {
            const response = await postToAction({ action: 'getEmployees' });
            if (response.status === 'success') {
                const currentVal = employeeSelect.value;
                employeeSelect.innerHTML = '<option value="" disabled selected>เลือกรหัส/ชื่อพนักงาน</option>';
                response.data.forEach(emp => {
                    const option = document.createElement('option');
                    option.value = emp.id;
                    option.textContent = `${emp.id} - ${emp.name}`;
                    employeeSelect.appendChild(option);
                });
                employeeSelect.value = currentVal;
                M.FormSelect.init(employeeSelect);
            } else {
                showToast('Failed to load employees.', 'red');
            }
        } catch (error) {
            showToast(`Error: ${error.message}`, 'red');
        }
        hideLoader();
    }
    
    async function startCamera() {
        if (currentStream) currentStream.getTracks().forEach(track => track.stop());
        
        video.classList.toggle('rear-facing', !useFrontCamera);
        const constraints = { video: { facingMode: useFrontCamera ? 'user' : 'environment' } };
        try {
            currentStream = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = currentStream;
            photoPreview.style.display = 'none';
            video.style.display = 'block';
        } catch (err) {
            showToast('Could not access camera.', 'red');
        }
    }

    function handleCheck(checkType) {
        const employeeId = employeeSelect.value;
        if (!employeeId) {
            showToast('Please select an employee.', 'orange');
            return;
        }

        showLoader(`Processing Check-${checkType}...`);
        
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                const photoData = takePhoto();
                const payload = { action: 'checkin', employeeId, checkType, photoData, lat: latitude, lon: longitude };

                try {
                    const result = await postToAction(payload);
                    if (result.status === 'success') showToast(result.message, 'green');
                    else showToast(`Error: ${result.message}`, 'red');
                } catch (error) {
                    showToast(`Network Error: ${error.message}`, 'red');
                } finally {
                    hideLoader();
                    setTimeout(() => startCamera(), 2000); // Restart camera after showing preview
                }
            },
            (error) => {
                showToast('Could not get location. Please enable GPS.', 'red');
                hideLoader();
            },
            { enableHighAccuracy: true }
        );
    }
    
    function takePhoto() {
        const context = canvas.getContext('2d');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.save();
        if (useFrontCamera) {
            context.scale(-1, 1);
            context.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
        } else {
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
        }
        context.restore();
        
        const data = canvas.toDataURL('image/jpeg');
        photoPreview.src = data;
        video.style.display = 'none';
        photoPreview.style.display = 'block';
        return data;
    }

    async function postToAction(payload) {
        const response = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            mode: 'cors',
            body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return response.json();
    }
    
    // --- GOOGLE SIGN-IN ---
    window.handleGoogleSignIn = async function(response) {
        showLoader("Verifying access...");
        try {
            const result = await postToAction({ action: 'verifyAdmin', token: response.credential });
            if (result.isAdmin) {
                showToast(`Welcome, ${result.email}`, 'green');
                loginSection.style.display = 'none';
                appSection.style.display = 'block';
                loadAdminData();
                loadDashboardData();
            } else {
                showToast(result.message || 'Access Denied.', 'red');
            }
        } catch (error) {
            showToast('Verification Error.', 'red');
        } finally {
            hideLoader();
        }
    }

    // --- ADMIN PANEL FUNCTIONS ---
    async function loadAdminData() {
        showLoader('Loading employee list...');
        try {
            // ★ NOTE: You need to create a 'getAllEmployees' action in Apps Script
            // that returns all employee details (ID, Name, Position, Email).
            const response = await postToAction({ action: 'getAllEmployees' }); 
            const tableBody = document.getElementById('employee-table-body');
            tableBody.innerHTML = '';

            if (response.status === 'success') {
                response.data.forEach(emp => {
                    const tr = document.createElement('tr');
                    tr.dataset.employee = JSON.stringify(emp);
                    tr.innerHTML = `<td>${emp.EmployeeID}</td><td>${emp.FullName}</td><td>${emp.Position}</td><td>${emp.Email}</td>
                        <td>
                            <button class="btn-floating btn-small waves-effect waves-light orange edit-btn"><i class="material-icons">edit</i></button>
                            <button class="btn-floating btn-small waves-effect waves-light red delete-btn"><i class="material-icons">delete</i></button>
                        </td>`;
                    tableBody.appendChild(tr);
                });
                addTableActionListeners();
            }
        } catch (e) {
            showToast('Failed to load employee data.', 'red');
        }
        hideLoader();
    }
    
    function addTableActionListeners() {
        document.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', handleEditEmployee));
        document.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', handleDeleteEmployee));
    }

    function handleEditEmployee(event) {
        const empData = JSON.parse(event.currentTarget.closest('tr').dataset.employee);
        document.getElementById('employee-form-mode').value = 'edit';
        document.getElementById('original-emp-id').value = empData.EmployeeID;
        document.getElementById('emp-id').value = empData.EmployeeID;
        document.getElementById('emp-name').value = empData.FullName;
        document.getElementById('emp-position').value = empData.Position;
        document.getElementById('emp-email').value = empData.Email;
        document.getElementById('emp-id').disabled = true;
        saveEmpBtn.textContent = 'Save Changes';
        cancelEditBtn.style.display = 'inline-block';
        M.updateTextFields(); // Materialize function to update labels
    }

    async function handleDeleteEmployee(event) {
        const empData = JSON.parse(event.currentTarget.closest('tr').dataset.employee);
        if (confirm(`Are you sure you want to delete ${empData.FullName}?`)) {
            showLoader('Deleting employee...');
            const result = await postToAction({ action: 'manageEmployee', subAction: 'delete', payload: { EmployeeID: empData.EmployeeID }});
            if (result.status === 'success') {
                showToast(result.message, 'green');
                loadAdminData();
                loadEmployees(); // Reload check-in dropdown
            } else {
                showToast(result.message, 'red');
            }
            hideLoader();
        }
    }

    function resetEmployeeForm() {
        document.getElementById('employee-form-mode').value = 'add';
        document.getElementById('emp-id').value = '';
        document.getElementById('emp-name').value = '';
        document.getElementById('emp-position').value = '';
        document.getElementById('emp-email').value = '';
        document.getElementById('emp-id').disabled = false;
        saveEmpBtn.textContent = 'Add Employee';
        cancelEditBtn.style.display = 'none';
    }

    // --- DASHBOARD FUNCTIONS ---
    async function loadDashboardData() {
        showLoader('Loading dashboard data...');
        const startDate = document.getElementById('start-date').value;
        const endDate = document.getElementById('end-date').value;
        try {
            const response = await postToAction({ action: 'getLogs', startDate, endDate });
            if (response.status === 'success') processDashboardData(response.data);
            else showToast('Failed to load logs.', 'red');
        } catch (e) {
            showToast('Error loading dashboard.', 'red');
        }
        hideLoader();
    }
    
    function processDashboardData(logs) {
        if (!logs || logs.length === 0) {
            ['summary-present', 'summary-late', 'summary-onsite'].forEach(id => document.getElementById(id).textContent = '0');
            renderPieChart('location-chart', ['No Data'], [1]);
            return;
        }

        const today = new Date().toISOString().slice(0, 10);
        const todayLogs = logs.filter(log => new Date(log[0]).toISOString().slice(0, 10) === today && log[3] === 'in');
        document.getElementById('summary-present').textContent = new Set(todayLogs.map(log => log[1])).size;
        document.getElementById('summary-late').textContent = todayLogs.filter(log => new Date(log[0]).getHours() >= 9).length;
        document.getElementById('summary-onsite').textContent = logs.filter(log => log[6] === 'On-Site').length;
        
        const inOffice = logs.filter(log => log[6] === 'In-Office').length;
        const onSite = logs.filter(log => log[6] === 'On-Site').length;
        renderPieChart('location-chart', ['In-Office', 'On-Site'], [inOffice, onSite]);
    }

    function renderPieChart(canvasId, labels, data) {
        const ctx = document.getElementById(canvasId).getContext('2d');
        if (window[canvasId]) window[canvasId].destroy();
        window[canvasId] = new Chart(ctx, {
            type: 'pie', data: { labels, datasets: [{ data, backgroundColor: ['#42a5f5', '#ff7043', '#cccccc'] }] },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    // --- UI HELPERS & EVENT LISTENERS ---
    function setupEventListeners() {
        checkinBtn.addEventListener('click', () => handleCheck('in'));
        checkoutBtn.addEventListener('click', () => handleCheck('out'));
        flipCameraBtn.addEventListener('click', () => { useFrontCamera = !useFrontCamera; startCamera(); });
        darkModeToggle.addEventListener('click', toggleDarkMode);
        saveEmpBtn.addEventListener('click', async () => {
            const payload = {
                EmployeeID: document.getElementById('emp-id').value,
                FullName: document.getElementById('emp-name').value,
                Position: document.getElementById('emp-position').value,
                Email: document.getElementById('emp-email').value
            };
            if (!payload.EmployeeID || !payload.FullName) { showToast('ID and Name are required.', 'orange'); return; }
            showLoader('Saving...');
            const result = await postToAction({ action: 'manageEmployee', subAction: document.getElementById('employee-form-mode').value, payload });
            if (result.status === 'success') {
                showToast(result.message, 'green');
                resetEmployeeForm();
                loadAdminData();
                loadEmployees();
            } else {
                showToast(result.message, 'red');
            }
            hideLoader();
        });
        cancelEditBtn.addEventListener('click', resetEmployeeForm);
        filterBtn.addEventListener('click', loadDashboardData);
    }
    function showToast(message, color = 'blue-grey') { M.toast({ html: message, classes: color }); }
    function showLoader(text) { loaderText.textContent = text; loader.style.display = 'flex'; }
    function hideLoader() { loader.style.display = 'none'; }
    function initDarkMode() { if (localStorage.getItem('dark-mode') === 'true') { document.body.classList.add('dark-mode'); darkModeToggle.querySelector('i').textContent = 'brightness_7'; } }
    function toggleDarkMode() {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');
        localStorage.setItem('dark-mode', isDark);
        darkModeToggle.querySelector('i').textContent = isDark ? 'brightness_7' : 'brightness_4';
    }
});