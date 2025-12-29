// ========== CONFIGURAÇÕES E CONSTANTES ==========
const SCHEMA_VERSION = '2.0';
const DB_NAME = 'fittrack_db';
const DB_VERSION = 1;
const PHOTOS_STORE = 'photos';
const RECORDS_STORE = 'records';

let CONFIG = {
    metaPeso: 65.0,
    pesoInicial: 88.0,
    nome: 'Usuário',
    prazoMeta: null,
    reminderEnabled: false,
    reminderTime: '20:00',
    theme: 'dark'
};

let db = null;
let currentCalendarDate = new Date();
let selectedDate = new Date();
let chartPeriod = 14;

// ========== INICIALIZAÇÃO ==========
document.addEventListener('DOMContentLoaded', async () => {
    await initDatabase();
    await migrateData();
    loadConfig();
    setupEventListeners();
    registerServiceWorker();
    updateDashboard();
    renderCalendar();
    updateHistory();
    updateGreeting();
    updateRegisterDate();
    drawChart();
    checkNotifications();
    initComparisonSlider();
});

// ========== SERVICE WORKER (PWA) ==========
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/service-worker.js')
            .then((registration) => {
                console.log('Service Worker registrado com sucesso:', registration);
            })
            .catch((error) => {
                console.log('Falha ao registrar Service Worker:', error);
            });
    }
}

// ========== INDEXEDDB ==========
async function initDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve();
        };
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(PHOTOS_STORE)) {
                db.createObjectStore(PHOTOS_STORE, { keyPath: 'id', autoIncrement: true });
            }
            if (!db.objectStoreNames.contains(RECORDS_STORE)) {
                db.createObjectStore(RECORDS_STORE, { keyPath: 'id', autoIncrement: true });
            }
        };
    });
}

async function savePhotoToDB(blob, type) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([PHOTOS_STORE], 'readwrite');
        const store = transaction.objectStore(PHOTOS_STORE);
        const request = store.add({ blob, type, timestamp: Date.now() });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getPhotoFromDB(photoId) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([PHOTOS_STORE], 'readonly');
        const store = transaction.objectStore(PHOTOS_STORE);
        const request = store.get(photoId);
        request.onsuccess = () => {
            if (request.result) {
                resolve(URL.createObjectURL(request.result.blob));
            } else {
                resolve(null);
            }
        };
        request.onerror = () => reject(request.error);
    });
}

// ========== MIGRAÇÃO DE DADOS ==========
async function migrateData() {
    const savedVersion = localStorage.getItem('fittrack_schema_version');
    
    if (savedVersion === SCHEMA_VERSION) {
        return; // Já migrado
    }
    
    // Migrar registros do LocalStorage para IndexedDB
    const oldRecords = JSON.parse(localStorage.getItem('fittrack_records') || '[]');
    
    if (oldRecords.length > 0) {
        const transaction = db.transaction([RECORDS_STORE], 'readwrite');
        const store = transaction.objectStore(RECORDS_STORE);
        
        for (const record of oldRecords) {
            // Migrar fotos para IndexedDB
            const photoIds = {};
            
            if (record.fotoFrente && record.fotoFrente.startsWith('data:')) {
                const blob = dataURLtoBlob(record.fotoFrente);
                const id = await savePhotoToDB(blob, 'frente');
                photoIds.frente = id;
            }
            
            if (record.fotoLado && record.fotoLado.startsWith('data:')) {
                const blob = dataURLtoBlob(record.fotoLado);
                const id = await savePhotoToDB(blob, 'lado');
                photoIds.lado = id;
            }
            
            
            // Salvar registro sem fotos base64
            const newRecord = {
                ...record,
                fotoFrente: photoIds.frente || null,
                fotoLado: photoIds.lado || null
            };
            
            delete newRecord.id; // Deixar auto-incrementar
            store.add(newRecord);
        }
        
        // Limpar LocalStorage antigo
        localStorage.removeItem('fittrack_records');
    }
    
    localStorage.setItem('fittrack_schema_version', SCHEMA_VERSION);
}

function dataURLtoBlob(dataURL) {
    const arr = dataURL.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
}

// ========== EVENT LISTENERS ==========
function setupEventListeners() {
    // Navegação
    document.querySelectorAll('.nav-item[data-section]').forEach(item => {
        item.addEventListener('click', (e) => {
            const section = item.dataset.section;
            showSection(section, item);
        });
    });
    
    // Tema
    document.querySelectorAll('[data-action="toggle-theme"]').forEach(btn => {
        btn.addEventListener('click', toggleTheme);
    });
    
    // Calendário
    document.querySelectorAll('[data-calendar-action]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const action = btn.dataset.calendarAction;
            changeMonth(action === 'next' ? 1 : -1);
        });
    });
    
    // Gráfico
    document.querySelectorAll('[data-chart-period]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const period = parseInt(btn.dataset.chartPeriod);
            setChartPeriod(period);
        });
    });
    
    // Fotos
    document.querySelectorAll('.photo-upload-box').forEach(box => {
        box.addEventListener('click', (e) => {
            const type = box.dataset.photoType;
            document.getElementById(`photo-${type}`).click();
        });
    });
    
    document.getElementById('photo-frente').addEventListener('change', (e) => previewPhoto(e.target, 'preview-frente'));
    document.getElementById('photo-lado').addEventListener('change', (e) => previewPhoto(e.target, 'preview-lado'));
    
    // Salvar registro
    document.getElementById('btn-save-record').addEventListener('click', saveRecord);
    
    // Validações em tempo real
    document.getElementById('input-peso').addEventListener('blur', validatePeso);
    document.getElementById('input-sono').addEventListener('blur', validateSono);
    document.getElementById('input-agua').addEventListener('blur', validateAgua);
    
    // Configurações
    document.querySelectorAll('.settings-item[data-setting]').forEach(item => {
        item.addEventListener('click', (e) => {
            const setting = item.dataset.setting;
            editSetting(setting);
        });
    });
    
    document.getElementById('toggle-reminder').addEventListener('click', toggleReminder);
    
    // Ações gerais
    document.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const action = btn.dataset.action;
            handleAction(action);
        });
    });
    
    // Modal
    document.getElementById('photo-modal').addEventListener('click', (e) => {
        if (e.target.id === 'photo-modal') {
            closePhotoModal();
        }
    });
    
    // Redimensionar gráfico
    window.addEventListener('resize', () => {
        if (document.getElementById('section-dashboard').classList.contains('active')) {
            drawChart();
        }
    });
}

function handleAction(action) {
    switch(action) {
        case 'close-modal':
            closeModal();
            break;
        case 'close-photo-modal':
            closePhotoModal();
            break;
        case 'export-data':
            exportData();
            break;
        case 'clear-data':
            clearAllData();
            break;
        default:
            if (action.startsWith('section-')) {
                const section = action.replace('section-', '');
                showSection(section);
            }
    }
}

// ========== CONFIGURAÇÕES ==========
function loadConfig() {
    const saved = localStorage.getItem('fittrack_config');
    if (saved) {
        CONFIG = { ...CONFIG, ...JSON.parse(saved) };
    }
    
    // Aplicar tema
    document.documentElement.setAttribute('data-theme', CONFIG.theme || 'dark');
    updateThemeIcon();
    
    // Atualizar UI
    document.getElementById('config-nome').textContent = CONFIG.nome;
    document.getElementById('config-meta').textContent = CONFIG.metaPeso + ' kg';
    document.getElementById('config-inicial').textContent = CONFIG.pesoInicial + ' kg';
    document.getElementById('user-name-display').textContent = CONFIG.nome;
    document.getElementById('goal-weight').textContent = CONFIG.metaPeso + ' kg';
    document.getElementById('initial-weight-display').textContent = CONFIG.pesoInicial + ' kg';
    document.getElementById('goal-weight-display').textContent = CONFIG.metaPeso + ' kg';
    
    if (CONFIG.prazoMeta) {
        const prazoDate = new Date(CONFIG.prazoMeta);
        document.getElementById('config-prazo').textContent = prazoDate.toLocaleDateString('pt-BR');
    }
    
    // Toggle reminder
    const reminderToggle = document.getElementById('toggle-reminder');
    if (CONFIG.reminderEnabled) {
        reminderToggle.classList.add('active');
        document.getElementById('notification-time-setting').style.display = 'flex';
    }
    document.getElementById('config-notification-time').textContent = CONFIG.reminderTime;
}

function saveConfig() {
    localStorage.setItem('fittrack_config', JSON.stringify(CONFIG));
    loadConfig();
    updateDashboard();
}

function toggleTheme() {
    CONFIG.theme = CONFIG.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', CONFIG.theme);
    saveConfig();
    updateThemeIcon();
    vibrate(50);
}

function updateThemeIcon() {
    const icons = document.querySelectorAll('[data-action="toggle-theme"] i');
    icons.forEach(icon => {
        icon.className = CONFIG.theme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
    });
}

// ========== NAVEGAÇÃO ==========
function showSection(section, navItem = null) {
    document.querySelectorAll('.form-section').forEach(s => s.classList.remove('active'));
    const targetSection = document.getElementById('section-' + section);
    if (targetSection) {
        targetSection.classList.add('active');
    }
    
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if (navItem) {
        navItem.classList.add('active');
    } else {
        document.querySelector(`.nav-item[data-section="${section}"]`)?.classList.add('active');
    }
    
    vibrate(30);
    
    if (section === 'dashboard') {
        updateDashboard();
        drawChart();
        updateSmartGoals();
        updateInsights();
        updateComparison();
    } else if (section === 'historico') {
        updateHistory();
    } else if (section === 'treinos') {
        initWorkouts();
    }
}

// ========== VALIDAÇÕES ==========
function validatePeso() {
    const input = document.getElementById('input-peso');
    const error = document.getElementById('error-peso');
    const value = parseFloat(input.value);
    const records = getRecords();
    
    if (!value || value <= 0) {
        showError(input, error, 'Peso é obrigatório e deve ser maior que zero');
        return false;
    }
    
    if (value > 300) {
        showError(input, error, 'Peso inválido (máximo 300kg)');
        return false;
    }
    
    // Validar variação extrema
    if (records.length > 0) {
        const lastWeight = records[0].peso;
        const diff = Math.abs(value - lastWeight);
        if (diff > 10) {
            showError(input, error, `Variação muito grande (${diff.toFixed(1)}kg). Verifique o valor.`);
            return false;
        }
    }
    
    showSuccess(input, error);
    return true;
}

function validateSono() {
    const input = document.getElementById('input-sono');
    const error = document.getElementById('error-sono');
    const value = parseFloat(input.value);
    
    if (value && (value < 0 || value > 24)) {
        showError(input, error, 'Sono deve estar entre 0 e 24 horas');
        return false;
    }
    
    if (value) {
        showSuccess(input, error);
    } else {
        clearValidation(input, error);
    }
    return true;
}

function validateAgua() {
    const input = document.getElementById('input-agua');
    const error = document.getElementById('error-agua');
    const value = parseFloat(input.value);
    
    if (value && (value < 0 || value > 20)) {
        showError(input, error, 'Água deve estar entre 0 e 20 litros');
        return false;
    }
    
    if (value) {
        showSuccess(input, error);
    } else {
        clearValidation(input, error);
    }
    return true;
}

function showError(input, errorEl, message) {
    input.classList.add('error');
    input.classList.remove('success');
    errorEl.textContent = message;
    errorEl.classList.add('show');
    vibrate(100);
}

function showSuccess(input, errorEl) {
    input.classList.remove('error');
    input.classList.add('success');
    errorEl.classList.remove('show');
}

function clearValidation(input, errorEl) {
    input.classList.remove('error', 'success');
    errorEl.classList.remove('show');
}

// ========== DASHBOARD ==========
async function updateDashboard() {
    const records = await getRecords();
    const latestWeight = records.length > 0 ? records[0].peso : CONFIG.pesoInicial;
    
    // Peso atual
    document.getElementById('current-weight').textContent = latestWeight.toFixed(1) + ' kg';
    
    // Total perdido
    const totalLost = CONFIG.pesoInicial - latestWeight;
    document.getElementById('total-lost').textContent = totalLost.toFixed(1) + ' kg';
    
    // Mudança de peso
    if (records.length > 1) {
        const change = records[1].peso - records[0].peso;
        const changeEl = document.getElementById('weight-change');
        if (change > 0) {
            changeEl.innerHTML = `<i class="fas fa-arrow-down"></i> ${change.toFixed(1)} kg`;
            changeEl.className = 'stat-change positive';
        } else if (change < 0) {
            changeEl.innerHTML = `<i class="fas fa-arrow-up"></i> ${Math.abs(change).toFixed(1)} kg`;
            changeEl.className = 'stat-change negative';
        }
    }
    
    // Peso restante
    const remaining = Math.max(0, latestWeight - CONFIG.metaPeso);
    document.getElementById('remaining-weight').innerHTML = `<i class="fas fa-flag"></i> Faltam ${remaining.toFixed(1)} kg`;
    
    // Total de registros
    document.getElementById('total-records').textContent = records.length;
    
    // Progresso
    const totalToLose = CONFIG.pesoInicial - CONFIG.metaPeso;
    const progress = totalToLose > 0 ? Math.min(100, Math.max(0, (totalLost / totalToLose) * 100)) : 0;
    
    document.getElementById('progress-percent').textContent = progress.toFixed(0) + '%';
    const circumference = 2 * Math.PI * 85;
    const offset = circumference - (progress / 100) * circumference;
    document.getElementById('progress-circle').style.strokeDashoffset = offset;
    
    // Streak
    updateStreak(records);
}

function updateStreak(records) {
    let streak = 0;
    const today = new Date().toLocaleDateString('pt-BR');
    
    if (records.length > 0) {
        let checkDate = new Date();
        for (let i = 0; i < records.length; i++) {
            const recordDate = records[i].data;
            const checkDateStr = checkDate.toLocaleDateString('pt-BR');
            
            if (recordDate === checkDateStr) {
                streak++;
                checkDate.setDate(checkDate.getDate() - 1);
            } else {
                break;
            }
        }
    }
    
    document.getElementById('streak-count').textContent = streak;
}

function updateGreeting() {
    const hour = new Date().getHours();
    let greeting = 'Boa noite';
    if (hour >= 5 && hour < 12) greeting = 'Bom dia';
    else if (hour >= 12 && hour < 18) greeting = 'Boa tarde';
    
    document.querySelector('.header-left h1').innerHTML = `${greeting}! 👋`;
}

function updateRegisterDate() {
    const today = new Date().toLocaleDateString('pt-BR', { 
        weekday: 'long', 
        day: 'numeric', 
        month: 'long' 
    });
    document.getElementById('register-date').textContent = today.charAt(0).toUpperCase() + today.slice(1);
}

// ========== METAS INTELIGENTES ==========
async function updateSmartGoals() {
    const records = await getRecords();
    const card = document.getElementById('smart-goal-card');
    const content = document.getElementById('smart-goal-content');
    
    if (records.length < 7) {
        card.style.display = 'none';
        return;
    }
    
    card.style.display = 'block';
    
    // Calcular meta semanal
    const weeklyGoal = (CONFIG.pesoInicial - CONFIG.metaPeso) / (CONFIG.prazoMeta ? 
        Math.ceil((new Date(CONFIG.prazoMeta) - new Date()) / (1000 * 60 * 60 * 24 * 7)) : 
        12); // Default: 12 semanas
    
    // Calcular progresso semanal atual
    const lastWeek = records.slice(0, 7);
    const weekBefore = records.slice(7, 14);
    
    let weeklyProgress = 0;
    if (weekBefore.length > 0) {
        const avgLastWeek = lastWeek.reduce((sum, r) => sum + r.peso, 0) / lastWeek.length;
        const avgWeekBefore = weekBefore.reduce((sum, r) => sum + r.peso, 0) / weekBefore.length;
        weeklyProgress = avgWeekBefore - avgLastWeek;
    }
    
    const progressPercent = Math.min(100, (weeklyProgress / weeklyGoal) * 100);
    const status = weeklyProgress >= weeklyGoal * 0.8 ? 'on-track' : 'warning';
    const statusText = weeklyProgress >= weeklyGoal * 0.8 ? 
        '✅ No caminho certo!' : 
        '⚠️ Atenção: abaixo da meta semanal';
    
    content.innerHTML = `
        <div style="margin-bottom: 15px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                <span style="color: var(--text-secondary);">Meta semanal: ${weeklyGoal.toFixed(2)}kg</span>
                <span style="color: var(--text-secondary);">Progresso: ${weeklyProgress.toFixed(2)}kg</span>
            </div>
            <div class="goal-progress-bar">
                <div class="goal-progress-fill" style="width: ${progressPercent}%"></div>
            </div>
        </div>
        <div class="goal-status ${status}">
            <i class="fas fa-${status === 'on-track' ? 'check-circle' : 'exclamation-triangle'}"></i>
            <span>${statusText}</span>
        </div>
        ${CONFIG.prazoMeta ? `
            <div style="margin-top: 15px; padding: 10px; background: var(--bg-secondary); border-radius: 8px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <span style="color: var(--text-secondary);">Prazo:</span>
                    <span style="font-weight: 600;">${new Date(CONFIG.prazoMeta).toLocaleDateString('pt-BR')}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span style="color: var(--text-secondary);">Dias restantes:</span>
                    <span style="font-weight: 600;">${Math.ceil((new Date(CONFIG.prazoMeta) - new Date()) / (1000 * 60 * 60 * 24))}</span>
                </div>
            </div>
        ` : ''}
    `;
}

// ========== INSIGHTS AUTOMÁTICOS ==========
async function updateInsights() {
    const records = await getRecords();
    const card = document.getElementById('insights-card');
    const content = document.getElementById('insights-content');
    
    if (records.length < 5) {
        card.style.display = 'none';
        return;
    }
    
    card.style.display = 'block';
    
    const insights = [];
    
    // Insight 1: Sono e perda de peso
    const recordsWithSleep = records.filter(r => r.sono);
    if (recordsWithSleep.length >= 5) {
        const avgSleep = recordsWithSleep.reduce((sum, r) => sum + parseFloat(r.sono), 0) / recordsWithSleep.length;
        const highSleepRecords = records.filter(r => r.sono && parseFloat(r.sono) >= 7);
        const lowSleepRecords = records.filter(r => r.sono && parseFloat(r.sono) < 7);
        
        if (highSleepRecords.length > 0 && lowSleepRecords.length > 0) {
            const highSleepWeightLoss = highSleepRecords[0].peso - highSleepRecords[highSleepRecords.length - 1].peso;
            const lowSleepWeightLoss = lowSleepRecords[0].peso - lowSleepRecords[lowSleepRecords.length - 1].peso;
            
            if (highSleepWeightLoss > lowSleepWeightLoss) {
                insights.push({
                    icon: 'fa-bed',
                    title: 'Sono e Perda de Peso',
                    text: `Você perde mais peso quando dorme ≥ 7h. Média atual: ${avgSleep.toFixed(1)}h`
                });
            }
        }
    }
    
    // Insight 2: Água e progresso
    const recordsWithWater = records.filter(r => r.agua);
    if (recordsWithWater.length >= 5) {
        const avgWater = recordsWithWater.reduce((sum, r) => sum + parseFloat(r.agua), 0) / recordsWithWater.length;
        const highWaterWeeks = [];
        const lowWaterWeeks = [];
        
        for (let i = 0; i < records.length - 7; i += 7) {
            const week = records.slice(i, i + 7);
            const weekWater = week.filter(r => r.agua).reduce((sum, r) => sum + parseFloat(r.agua), 0) / week.filter(r => r.agua).length;
            const weekWeightLoss = week[0].peso - week[week.length - 1].peso;
            
            if (weekWater >= avgWater) {
                highWaterWeeks.push(weekWeightLoss);
            } else {
                lowWaterWeeks.push(weekWeightLoss);
            }
        }
        
        if (highWaterWeeks.length > 0 && lowWaterWeeks.length > 0) {
            const highAvg = highWaterWeeks.reduce((a, b) => a + b, 0) / highWaterWeeks.length;
            const lowAvg = lowWaterWeeks.reduce((a, b) => a + b, 0) / lowWaterWeeks.length;
            
            if (highAvg > lowAvg) {
                insights.push({
                    icon: 'fa-tint',
                    title: 'Hidratação Importante',
                    text: `Semana com mais água = mais progresso. Média: ${avgWater.toFixed(1)}L`
                });
            }
        }
    }
    
    // Insight 3: Dia da semana
    const dayOfWeekStats = {};
    records.forEach(r => {
        const date = new Date(r.data.split('/').reverse().join('-'));
        const day = date.getDay();
        if (!dayOfWeekStats[day]) {
            dayOfWeekStats[day] = [];
        }
        dayOfWeekStats[day].push(r.peso);
    });
    
    const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const bestDay = Object.keys(dayOfWeekStats).reduce((a, b) => {
        const avgA = dayOfWeekStats[a].reduce((sum, p) => sum + p, 0) / dayOfWeekStats[a].length;
        const avgB = dayOfWeekStats[b].reduce((sum, p) => sum + p, 0) / dayOfWeekStats[b].length;
        return avgA < avgB ? a : b;
    });
    
    if (dayOfWeekStats[bestDay].length >= 3) {
        insights.push({
            icon: 'fa-calendar-week',
            title: 'Melhor Dia da Semana',
            text: `Você costuma perder mais peso de ${dayNames[bestDay]}`
        });
    }
    
    if (insights.length === 0) {
        insights.push({
            icon: 'fa-chart-line',
            title: 'Continue Registrando',
            text: 'Com mais dados, geraremos insights personalizados para você!'
        });
    }
    
    content.innerHTML = insights.map(insight => `
        <div class="insight-item">
            <div class="insight-icon">
                <i class="fas ${insight.icon}"></i>
            </div>
            <div class="insight-content">
                <div class="insight-title">${insight.title}</div>
                <div class="insight-text">${insight.text}</div>
            </div>
        </div>
    `).join('');
}

// ========== COMPARAÇÃO VISUAL ==========
async function updateComparison() {
    const records = await getRecords();
    const container = document.getElementById('comparison-container');
    
    const recordsWithPhotos = records.filter(r => r.fotoFrente || r.fotoLado);
    
    if (recordsWithPhotos.length < 2) {
        container.style.display = 'none';
        return;
    }
    
    container.style.display = 'block';
    
    const firstRecord = recordsWithPhotos[recordsWithPhotos.length - 1];
    const lastRecord = recordsWithPhotos[0];
    
    const beforePhoto = firstRecord.fotoFrente || firstRecord.fotoLado;
    const afterPhoto = lastRecord.fotoFrente || lastRecord.fotoLado;
    
    if (beforePhoto && afterPhoto) {
        const beforeUrl = typeof beforePhoto === 'number' ? await getPhotoFromDB(beforePhoto) : beforePhoto;
        const afterUrl = typeof afterPhoto === 'number' ? await getPhotoFromDB(afterPhoto) : afterPhoto;
        
        document.getElementById('comparison-before').src = beforeUrl;
        document.getElementById('comparison-after').src = afterUrl;
    }
}

function initComparisonSlider() {
    const slider = document.getElementById('comparison-slider');
    const handle = document.getElementById('comparison-handle');
    const before = document.getElementById('comparison-before');
    let isDragging = false;
    
    handle.addEventListener('mousedown', (e) => {
        isDragging = true;
        e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        const rect = slider.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
        
        handle.style.left = percent + '%';
        before.style.clipPath = `inset(0 ${100 - percent}% 0 0)`;
    });
    
    document.addEventListener('mouseup', () => {
        isDragging = false;
    });
    
    // Touch events
    handle.addEventListener('touchstart', (e) => {
        isDragging = true;
        e.preventDefault();
    });
    
    document.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        
        const rect = slider.getBoundingClientRect();
        const x = e.touches[0].clientX - rect.left;
        const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
        
        handle.style.left = percent + '%';
        before.style.clipPath = `inset(0 ${100 - percent}% 0 0)`;
    });
    
    document.addEventListener('touchend', () => {
        isDragging = false;
    });
}

// ========== GRÁFICO ==========
function drawChart() {
    const canvas = document.getElementById('weightChart');
    const ctx = canvas.getContext('2d');
    
    getRecords().then(records => {
        const filteredRecords = records.slice(0, chartPeriod).reverse();
        
        canvas.width = canvas.offsetWidth * 2;
        canvas.height = canvas.offsetHeight * 2;
        ctx.scale(2, 2);
        
        const width = canvas.offsetWidth;
        const height = canvas.offsetHeight;
        
        ctx.clearRect(0, 0, width, height);
        
        if (filteredRecords.length === 0) {
            ctx.fillStyle = '#6c6c8a';
            ctx.font = '16px Segoe UI';
            ctx.textAlign = 'center';
            ctx.fillText('Sem dados para exibir', width / 2, height / 2);
            return;
        }
        
        const padding = { top: 30, right: 20, bottom: 40, left: 50 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;
        
        const weights = filteredRecords.map(r => r.peso);
        const minWeight = Math.min(...weights, CONFIG.metaPeso) - 2;
        const maxWeight = Math.max(...weights, CONFIG.pesoInicial) + 2;
        
        // Grid lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = padding.top + (i / 4) * chartHeight;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(width - padding.right, y);
            ctx.stroke();
            
            const value = maxWeight - (i / 4) * (maxWeight - minWeight);
            ctx.fillStyle = '#6c6c8a';
            ctx.font = '11px Segoe UI';
            ctx.textAlign = 'right';
            ctx.fillText(value.toFixed(1), padding.left - 10, y + 4);
        }
        
        // Meta line
        const metaY = padding.top + ((maxWeight - CONFIG.metaPeso) / (maxWeight - minWeight)) * chartHeight;
        ctx.strokeStyle = '#00d9a5';
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(padding.left, metaY);
        ctx.lineTo(width - padding.right, metaY);
        ctx.stroke();
        ctx.setLineDash([]);
        
        ctx.fillStyle = '#00d9a5';
        ctx.font = '11px Segoe UI';
        ctx.textAlign = 'left';
        ctx.fillText('Meta: ' + CONFIG.metaPeso + 'kg', width - padding.right - 80, metaY - 8);
        
        // Area fill
        if (filteredRecords.length > 1) {
            const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
            gradient.addColorStop(0, 'rgba(233, 69, 96, 0.3)');
            gradient.addColorStop(1, 'rgba(233, 69, 96, 0)');
            
            ctx.fillStyle = gradient;
            ctx.beginPath();
            
            filteredRecords.forEach((r, i) => {
                const x = padding.left + (i / (filteredRecords.length - 1)) * chartWidth;
                const y = padding.top + ((maxWeight - r.peso) / (maxWeight - minWeight)) * chartHeight;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            
            ctx.lineTo(padding.left + chartWidth, height - padding.bottom);
            ctx.lineTo(padding.left, height - padding.bottom);
            ctx.closePath();
            ctx.fill();
            
            // Line
            ctx.strokeStyle = '#e94560';
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            
            filteredRecords.forEach((r, i) => {
                const x = padding.left + (i / (filteredRecords.length - 1)) * chartWidth;
                const y = padding.top + ((maxWeight - r.peso) / (maxWeight - minWeight)) * chartHeight;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();
            
            // Points
            filteredRecords.forEach((r, i) => {
                const x = padding.left + (i / (filteredRecords.length - 1)) * chartWidth;
                const y = padding.top + ((maxWeight - r.peso) / (maxWeight - minWeight)) * chartHeight;
                
                ctx.fillStyle = '#e94560';
                ctx.beginPath();
                ctx.arc(x, y, 5, 0, Math.PI * 2);
                ctx.fill();
                
                ctx.fillStyle = '#0f0f23';
                ctx.beginPath();
                ctx.arc(x, y, 2, 0, Math.PI * 2);
                ctx.fill();
            });
        }
    });
}

function setChartPeriod(days) {
    chartPeriod = days;
    drawChart();
    vibrate(30);
}

// ========== CALENDÁRIO ==========
async function renderCalendar() {
    const grid = document.getElementById('calendar-days');
    const label = document.getElementById('calendar-month-year');
    const records = await getRecords();
    
    grid.innerHTML = '';
    
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    
    const monthName = currentCalendarDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    label.textContent = monthName.charAt(0).toUpperCase() + monthName.slice(1);
    
    const firstDay = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    
    for (let i = 0; i < firstDay; i++) {
        grid.appendChild(document.createElement('div'));
    }
    
    for (let day = 1; day <= totalDays; day++) {
        const cell = document.createElement('div');
        cell.className = 'day';
        cell.textContent = day;
        
        const cellDate = new Date(year, month, day);
        const dateStr = cellDate.toLocaleDateString('pt-BR');
        
        if (day === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
            cell.classList.add('today');
        }
        
        if (cellDate.toDateString() === selectedDate.toDateString()) {
            cell.classList.add('selected');
        }
        
        if (records.find(r => r.data === dateStr)) {
            cell.classList.add('has-record');
        }
        
        // Verificar se tem treino neste dia
        const checkins = getWorkoutCheckins();
        if (checkins.find(c => c.data === dateStr)) {
            cell.style.position = 'relative';
            if (!cell.querySelector('.workout-indicator')) {
                const indicator = document.createElement('div');
                indicator.className = 'workout-indicator';
                indicator.style.cssText = 'position: absolute; top: 4px; right: 4px; width: 8px; height: 8px; background: var(--accent-primary); border-radius: 50%;';
                cell.appendChild(indicator);
            }
        }
        
        cell.addEventListener('click', () => {
            selectedDate = new Date(year, month, day);
            renderCalendar();
            showDayDetails(selectedDate);
        });
        
        grid.appendChild(cell);
    }
}

function changeMonth(delta) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + delta);
    renderCalendar();
    vibrate(30);
}

async function showDayDetails(date) {
    const container = document.getElementById('day-details');
    const dateStr = date.toLocaleDateString('pt-BR');
    const records = await getRecords();
    const record = records.find(r => r.data === dateStr);
    
    if (record) {
        let photosHtml = '';
        if (record.fotoFrente || record.fotoLado) {
            photosHtml = `<div class="photo-gallery">`;
            
            if (record.fotoFrente) {
                const photoUrl = typeof record.fotoFrente === 'number' ? 
                    await getPhotoFromDB(record.fotoFrente) : record.fotoFrente;
                photosHtml += `<div class="gallery-photo" data-photo-url="${photoUrl}"><img src="${photoUrl}"></div>`;
            }
            if (record.fotoLado) {
                const photoUrl = typeof record.fotoLado === 'number' ? 
                    await getPhotoFromDB(record.fotoLado) : record.fotoLado;
                photosHtml += `<div class="gallery-photo" data-photo-url="${photoUrl}"><img src="${photoUrl}"></div>`;
            }
            photosHtml += `</div>`;
        }
        
        container.innerHTML = `
            <div class="detail-row">
                <span class="detail-label"><i class="fas fa-calendar"></i> Data</span>
                <span class="detail-value">${dateStr}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label"><i class="fas fa-weight"></i> Peso</span>
                <span class="detail-value">${record.peso} kg</span>
            </div>
            ${record.cintura ? `<div class="detail-row"><span class="detail-label"><i class="fas fa-ruler"></i> Cintura</span><span class="detail-value">${record.cintura} cm</span></div>` : ''}
            ${record.agua ? `<div class="detail-row"><span class="detail-label"><i class="fas fa-tint"></i> Água</span><span class="detail-value">${record.agua} L</span></div>` : ''}
            ${record.sono ? `<div class="detail-row"><span class="detail-label"><i class="fas fa-bed"></i> Sono</span><span class="detail-value">${record.sono}h</span></div>` : ''}
            ${record.notas ? `<div class="detail-row"><span class="detail-label"><i class="fas fa-sticky-note"></i> Notas</span><span class="detail-value" style="font-size: 0.9rem;">${record.notas}</span></div>` : ''}
            ${photosHtml}
            <div style="margin-top: 20px; text-align: center;">
                <button class="btn btn-primary" data-action="edit-record" data-record-date="${dateStr}">
                    <i class="fas fa-edit"></i>
                    Editar Registro
                </button>
            </div>
        `;
        
        // Adicionar listeners para fotos
        container.querySelectorAll('.gallery-photo').forEach(photo => {
            photo.addEventListener('click', () => {
                openPhotoModal(photo.dataset.photoUrl);
            });
        });
        
        // Adicionar listener para editar
        container.querySelector('[data-action="edit-record"]')?.addEventListener('click', () => {
            editRecordForDate(dateStr);
        });
    } else {
        container.innerHTML = `
            <p style="text-align: center; color: var(--text-muted); margin-bottom: 20px;">
                Nenhum registro para ${dateStr}
            </p>
            <div style="text-align: center;">
                <button class="btn btn-primary" data-action="add-record" data-record-date="${dateStr}">
                    <i class="fas fa-plus"></i>
                    Adicionar Registro para esta Data
                </button>
            </div>
        `;
        
        container.querySelector('[data-action="add-record"]')?.addEventListener('click', () => {
            addRecordForDate(dateStr);
        });
    }
}

// ========== REGISTRO ==========
async function saveRecord() {
    const btn = document.getElementById('btn-save-record');
    
    // Validações
    if (!validatePeso()) {
        return;
    }
    validateSono();
    validateAgua();
    
    const peso = parseFloat(document.getElementById('input-peso').value);
    const cintura = document.getElementById('input-cintura').value;
    const agua = document.getElementById('input-agua').value;
    const sono = document.getElementById('input-sono').value;
    const notas = document.getElementById('input-notas').value;
    
    const fileFrente = document.getElementById('photo-frente').files[0];
    const fileLado = document.getElementById('photo-lado').files[0];
    
    btn.classList.add('loading');
    
    // Obter data do registro (pode ser editado)
    const recordDate = document.getElementById('input-record-date')?.value || new Date().toLocaleDateString('pt-BR');
    
    let fotoFrente = null, fotoLado = null;
    
    // Salvar fotos no IndexedDB
    if (fileFrente) {
        const blob = await compressImage(fileFrente);
        fotoFrente = await savePhotoToDB(blob, 'frente');
    }
    if (fileLado) {
        const blob = await compressImage(fileLado);
        fotoLado = await savePhotoToDB(blob, 'lado');
    }
    
    const record = {
        data: recordDate,
        peso,
        cintura: cintura || null,
        agua: agua || null,
        sono: sono || null,
        notas: notas || null,
        fotoFrente,
        fotoLado,
        timestamp: Date.now()
    };
    
    // Salvar no IndexedDB
    const transaction = db.transaction([RECORDS_STORE], 'readwrite');
    const store = transaction.objectStore(RECORDS_STORE);
    
    // Verificar se já existe registro para esta data
    const allRecords = await getRecords();
    const existingRecord = allRecords.find(r => r.data === record.data);
    
    if (existingRecord) {
        // Manter fotos existentes se não foram alteradas
        if (!fileFrente && existingRecord.fotoFrente) {
            record.fotoFrente = existingRecord.fotoFrente;
        }
        if (!fileLado && existingRecord.fotoLado) {
            record.fotoLado = existingRecord.fotoLado;
        }
        record.id = existingRecord.id;
        await store.put(record);
    } else {
        await store.add(record);
    }
    
    btn.classList.remove('loading');
    document.getElementById('success-modal').classList.add('active');
    
    // Atualizar texto do botão de volta ao normal
    const saveBtn = document.getElementById('btn-save-record');
    saveBtn.innerHTML = '<i class="fas fa-save"></i> Salvar Registro';
    
    clearForm();
    updateDashboard();
    renderCalendar();
    updateHistory();
    updateSmartGoals();
    updateInsights();
    updateComparison();
    
    // Se estava editando uma data específica, voltar para dashboard
    if (recordDate !== new Date().toLocaleDateString('pt-BR')) {
        setTimeout(() => {
            showSection('dashboard');
        }, 1500);
    }
    
    vibrate(200);
}

function compressImage(file) {
    return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = e => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const maxWidth = 800;
                const scale = Math.min(1, maxWidth / img.width);
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                canvas.toBlob(resolve, 'image/jpeg', 0.7);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

function previewPhoto(input, previewId) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = e => {
            const img = document.getElementById(previewId);
            img.src = e.target.result;
            input.closest('.photo-upload-box').classList.add('has-photo');
        };
        reader.readAsDataURL(input.files[0]);
    }
}

function clearForm() {
    document.getElementById('input-peso').value = '';
    document.getElementById('input-cintura').value = '';
    document.getElementById('input-agua').value = '';
    document.getElementById('input-sono').value = '';
    document.getElementById('input-notas').value = '';
    document.getElementById('photo-frente').value = '';
    document.getElementById('photo-lado').value = '';
    
    // Remover campo de data se existir
    const dateInput = document.getElementById('input-record-date');
    if (dateInput) {
        dateInput.remove();
    }
    
    document.querySelectorAll('.photo-upload-box').forEach(box => {
        box.classList.remove('has-photo');
        const img = box.querySelector('img');
        if (img) img.src = '';
    });
    document.querySelectorAll('.form-input').forEach(input => {
        input.classList.remove('error', 'success');
    });
    document.querySelectorAll('.form-error').forEach(error => {
        error.classList.remove('show');
    });
}

// ========== EDITAR/ADICIONAR REGISTRO PARA DATA ESPECÍFICA ==========
async function editRecordForDate(dateStr) {
    const records = await getRecords();
    const record = records.find(r => r.data === dateStr);
    
    if (record) {
        // Preencher formulário com dados existentes
        document.getElementById('input-peso').value = record.peso;
        document.getElementById('input-cintura').value = record.cintura || '';
        document.getElementById('input-agua').value = record.agua || '';
        document.getElementById('input-sono').value = record.sono || '';
        document.getElementById('input-notas').value = record.notas || '';
        
        // Carregar fotos existentes
        if (record.fotoFrente) {
            const photoUrl = typeof record.fotoFrente === 'number' ? 
                await getPhotoFromDB(record.fotoFrente) : record.fotoFrente;
            if (photoUrl) {
                const img = document.getElementById('preview-frente');
                img.src = photoUrl;
                document.querySelector('[data-photo-type="frente"]').classList.add('has-photo');
            }
        }
        
        if (record.fotoLado) {
            const photoUrl = typeof record.fotoLado === 'number' ? 
                await getPhotoFromDB(record.fotoLado) : record.fotoLado;
            if (photoUrl) {
                const img = document.getElementById('preview-lado');
                img.src = photoUrl;
                document.querySelector('[data-photo-type="lado"]').classList.add('has-photo');
            }
        }
        
        // Adicionar campo hidden com a data
        let dateInput = document.getElementById('input-record-date');
        if (!dateInput) {
            dateInput = document.createElement('input');
            dateInput.type = 'hidden';
            dateInput.id = 'input-record-date';
            document.getElementById('btn-save-record').parentElement.insertBefore(dateInput, document.getElementById('btn-save-record'));
        }
        dateInput.value = dateStr;
        
        // Ir para seção de registro
        showSection('registro');
        
        // Atualizar texto do botão
        const saveBtn = document.getElementById('btn-save-record');
        saveBtn.innerHTML = '<i class="fas fa-save"></i> Salvar Alterações';
        
        // Scroll para o topo
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        vibrate(50);
    }
}

async function addRecordForDate(dateStr) {
    // Limpar formulário
    clearForm();
    
    // Adicionar campo hidden com a data
    let dateInput = document.getElementById('input-record-date');
    if (!dateInput) {
        dateInput = document.createElement('input');
        dateInput.type = 'hidden';
        dateInput.id = 'input-record-date';
        document.getElementById('btn-save-record').parentElement.insertBefore(dateInput, document.getElementById('btn-save-record'));
    }
    dateInput.value = dateStr;
    
    // Atualizar data exibida
    const dateDisplay = document.getElementById('register-date');
    if (dateDisplay) {
        const date = new Date(dateStr.split('/').reverse().join('-'));
        const formatted = date.toLocaleDateString('pt-BR', { 
            weekday: 'long', 
            day: 'numeric', 
            month: 'long' 
        });
        dateDisplay.textContent = formatted.charAt(0).toUpperCase() + formatted.slice(1);
    }
    
    // Ir para seção de registro
    showSection('registro');
    
    // Atualizar texto do botão
    const saveBtn = document.getElementById('btn-save-record');
    saveBtn.innerHTML = '<i class="fas fa-save"></i> Salvar Registro';
    
    // Scroll para o topo
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    vibrate(50);
}

// ========== HISTÓRICO ==========
async function updateHistory() {
    const container = document.getElementById('history-list');
    const records = await getRecords();
    
    if (records.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📊</div>
                <h3>Nenhum registro ainda</h3>
                <p>Comece hoje. Seu primeiro registro leva menos de 1 minuto.</p>
                <button class="btn btn-primary" data-section="registro">
                    <i class="fas fa-plus"></i>
                    Criar Primeiro Registro
                </button>
            </div>
        `;
        
        // Adicionar listener ao botão
        container.querySelector('button')?.addEventListener('click', () => {
            showSection('registro');
        });
        return;
    }
    
    container.innerHTML = records.map((r, i) => {
        const dateParts = r.data.split('/');
        const change = i < records.length - 1 ? (records[i + 1].peso - r.peso).toFixed(1) : 0;
        const changeClass = change > 0 ? 'down' : 'up';
        
        return `
            <div class="history-item">
                <div class="history-date">
                    <div class="history-day">${dateParts[0]}</div>
                    <div class="history-month">${getMonthAbbr(parseInt(dateParts[1]) - 1)}</div>
                </div>
                <div class="history-info">
                    <div class="history-weight">${r.peso} kg</div>
                    <div class="history-meta">
                        ${r.cintura ? 'Cintura: ' + r.cintura + 'cm' : ''} 
                        ${r.agua ? '• Água: ' + r.agua + 'L' : ''}
                    </div>
                </div>
                ${change != 0 ? `<div class="history-change ${changeClass}">${change > 0 ? '↓' : '↑'} ${Math.abs(change)} kg</div>` : ''}
            </div>
        `;
    }).join('');
}

function getMonthAbbr(month) {
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return months[month];
}

// ========== CONFIGURAÇÕES ==========
function editSetting(type) {
    let value;
    if (type === 'nome') {
        value = prompt('Digite seu nome:', CONFIG.nome);
        if (value) CONFIG.nome = value;
    } else if (type === 'meta') {
        value = prompt('Digite sua meta de peso (kg):', CONFIG.metaPeso);
        if (value && !isNaN(parseFloat(value))) CONFIG.metaPeso = parseFloat(value);
    } else if (type === 'inicial') {
        value = prompt('Digite seu peso inicial (kg):', CONFIG.pesoInicial);
        if (value && !isNaN(parseFloat(value))) CONFIG.pesoInicial = parseFloat(value);
    } else if (type === 'prazo') {
        value = prompt('Digite o prazo da meta (formato: DD/MM/AAAA):', 
            CONFIG.prazoMeta ? new Date(CONFIG.prazoMeta).toLocaleDateString('pt-BR') : '');
        if (value) {
            const [day, month, year] = value.split('/');
            CONFIG.prazoMeta = new Date(year, month - 1, day).toISOString();
        }
    }
    saveConfig();
    updateSmartGoals();
    vibrate(50);
}

async function toggleReminder() {
    const toggle = document.getElementById('toggle-reminder');
    CONFIG.reminderEnabled = !CONFIG.reminderEnabled;
    
    if (CONFIG.reminderEnabled) {
        toggle.classList.add('active');
        document.getElementById('notification-time-setting').style.display = 'flex';
        
        if ('Notification' in window && Notification.permission === 'default') {
            await Notification.requestPermission();
        }
        
        if (Notification.permission === 'granted') {
            scheduleReminder();
        }
    } else {
        toggle.classList.remove('active');
        document.getElementById('notification-time-setting').style.display = 'none';
    }
    
    saveConfig();
    vibrate(50);
}

function scheduleReminder() {
    if (!CONFIG.reminderEnabled) return;
    
    const [hours, minutes] = CONFIG.reminderTime.split(':');
    const now = new Date();
    const reminderTime = new Date();
    reminderTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    
    if (reminderTime <= now) {
        reminderTime.setDate(reminderTime.getDate() + 1);
    }
    
    const timeout = reminderTime.getTime() - now.getTime();
    
    setTimeout(() => {
        if (CONFIG.reminderEnabled) {
            checkIfRecordedToday();
            scheduleReminder(); // Agendar próximo dia
        }
    }, timeout);
}

async function checkIfRecordedToday() {
    const records = await getRecords();
    const today = new Date().toLocaleDateString('pt-BR');
    const hasRecordToday = records.some(r => r.data === today);
    
    if (!hasRecordToday && 'Notification' in window && Notification.permission === 'granted') {
        new Notification('FitTrack Pro', {
            body: 'Você esqueceu de registrar hoje! Não deixe seu progresso passar.',
            icon: '/icon-192.png',
            badge: '/icon-192.png'
        });
    }
}

function checkNotifications() {
    if ('Notification' in window && Notification.permission === 'default') {
        // Não solicitar automaticamente, apenas quando o usuário ativar
    }
    
    if (CONFIG.reminderEnabled) {
        scheduleReminder();
    }
}

function exportData() {
    getRecords().then(records => {
        const data = JSON.stringify({ 
            config: CONFIG, 
            records: records.map(r => ({
                ...r,
                fotoFrente: null, // Não exportar fotos (são muito grandes)
                fotoLado: null,
            }))
        }, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'fittrack-backup-' + new Date().toISOString().split('T')[0] + '.json';
        a.click();
        vibrate(50);
    });
}

async function clearAllData() {
    if (confirm('Tem certeza que deseja apagar TODOS os dados? Esta ação não pode ser desfeita.')) {
        const transaction = db.transaction([RECORDS_STORE, PHOTOS_STORE], 'readwrite');
        await Promise.all([
            new Promise(resolve => {
                transaction.objectStore(RECORDS_STORE).clear().onsuccess = resolve;
            }),
            new Promise(resolve => {
                transaction.objectStore(PHOTOS_STORE).clear().onsuccess = resolve;
            })
        ]);
        
        localStorage.removeItem('fittrack_config');
        localStorage.removeItem('fittrack_schema_version');
        location.reload();
    }
}

// ========== UTILITÁRIOS ==========
async function getRecords() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([RECORDS_STORE], 'readonly');
        const store = transaction.objectStore(RECORDS_STORE);
        const request = store.getAll();
        
        request.onsuccess = () => {
            const records = request.result;
            records.sort((a, b) => b.timestamp - a.timestamp);
            resolve(records);
        };
        
        request.onerror = () => reject(request.error);
    });
}

function closeModal() {
    document.getElementById('success-modal').classList.remove('active');
}

function openPhotoModal(src) {
    document.getElementById('modal-photo-img').src = src;
    document.getElementById('photo-modal').classList.add('active');
}

function closePhotoModal() {
    document.getElementById('photo-modal').classList.remove('active');
}

function vibrate(duration = 50) {
    if ('vibrate' in navigator) {
        navigator.vibrate(duration);
    }
}

// ========== TREINOS ==========
let currentWorkout = null;
let currentWorkoutExecution = null;
let restTimerInterval = null;

function initWorkouts() {
    updateWorkoutToday();
    updateWorkoutList();
    updateWorkoutStats();
    updateWorkoutHistory();
    setupWorkoutEventListeners();
    checkWorkoutReminders();
}

function setupWorkoutEventListeners() {
    // Criar treino
    document.querySelectorAll('[data-action="create-workout"]').forEach(btn => {
        btn.addEventListener('click', () => openWorkoutEditor());
    });
    
    // Fechar editor
    document.querySelectorAll('[data-action="close-workout-editor"]').forEach(btn => {
        btn.addEventListener('click', () => closeWorkoutEditor());
    });
    
    // Adicionar exercício
    document.querySelectorAll('[data-action="add-exercise"]').forEach(btn => {
        btn.addEventListener('click', () => addExerciseToEditor());
    });
    
    // Salvar treino
    const form = document.getElementById('workout-editor-form');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            saveWorkout();
        });
    }
    
    // Iniciar treino
    const startBtn = document.getElementById('btn-start-workout');
    if (startBtn) {
        startBtn.addEventListener('click', () => startWorkout());
    }
    
    // Cancelar treino
    document.querySelectorAll('[data-action="cancel-workout"]').forEach(btn => {
        btn.addEventListener('click', () => cancelWorkout());
    });
    
    // Finalizar treino
    const finishBtn = document.getElementById('btn-finish-workout');
    if (finishBtn) {
        finishBtn.addEventListener('click', () => finishWorkout());
    }
}

// ========== GERENCIAMENTO DE TREINOS ==========
function getWorkouts() {
    const saved = localStorage.getItem('fittrack_treinos');
    return saved ? JSON.parse(saved) : [];
}

function saveWorkouts(workouts) {
    localStorage.setItem('fittrack_treinos', JSON.stringify(workouts));
}

function getWorkoutCheckins() {
    const saved = localStorage.getItem('fittrack_treino_checkins');
    return saved ? JSON.parse(saved) : [];
}

function saveWorkoutCheckins(checkins) {
    localStorage.setItem('fittrack_treino_checkins', JSON.stringify(checkins));
}

function generateWorkoutId() {
    return 'treino-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

function generateExerciseId() {
    return 'ex-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

// ========== TREINO DO DIA ==========
function updateWorkoutToday() {
    const workouts = getWorkouts();
    const today = new Date();
    const dayName = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][today.getDay()];
    
    const todayWorkout = workouts.find(w => 
        w.ativo && w.diasSemana.includes(dayName)
    );
    
    const container = document.getElementById('workout-today-container');
    const executionContainer = document.getElementById('workout-execution-container');
    
    if (todayWorkout && !currentWorkoutExecution) {
        container.style.display = 'block';
        executionContainer.style.display = 'none';
        
        document.getElementById('workout-today-title').textContent = todayWorkout.nome;
        if (todayWorkout.descricao) {
            document.getElementById('workout-today-title').textContent += ' - ' + todayWorkout.descricao;
        }
        
        const estimatedTime = todayWorkout.exercicios.length * 5; // 5 min por exercício
        document.getElementById('workout-today-time').textContent = estimatedTime + ' min';
        document.getElementById('workout-today-exercises-count').textContent = todayWorkout.exercicios.length + ' exercícios';
        
        const exercisesList = document.getElementById('workout-today-exercises');
        exercisesList.innerHTML = todayWorkout.exercicios.map(ex => `
            <div class="workout-exercise-item">
                <div class="workout-exercise-image">
                    ${ex.imagem ? `<img src="${ex.imagem}" alt="${ex.nome}">` : `<i class="fas fa-dumbbell"></i>`}
                </div>
                <div class="workout-exercise-info">
                    <div class="workout-exercise-name">${ex.nome}</div>
                    <div class="workout-exercise-details">
                        <span><i class="fas fa-layer-group"></i> ${ex.series} séries</span>
                        <span><i class="fas fa-redo"></i> ${ex.repeticoes} reps</span>
                        ${ex.carga ? `<span><i class="fas fa-weight"></i> ${ex.carga}</span>` : ''}
                        ${ex.descanso ? `<span><i class="fas fa-clock"></i> ${ex.descanso}s</span>` : ''}
                    </div>
                </div>
            </div>
        `).join('');
        
        currentWorkout = todayWorkout;
    } else {
        container.style.display = 'none';
    }
}

// ========== EXECUÇÃO DO TREINO ==========
function startWorkout() {
    if (!currentWorkout) return;
    
    document.getElementById('workout-today-container').style.display = 'none';
    document.getElementById('workout-execution-container').style.display = 'block';
    
    currentWorkoutExecution = {
        workoutId: currentWorkout.id,
        startTime: Date.now(),
        exercises: currentWorkout.exercicios.map(ex => ({
            ...ex,
            completed: false,
            sets: Array(parseInt(ex.series)).fill(false)
        }))
    };
    
    renderWorkoutExecution();
    vibrate(100);
}

function renderWorkoutExecution() {
    if (!currentWorkoutExecution) return;
    
    const container = document.getElementById('workout-execution-exercises');
    const title = document.getElementById('workout-execution-title');
    const progress = document.getElementById('workout-execution-progress');
    
    title.textContent = currentWorkout.nome;
    
    const completed = currentWorkoutExecution.exercises.filter(e => e.completed).length;
    progress.textContent = `${completed} de ${currentWorkoutExecution.exercises.length} exercícios`;
    
    container.innerHTML = currentWorkoutExecution.exercises.map((ex, exIndex) => {
        const isActive = !ex.completed && currentWorkoutExecution.exercises.slice(0, exIndex).every(e => e.completed);
        const isCompleted = ex.completed;
        
        return `
            <div class="workout-execution-exercise ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}">
                <div class="workout-execution-exercise-header">
                    <div class="workout-execution-exercise-image">
                        ${ex.imagem ? `<img src="${ex.imagem}" alt="${ex.nome}">` : `<i class="fas fa-dumbbell"></i>`}
                    </div>
                    <div class="workout-execution-exercise-info">
                        <div class="workout-execution-exercise-name">${ex.nome}</div>
                        <div class="workout-execution-exercise-meta">
                            <span><i class="fas fa-redo"></i> ${ex.repeticoes} reps</span>
                            ${ex.carga ? `<span><i class="fas fa-weight"></i> ${ex.carga}</span>` : ''}
                            ${ex.descanso ? `<span><i class="fas fa-clock"></i> ${ex.descanso}s descanso</span>` : ''}
                        </div>
                    </div>
                </div>
                <div class="workout-execution-sets">
                    ${ex.sets.map((set, setIndex) => `
                        <div class="workout-set-item ${set ? 'completed' : ''}">
                            <div class="workout-set-number">${setIndex + 1}</div>
                            <div class="workout-set-details">
                                <span>${ex.repeticoes} reps</span>
                                ${ex.carga ? `<span>${ex.carga}</span>` : ''}
                            </div>
                            <div class="workout-set-checkbox ${set ? 'checked' : ''}" 
                                 data-exercise="${exIndex}" 
                                 data-set="${setIndex}"></div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');
    
    // Adicionar listeners aos checkboxes
    container.querySelectorAll('.workout-set-checkbox').forEach(checkbox => {
        checkbox.addEventListener('click', function() {
            const exIndex = parseInt(this.dataset.exercise);
            const setIndex = parseInt(this.dataset.set);
            toggleSet(exIndex, setIndex);
        });
    });
    
    // Verificar se todos os exercícios foram completados
    const allCompleted = currentWorkoutExecution.exercises.every(ex => ex.completed);
    document.getElementById('btn-finish-workout').style.display = allCompleted ? 'block' : 'none';
}

function toggleSet(exIndex, setIndex) {
    if (!currentWorkoutExecution) return;
    
    const exercise = currentWorkoutExecution.exercises[exIndex];
    exercise.sets[setIndex] = !exercise.sets[setIndex];
    
    // Verificar se todas as séries foram completadas
    exercise.completed = exercise.sets.every(s => s);
    
    renderWorkoutExecution();
    
    // Se completou uma série e há descanso, iniciar timer
    if (exercise.sets[setIndex] && exercise.descanso && setIndex < exercise.sets.length - 1) {
        startRestTimer(exercise.descanso);
    }
    
    vibrate(30);
}

function startRestTimer(seconds) {
    const timerEl = document.getElementById('workout-rest-timer');
    const timerValue = document.getElementById('rest-timer-value');
    
    timerEl.classList.remove('hidden');
    let remaining = seconds;
    
    if (restTimerInterval) {
        clearInterval(restTimerInterval);
    }
    
    restTimerInterval = setInterval(() => {
        const mins = Math.floor(remaining / 60);
        const secs = remaining % 60;
        timerValue.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        
        if (remaining <= 0) {
            clearInterval(restTimerInterval);
            timerEl.classList.add('hidden');
            vibrate(200);
        }
        
        remaining--;
    }, 1000);
}

function cancelWorkout() {
    if (confirm('Tem certeza que deseja cancelar o treino?')) {
        currentWorkoutExecution = null;
        if (restTimerInterval) {
            clearInterval(restTimerInterval);
        }
        updateWorkoutToday();
        vibrate(50);
    }
}

async function finishWorkout() {
    if (!currentWorkoutExecution) return;
    
    const duration = Math.floor((Date.now() - currentWorkoutExecution.startTime) / 1000 / 60);
    const today = new Date().toLocaleDateString('pt-BR');
    
    const checkin = {
        data: today,
        treinoId: currentWorkoutExecution.workoutId,
        concluido: true,
        duracao: duration,
        observacao: null,
        timestamp: Date.now()
    };
    
    const checkins = getWorkoutCheckins();
    // Remover check-in do dia se existir
    const filtered = checkins.filter(c => c.data !== today || c.treinoId !== checkin.treinoId);
    filtered.push(checkin);
    saveWorkoutCheckins(filtered);
    
    currentWorkoutExecution = null;
    if (restTimerInterval) {
        clearInterval(restTimerInterval);
    }
    
    // Mostrar modal de sucesso
    document.getElementById('success-modal').classList.add('active');
    const modalText = document.querySelector('#success-modal .modal p');
    modalText.textContent = `Treino concluído em ${duration} minutos! 💪 Continue assim!`;
    
    updateWorkoutToday();
    updateWorkoutStats();
    updateWorkoutHistory();
    renderCalendar(); // Atualizar calendário para mostrar treino
    vibrate(200);
}

// ========== EDITOR DE TREINO ==========
let editingWorkoutId = null;

function openWorkoutEditor(workoutId = null) {
    editingWorkoutId = workoutId;
    const modal = document.getElementById('workout-editor-modal');
    const title = document.getElementById('workout-editor-title');
    const form = document.getElementById('workout-editor-form');
    
    title.textContent = workoutId ? 'Editar Treino' : 'Novo Treino';
    form.reset();
    
    // Limpar exercícios
    document.getElementById('workout-exercises-editor').innerHTML = '';
    
    if (workoutId) {
        const workouts = getWorkouts();
        const workout = workouts.find(w => w.id === workoutId);
        
        if (workout) {
            document.getElementById('workout-editor-nome').value = workout.nome;
            document.getElementById('workout-editor-descricao').value = workout.descricao || '';
            
            // Marcar dias da semana
            workout.diasSemana.forEach(day => {
                const checkbox = document.querySelector(`#day-${day.toLowerCase()}`);
                if (checkbox) checkbox.checked = true;
            });
            
            // Adicionar exercícios
            workout.exercicios.forEach(ex => {
                addExerciseToEditor(ex);
            });
        }
    }
    
    modal.classList.add('active');
    vibrate(30);
}

function closeWorkoutEditor() {
    document.getElementById('workout-editor-modal').classList.remove('active');
    editingWorkoutId = null;
    vibrate(30);
}

function addExerciseToEditor(exercise = null) {
    const container = document.getElementById('workout-exercises-editor');
    const exId = exercise ? exercise.id : generateExerciseId();
    
    const exerciseEl = document.createElement('div');
    exerciseEl.className = 'workout-exercise-editor-item';
    exerciseEl.dataset.exerciseId = exId;
    
    exerciseEl.innerHTML = `
        <div class="workout-exercise-editor-header">
            <div class="workout-exercise-editor-title" style="font-weight: 600;">Exercício</div>
            <button type="button" class="workout-exercise-editor-remove" data-action="remove-exercise">
                <i class="fas fa-trash"></i>
            </button>
        </div>
        <div class="workout-exercise-editor-image ${exercise && exercise.imagem ? 'has-image' : ''}" data-exercise-image="${exId}">
            ${exercise && exercise.imagem ? 
                `<img src="${exercise.imagem}" alt="Exercício">` : 
                `<div class="workout-exercise-editor-image-placeholder">
                    <i class="fas fa-camera" style="font-size: 2rem; margin-bottom: 10px;"></i>
                    <div>Clique para adicionar imagem</div>
                </div>`
            }
            <input type="file" accept="image/*" hidden data-exercise-image-input="${exId}">
        </div>
        <div class="workout-exercise-editor-grid">
            <div class="form-group">
                <label class="form-label">Nome *</label>
                <input type="text" class="form-input" data-exercise-nome="${exId}" value="${exercise ? exercise.nome : ''}" placeholder="Ex: Supino Reto" required>
            </div>
            <div class="form-group">
                <label class="form-label">Séries *</label>
                <input type="number" class="form-input" data-exercise-series="${exId}" value="${exercise ? exercise.series : '3'}" min="1" required>
            </div>
            <div class="form-group">
                <label class="form-label">Repetições *</label>
                <input type="text" class="form-input" data-exercise-repeticoes="${exId}" value="${exercise ? exercise.repeticoes : '8-10'}" placeholder="Ex: 8-10" required>
            </div>
            <div class="form-group">
                <label class="form-label">Descanso (segundos)</label>
                <input type="number" class="form-input" data-exercise-descanso="${exId}" value="${exercise ? exercise.descanso : '60'}" min="0" placeholder="60">
            </div>
            <div class="form-group">
                <label class="form-label">Carga</label>
                <input type="text" class="form-input" data-exercise-carga="${exId}" value="${exercise ? exercise.carga : ''}" placeholder="Ex: 60kg">
            </div>
        </div>
    `;
    
    container.appendChild(exerciseEl);
    
    // Adicionar listener para remover
    exerciseEl.querySelector('[data-action="remove-exercise"]').addEventListener('click', () => {
        exerciseEl.remove();
    });
    
    // Adicionar listener para imagem
    const imageContainer = exerciseEl.querySelector(`[data-exercise-image="${exId}"]`);
    const imageInput = exerciseEl.querySelector(`[data-exercise-image-input="${exId}"]`);
    
    imageContainer.addEventListener('click', () => imageInput.click());
    imageInput.addEventListener('change', (e) => {
        if (e.target.files[0]) {
            const reader = new FileReader();
            reader.onload = (event) => {
                imageContainer.classList.add('has-image');
                imageContainer.innerHTML = `<img src="${event.target.result}" alt="Exercício">`;
            };
            reader.readAsDataURL(e.target.files[0]);
        }
    });
}

function saveWorkout() {
    const nome = document.getElementById('workout-editor-nome').value.trim();
    if (!nome) {
        alert('Por favor, informe o nome do treino.');
        return;
    }
    
    // Obter dias selecionados
    const diasSemana = [];
    document.querySelectorAll('.workout-day-checkbox:checked').forEach(cb => {
        diasSemana.push(cb.value);
    });
    
    if (diasSemana.length === 0) {
        alert('Por favor, selecione pelo menos um dia da semana.');
        return;
    }
    
    // Obter exercícios
    const exercicios = [];
    document.querySelectorAll('.workout-exercise-editor-item').forEach(item => {
        const exId = item.dataset.exerciseId;
        const nome = item.querySelector(`[data-exercise-nome="${exId}"]`).value.trim();
        if (!nome) return; // Pular se não tiver nome
        
        const imagemEl = item.querySelector(`[data-exercise-image="${exId}"] img`);
        const imagem = imagemEl ? imagemEl.src : null;
        
        exercicios.push({
            id: exId,
            nome,
            series: parseInt(item.querySelector(`[data-exercise-series="${exId}"]`).value) || 3,
            repeticoes: item.querySelector(`[data-exercise-repeticoes="${exId}"]`).value || '8-10',
            descanso: parseInt(item.querySelector(`[data-exercise-descanso="${exId}"]`).value) || 60,
            carga: item.querySelector(`[data-exercise-carga="${exId}"]`).value || null,
            imagem
        });
    });
    
    if (exercicios.length === 0) {
        alert('Por favor, adicione pelo menos um exercício.');
        return;
    }
    
    const workouts = getWorkouts();
    const workout = {
        id: editingWorkoutId || generateWorkoutId(),
        nome,
        descricao: document.getElementById('workout-editor-descricao').value.trim() || null,
        diasSemana,
        ativo: true,
        exercicios,
        criadoEm: editingWorkoutId ? 
            (workouts.find(w => w.id === editingWorkoutId)?.criadoEm || new Date().toISOString().split('T')[0]) :
            new Date().toISOString().split('T')[0]
    };
    
    if (editingWorkoutId) {
        const index = workouts.findIndex(w => w.id === editingWorkoutId);
        if (index !== -1) {
            workouts[index] = workout;
        }
    } else {
        workouts.push(workout);
    }
    
    saveWorkouts(workouts);
    closeWorkoutEditor();
    updateWorkoutList();
    updateWorkoutToday();
    vibrate(100);
}

// ========== LISTA DE TREINOS ==========
function updateWorkoutList() {
    const workouts = getWorkouts();
    const container = document.getElementById('workout-list-container');
    
    if (workouts.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">💪</div>
                <h3>Nenhum treino criado</h3>
                <p>Crie seu primeiro treino personalizado e comece a treinar!</p>
                <button class="btn btn-primary" data-action="create-workout">
                    <i class="fas fa-plus"></i>
                    Criar Primeiro Treino
                </button>
            </div>
        `;
        
        container.querySelector('button')?.addEventListener('click', () => openWorkoutEditor());
        return;
    }
    
    container.innerHTML = `
        <div class="workout-list-grid">
            ${workouts.map(workout => `
                <div class="workout-card">
                    <div class="workout-card-header">
                        <div>
                            <div class="workout-card-title">${workout.nome}</div>
                            ${workout.descricao ? `<div style="color: var(--text-secondary); font-size: 0.9rem; margin-top: 5px;">${workout.descricao}</div>` : ''}
                        </div>
                        <div class="workout-card-status ${workout.ativo ? 'active' : 'inactive'}">
                            ${workout.ativo ? 'Ativo' : 'Inativo'}
                        </div>
                    </div>
                    <div class="workout-card-days">
                        ${workout.diasSemana.map(day => `
                            <div class="workout-day-badge">${day}</div>
                        `).join('')}
                    </div>
                    <div style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 10px;">
                        <i class="fas fa-dumbbell"></i> ${workout.exercicios.length} exercícios
                    </div>
                    <div class="workout-card-actions">
                        <button class="btn btn-secondary" data-action="edit-workout" data-workout-id="${workout.id}">
                            <i class="fas fa-edit"></i>
                            Editar
                        </button>
                        <button class="btn btn-secondary" data-action="delete-workout" data-workout-id="${workout.id}">
                            <i class="fas fa-trash"></i>
                            Excluir
                        </button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    
    // Adicionar listeners
    container.querySelectorAll('[data-action="edit-workout"]').forEach(btn => {
        btn.addEventListener('click', () => openWorkoutEditor(btn.dataset.workoutId));
    });
    
    container.querySelectorAll('[data-action="delete-workout"]').forEach(btn => {
        btn.addEventListener('click', () => deleteWorkout(btn.dataset.workoutId));
    });
}

function deleteWorkout(workoutId) {
    if (confirm('Tem certeza que deseja excluir este treino?')) {
        const workouts = getWorkouts();
        const filtered = workouts.filter(w => w.id !== workoutId);
        saveWorkouts(filtered);
        updateWorkoutList();
        updateWorkoutToday();
        vibrate(50);
    }
}

// ========== ESTATÍSTICAS ==========
function updateWorkoutStats() {
    const checkins = getWorkoutCheckins();
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    
    // Total de treinos
    document.getElementById('workout-stat-total').textContent = checkins.length;
    
    // Streak
    let streak = 0;
    let checkDate = new Date();
    checkDate.setHours(0, 0, 0, 0);
    
    const checkinDates = checkins.map(c => {
        const [day, month, year] = c.data.split('/');
        return new Date(year, month - 1, day).getTime();
    });
    
    while (checkinDates.includes(checkDate.getTime())) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
    }
    
    document.getElementById('workout-stat-streak').textContent = streak;
    
    // Adesão semanal
    const weekCheckins = checkins.filter(c => {
        const [day, month, year] = c.data.split('/');
        const checkinDate = new Date(year, month - 1, day);
        return checkinDate >= startOfWeek;
    });
    
    const workouts = getWorkouts();
    const activeWorkouts = workouts.filter(w => w.ativo);
    const expectedWorkouts = activeWorkouts.reduce((sum, w) => {
        const daysThisWeek = w.diasSemana.filter(day => {
            const dayIndex = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].indexOf(day);
            return dayIndex <= today.getDay();
        }).length;
        return sum + daysThisWeek;
    }, 0);
    
    const adherence = expectedWorkouts > 0 ? Math.round((weekCheckins.length / expectedWorkouts) * 100) : 0;
    document.getElementById('workout-stat-adherence').textContent = adherence + '%';
    
    // Esta semana
    document.getElementById('workout-stat-week').textContent = weekCheckins.length;
}

// ========== HISTÓRICO ==========
function updateWorkoutHistory() {
    const checkins = getWorkoutCheckins();
    const workouts = getWorkouts();
    
    const container = document.getElementById('workout-history-container');
    
    if (checkins.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📊</div>
                <h3>Nenhum treino realizado</h3>
                <p>Comece a treinar para ver seu histórico aqui!</p>
            </div>
        `;
        return;
    }
    
    // Ordenar por data (mais recente primeiro)
    const sorted = checkins.sort((a, b) => {
        const [dayA, monthA, yearA] = a.data.split('/');
        const [dayB, monthB, yearB] = b.data.split('/');
        const dateA = new Date(yearA, monthA - 1, dayA);
        const dateB = new Date(yearB, monthB - 1, dayB);
        return dateB - dateA;
    });
    
    container.innerHTML = sorted.map(checkin => {
        const workout = workouts.find(w => w.id === checkin.treinoId);
        const [day, month] = checkin.data.split('/');
        const monthAbbr = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][parseInt(month) - 1];
        
        return `
            <div class="workout-history-item">
                <div class="workout-history-date">
                    <div class="workout-history-day">${day}</div>
                    <div class="workout-history-month">${monthAbbr}</div>
                </div>
                <div class="workout-history-info">
                    <div class="workout-history-name">${workout ? workout.nome : 'Treino'}</div>
                    <div class="workout-history-meta">
                        <i class="fas fa-clock"></i> ${checkin.duracao} minutos
                        ${checkin.observacao ? ` • ${checkin.observacao}` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ========== NOTIFICAÇÕES DE TREINO ==========
function checkWorkoutReminders() {
    if (!CONFIG.reminderEnabled || !('Notification' in window)) return;
    
    const workouts = getWorkouts();
    const today = new Date();
    const dayName = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][today.getDay()];
    
    const todayWorkout = workouts.find(w => 
        w.ativo && w.diasSemana.includes(dayName)
    );
    
    if (todayWorkout) {
        const checkins = getWorkoutCheckins();
        const todayStr = today.toLocaleDateString('pt-BR');
        const hasCheckin = checkins.some(c => c.data === todayStr && c.treinoId === todayWorkout.id);
        
        if (!hasCheckin) {
            // Verificar horário (exemplo: 18:00)
            const now = new Date();
            const reminderHour = 18;
            
            if (now.getHours() === reminderHour && now.getMinutes() === 0) {
                if (Notification.permission === 'granted') {
                    new Notification('FitTrack Pro - Hora do Treino 💪', {
                        body: `É hora do ${todayWorkout.nome}! Não esqueça de treinar hoje.`,
                        icon: '/icon-192.png',
                        badge: '/icon-192.png'
                    });
                }
            }
        }
    }
}


