// FitTrack Pro - Aplicativo PWA para Acompanhamento de Peso e Treinos
// Versão 2.0

// ==================== CONFIGURAÇÃO INICIAL ====================

const CONFIG = {
    schemaVersion: '2.0',
    storageKeys: {
        config: 'fittrack_config',
        registros: 'fittrack_registros',
        treinos: 'fittrack_treinos',
        treinoCheckins: 'fittrack_treino_checkins',
        schemaVersion: 'fittrack_schema_version'
    },
    defaultConfig: {
        nome: '',
        pesoMeta: null,
        prazoMeta: null,
        lembreteAtivo: false,
        lembreteHorario: '08:00',
        temaEscuro: true
    }
};

// ==================== INICIALIZAÇÃO ====================

let currentWorkoutExecution = null;
let db = null;
let currentCalendarMonth = new Date().getMonth();
let currentCalendarYear = new Date().getFullYear();

document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

async function initializeApp() {
    // Migrar dados se necessário
    migrateData();
    
    // Inicializar IndexedDB
    await initIndexedDB();
    
    // Carregar configurações
    loadConfig();
    
    // Carregar dados
    loadDashboard();
    loadRegistro();
    loadHistorico();
    loadTreinos();
    
    // Setup event listeners
    setupEventListeners();
    
    // Setup service worker
    registerServiceWorker();
    
    // Solicitar permissão de notificações
    requestNotificationPermission();
}

// ==================== INDEXEDDB ====================

function initIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('FitTrackDB', 2);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve();
        };
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            let store;
            if (!db.objectStoreNames.contains('photos')) {
                store = db.createObjectStore('photos', { keyPath: 'id', autoIncrement: true });
            } else {
                store = event.target.transaction.objectStore('photos');
            }
            
            // Criar índice se não existir
            if (!store.indexNames.contains('type_date')) {
                store.createIndex('type_date', ['type', 'date'], { unique: false });
            }
        };
    });
}

async function savePhotoToDB(type, date, base64Data) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('IndexedDB não inicializado'));
            return;
        }
        
        const transaction = db.transaction(['photos'], 'readwrite');
        const store = transaction.objectStore('photos');
        
        // Remover foto antiga se existir
        const removeOldPhoto = () => {
            let getRequest;
            if (store.indexNames.contains('type_date')) {
                const index = store.index('type_date');
                getRequest = index.get([type, date]);
            } else {
                // Buscar manualmente
                getRequest = store.openCursor();
                let found = null;
                getRequest.onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (cursor) {
                        if (cursor.value.type === type && cursor.value.date === date) {
                            found = cursor.value;
                            store.delete(cursor.value.id);
                        }
                        cursor.continue();
                    } else {
                        addNewPhoto();
                    }
                };
                getRequest.onerror = () => reject(getRequest.error);
                return;
            }
            
            getRequest.onsuccess = () => {
                if (getRequest.result) {
                    store.delete(getRequest.result.id);
                }
                addNewPhoto();
            };
            getRequest.onerror = () => reject(getRequest.error);
        };
        
        const addNewPhoto = () => {
            const photoData = {
                type: type,
                date: date,
                data: base64Data
            };
            
            const addRequest = store.add(photoData);
            addRequest.onsuccess = () => resolve(addRequest.result);
            addRequest.onerror = () => reject(addRequest.error);
        };
        
        removeOldPhoto();
    });
}

async function getPhotoFromDB(type, date) {
    return new Promise((resolve, reject) => {
        if (!db) {
            resolve(null);
            return;
        }
        
        const transaction = db.transaction(['photos'], 'readonly');
        const store = transaction.objectStore('photos');
        
        // Tentar usar índice se disponível, senão buscar manualmente
        let request;
        if (store.indexNames.contains('type_date')) {
            const index = store.index('type_date');
            request = index.get([type, date]);
        } else {
            // Buscar manualmente se índice não existir
            request = store.openCursor();
            let found = null;
            request.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    if (cursor.value.type === type && cursor.value.date === date) {
                        found = cursor.value;
                    }
                    cursor.continue();
                } else {
                    resolve(found ? found.data : null);
                }
            };
            request.onerror = () => reject(request.error);
            return;
        }
        
        request.onsuccess = () => {
            resolve(request.result ? request.result.data : null);
        };
        request.onerror = () => reject(request.error);
    });
}

// ==================== MIGRAÇÃO DE DADOS ====================

function migrateData() {
    const currentVersion = CONFIG.schemaVersion;
    const storedVersion = localStorage.getItem(CONFIG.storageKeys.schemaVersion) || '1.0';
    
    if (storedVersion === currentVersion) return;
    
    // Migração de 1.0 para 2.0
    if (storedVersion === '1.0') {
        const registros = getRegistros();
        registros.forEach(registro => {
            // Garantir que todos os campos existam
            if (!registro.cintura) registro.cintura = null;
            if (!registro.agua) registro.agua = null;
            if (!registro.sono) registro.sono = null;
            if (!registro.observacao) registro.observacao = '';
        });
        saveRegistros(registros);
    }
    
    localStorage.setItem(CONFIG.storageKeys.schemaVersion, currentVersion);
}

// ==================== GERENCIAMENTO DE DADOS ====================

function getConfig() {
    const stored = localStorage.getItem(CONFIG.storageKeys.config);
    return stored ? { ...CONFIG.defaultConfig, ...JSON.parse(stored) } : CONFIG.defaultConfig;
}

function saveConfig(config) {
    localStorage.setItem(CONFIG.storageKeys.config, JSON.stringify(config));
}

function getRegistros() {
    const stored = localStorage.getItem(CONFIG.storageKeys.registros);
    return stored ? JSON.parse(stored) : [];
}

function saveRegistros(registros) {
    localStorage.setItem(CONFIG.storageKeys.registros, JSON.stringify(registros));
}

function getTreinos() {
    const stored = localStorage.getItem(CONFIG.storageKeys.treinos);
    return stored ? JSON.parse(stored) : [];
}

function saveTreinos(treinos) {
    localStorage.setItem(CONFIG.storageKeys.treinos, JSON.stringify(treinos));
}

function getTreinoCheckins() {
    const stored = localStorage.getItem(CONFIG.storageKeys.treinoCheckins);
    return stored ? JSON.parse(stored) : [];
}

function saveTreinoCheckins(checkins) {
    localStorage.setItem(CONFIG.storageKeys.treinoCheckins, JSON.stringify(checkins));
}

// ==================== NAVEGAÇÃO ====================

function setupEventListeners() {
    // Navegação
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const section = item.getAttribute('data-section');
            showSection(section, item);
        });
    });
    
    // Toggle tema
    document.querySelector('[data-action="toggle-theme"]').addEventListener('click', toggleTheme);
    
    // Formulário de registro
    document.getElementById('registro-form').addEventListener('submit', handleRegistroSubmit);
    
    // Validação em tempo real
    document.getElementById('registro-peso').addEventListener('blur', validatePeso);
    document.getElementById('registro-sono').addEventListener('blur', validateSono);
    
    // Upload de fotos
    document.getElementById('foto-frente').addEventListener('change', (e) => handlePhotoUpload(e, 'frente'));
    document.getElementById('foto-lado').addEventListener('change', (e) => handlePhotoUpload(e, 'lado'));
    
    // Gráfico - períodos
    document.querySelectorAll('.chart-period').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.chart-period').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const period = parseInt(btn.getAttribute('data-period'));
            renderChart(period);
        });
    });
    
    // Configurações
    document.getElementById('config-form').addEventListener('submit', handleConfigSubmit);
    
    // Ações gerais
    document.querySelectorAll('[data-action]').forEach(btn => {
        const action = btn.getAttribute('data-action');
        
        if (action === 'create-workout') {
            btn.addEventListener('click', () => openWorkoutEditor());
        } else if (action === 'export-data') {
            btn.addEventListener('click', exportData);
        } else if (action === 'clear-data') {
            btn.addEventListener('click', clearAllData);
        } else if (action === 'close-modal') {
            btn.addEventListener('click', closeModal);
        } else if (action === 'add-exercise') {
            btn.addEventListener('click', addExerciseToEditor);
        } else if (action === 'finish-workout') {
            btn.addEventListener('click', finishWorkout);
        }
    });
    
    // Editor de treino
    document.getElementById('workout-editor-form').addEventListener('submit', handleWorkoutEditorSubmit);
}

function showSection(sectionId, navItem) {
    // Esconder todas as seções
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    
    // Mostrar seção selecionada
    document.getElementById(sectionId).classList.add('active');
    
    // Atualizar nav
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    navItem.classList.add('active');
    
    // Carregar dados da seção
    if (sectionId === 'dashboard') {
        loadDashboard();
    } else if (sectionId === 'registro') {
        loadRegistro();
    } else if (sectionId === 'historico') {
        loadHistorico();
    } else if (sectionId === 'treinos') {
        loadTreinos();
    }
}

// ==================== TEMA ====================

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    
    const config = getConfig();
    config.temaEscuro = newTheme === 'dark';
    saveConfig(config);
}

function loadConfig() {
    const config = getConfig();
    document.documentElement.setAttribute('data-theme', config.temaEscuro ? 'dark' : 'light');
    
    if (document.getElementById('config-nome')) {
        document.getElementById('config-nome').value = config.nome || '';
        document.getElementById('config-peso-meta').value = config.pesoMeta || '';
        document.getElementById('config-prazo-meta').value = config.prazoMeta || '';
        document.getElementById('config-lembrete-ativo').checked = config.lembreteAtivo || false;
        document.getElementById('config-lembrete-horario').value = config.lembreteHorario || '08:00';
        document.getElementById('config-tema-escuro').checked = config.temaEscuro !== false;
    }
}

// ==================== DASHBOARD ====================

function loadDashboard() {
    const registros = getRegistros();
    const config = getConfig();
    
    renderStats(registros, config);
    renderMetaCard(config);
    renderInsights(registros);
    renderChart(30);
    renderProgressComparison(registros);
    renderStreak(registros);
}

function renderStats(registros, config) {
    const statsGrid = document.getElementById('stats-grid');
    if (!statsGrid) return;
    
    const ultimoRegistro = registros.length > 0 ? registros[registros.length - 1] : null;
    const primeiroRegistro = registros.length > 0 ? registros[0] : null;
    
    const pesoAtual = ultimoRegistro ? ultimoRegistro.peso : 0;
    const pesoMeta = config.pesoMeta || 0;
    const totalPerdido = primeiroRegistro && ultimoRegistro ? 
        (primeiroRegistro.peso - ultimoRegistro.peso).toFixed(1) : 0;
    const totalRegistros = registros.length;
    
    const pesoAnterior = registros.length > 1 ? registros[registros.length - 2].peso : null;
    const mudancaPeso = pesoAnterior ? (pesoAtual - pesoAnterior).toFixed(1) : null;
    
    statsGrid.innerHTML = `
        <div class="stat-card">
            <div class="stat-icon">⚖️</div>
            <div class="stat-value">${pesoAtual ? pesoAtual.toFixed(1) : '--'} kg</div>
            <div class="stat-label">Peso Atual</div>
            ${mudancaPeso ? `
                <div class="stat-change ${mudancaPeso < 0 ? 'positive' : mudancaPeso > 0 ? 'negative' : ''}">
                    ${mudancaPeso > 0 ? '↑' : mudancaPeso < 0 ? '↓' : '→'} ${Math.abs(mudancaPeso)} kg
                </div>
            ` : ''}
        </div>
        <div class="stat-card">
            <div class="stat-icon">🎯</div>
            <div class="stat-value">${pesoMeta ? pesoMeta.toFixed(1) : '--'} kg</div>
            <div class="stat-label">Meta de Peso</div>
        </div>
        <div class="stat-card">
            <div class="stat-icon">📉</div>
            <div class="stat-value">${totalPerdido} kg</div>
            <div class="stat-label">Total Perdido</div>
        </div>
        <div class="stat-card">
            <div class="stat-icon">📊</div>
            <div class="stat-value">${totalRegistros}</div>
            <div class="stat-label">Total de Registros</div>
        </div>
    `;
}

function renderMetaCard(config) {
    const metaCard = document.getElementById('meta-info');
    if (!metaCard || !config.pesoMeta || !config.prazoMeta) {
        if (metaCard) metaCard.innerHTML = '<p style="color: var(--text-secondary);">Configure sua meta nas Configurações</p>';
        return;
    }
    
    const registros = getRegistros();
    if (registros.length === 0) {
        metaCard.innerHTML = '<p style="color: var(--text-secondary);">Comece registrando seu peso</p>';
        return;
    }
    
    const pesoAtual = registros[registros.length - 1].peso;
    const pesoInicial = registros[0].peso;
    const diferencaTotal = pesoInicial - config.pesoMeta;
    const diferencaAtual = pesoAtual - config.pesoMeta;
    const progresso = ((pesoInicial - pesoAtual) / diferencaTotal) * 100;
    
    const diasDecorridos = Math.floor((new Date() - new Date(registros[0].data)) / (1000 * 60 * 60 * 24));
    const diasTotais = config.prazoMeta * 30;
    const metaSemanal = diferencaTotal / (config.prazoMeta * 4);
    const progressoEsperado = (diasDecorridos / diasTotais) * 100;
    
    const diasAdiantado = progresso > progressoEsperado ? 
        Math.floor((progresso - progressoEsperado) * diasTotais / 100) : 0;
    const diasAtrasado = progresso < progressoEsperado ? 
        Math.floor((progressoEsperado - progresso) * diasTotais / 100) : 0;
    
    metaCard.innerHTML = `
        <div style="margin-bottom: 15px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                <span>Progresso</span>
                <span><strong>${progresso.toFixed(1)}%</strong></span>
            </div>
            <div style="background: var(--bg-secondary); height: 8px; border-radius: 4px; overflow: hidden;">
                <div style="background: var(--accent-gradient); height: 100%; width: ${Math.min(progresso, 100)}%; transition: width 0.3s;"></div>
            </div>
        </div>
        <p style="margin-bottom: 10px;"><strong>Meta semanal:</strong> ${metaSemanal.toFixed(2)} kg</p>
        ${diasAdiantado > 0 ? `<p style="color: var(--success);">🎉 ${diasAdiantado} dias adiantado!</p>` : ''}
        ${diasAtrasado > 0 ? `<p style="color: var(--warning);">⚠️ ${diasAtrasado} dias atrasado</p>` : ''}
    `;
}

function renderInsights(registros) {
    const insightsContainer = document.getElementById('insights-container');
    if (!insightsContainer || registros.length < 7) {
        if (insightsContainer) insightsContainer.innerHTML = '<p style="color: var(--text-secondary);">Continue registrando para ver insights personalizados</p>';
        return;
    }
    
    const insights = generateInsights(registros);
    
    if (insights.length === 0) {
        insightsContainer.innerHTML = '<p style="color: var(--text-secondary);">Continue registrando para ver insights personalizados</p>';
        return;
    }
    
    insightsContainer.innerHTML = insights.map(insight => `
        <div class="insight-card">
            <div class="insight-title">💡 ${insight.title}</div>
            <div class="insight-text">${insight.text}</div>
        </div>
    `).join('');
}

function generateInsights(registros) {
    const insights = [];
    
    // Insight sobre sono
    const registrosComSono = registros.filter(r => r.sono);
    if (registrosComSono.length >= 7) {
        const registrosComSonoBom = registrosComSono.filter(r => r.sono >= 7);
        const registrosComSonoRuim = registrosComSono.filter(r => r.sono < 7);
        
        if (registrosComSonoBom.length > 0 && registrosComSonoRuim.length > 0) {
            const perdaComSonoBom = calculateAverageWeightLoss(registrosComSonoBom);
            const perdaComSonoRuim = calculateAverageWeightLoss(registrosComSonoRuim);
            
            if (perdaComSonoBom > perdaComSonoRuim) {
                insights.push({
                    title: 'Sono e Progresso',
                    text: 'Seu peso costuma cair mais quando você dorme 7 horas ou mais. Continue priorizando o descanso!'
                });
            }
        }
    }
    
    // Insight sobre água
    const registrosComAgua = registros.filter(r => r.agua);
    if (registrosComAgua.length >= 7) {
        const mediaAgua = registrosComAgua.reduce((sum, r) => sum + r.agua, 0) / registrosComAgua.length;
        const registrosAcimaMedia = registrosComAgua.filter(r => r.agua >= mediaAgua);
        const registrosAbaixoMedia = registrosComAgua.filter(r => r.agua < mediaAgua);
        
        if (registrosAcimaMedia.length > 0 && registrosAbaixoMedia.length > 0) {
            const perdaAcimaMedia = calculateAverageWeightLoss(registrosAcimaMedia);
            const perdaAbaixoMedia = calculateAverageWeightLoss(registrosAbaixoMedia);
            
            if (perdaAcimaMedia > perdaAbaixoMedia) {
                insights.push({
                    title: 'Hidratação Importa',
                    text: 'Semanas com mais água = mais progresso. Mantenha-se hidratado!'
                });
            }
        }
    }
    
    // Insight sobre dias da semana
    const registrosPorDia = {};
    registros.forEach(r => {
        const dia = new Date(r.data).getDay();
        if (!registrosPorDia[dia]) registrosPorDia[dia] = [];
        registrosPorDia[dia].push(r);
    });
    
    const diasComMaisPerda = Object.entries(registrosPorDia)
        .filter(([_, regs]) => regs.length >= 3)
        .map(([dia, regs]) => ({
            dia: parseInt(dia),
            perda: calculateAverageWeightLoss(regs)
        }))
        .sort((a, b) => b.perda - a.perda);
    
    if (diasComMaisPerda.length > 0 && diasComMaisPerda[0].perda > 0) {
        const nomesDias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
        insights.push({
            title: 'Dia da Semana',
            text: `Você perde mais peso de ${nomesDias[diasComMaisPerda[0].dia]}. Continue assim!`
        });
    }
    
    return insights.slice(0, 3); // Máximo 3 insights
}

function calculateAverageWeightLoss(registros) {
    if (registros.length < 2) return 0;
    const ordenados = [...registros].sort((a, b) => new Date(a.data) - new Date(b.data));
    return ordenados[0].peso - ordenados[ordenados.length - 1].peso;
}

function renderChart(periodDays = 30) {
    const canvas = document.getElementById('weight-chart');
    if (!canvas) return;
    
    const registros = getRegistros();
    if (registros.length === 0) {
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
        return;
    }
    
    const now = new Date();
    const cutoffDate = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);
    
    const filteredRegistros = registros
        .filter(r => new Date(r.data) >= cutoffDate)
        .sort((a, b) => new Date(a.data) - new Date(b.data));
    
    if (filteredRegistros.length === 0) {
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
        return;
    }
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.offsetWidth;
    const height = canvas.height = 200;
    
    ctx.clearRect(0, 0, width, height);
    
    // Configurações
    const padding = 40;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;
    
    const pesos = filteredRegistros.map(r => r.peso);
    const minPeso = Math.min(...pesos);
    const maxPeso = Math.max(...pesos);
    const range = maxPeso - minPeso || 1;
    
    // Desenhar grade
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
        const y = padding + (chartHeight / 5) * i;
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(width - padding, y);
        ctx.stroke();
    }
    
    // Desenhar linha
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 3;
    ctx.beginPath();
    
    filteredRegistros.forEach((registro, index) => {
        const x = padding + (chartWidth / (filteredRegistros.length - 1 || 1)) * index;
        const y = padding + chartHeight - ((registro.peso - minPeso) / range) * chartHeight;
        
        if (index === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    
    ctx.stroke();
    
    // Desenhar pontos
    ctx.fillStyle = '#6366f1';
    filteredRegistros.forEach((registro, index) => {
        const x = padding + (chartWidth / (filteredRegistros.length - 1 || 1)) * index;
        const y = padding + chartHeight - ((registro.peso - minPeso) / range) * chartHeight;
        
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
    });
    
    // Labels
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(minPeso.toFixed(1) + ' kg', padding - 10, height - padding);
    ctx.fillText(maxPeso.toFixed(1) + ' kg', padding - 10, padding + 5);
}

function renderProgressComparison(registros) {
    const container = document.getElementById('progress-comparison');
    if (!container) return;
    
    const fotosFrente = registros.filter(r => r.fotoFrente).map(r => ({ data: r.data, foto: r.fotoFrente }));
    const fotosLado = registros.filter(r => r.fotoLado).map(r => ({ data: r.data, foto: r.fotoLado }));
    
    if (fotosFrente.length === 0 && fotosLado.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">Adicione fotos de progresso para ver a comparação</p>';
        return;
    }
    
    // Usar fotos de frente se disponível, senão lado
    const fotos = fotosFrente.length > 0 ? fotosFrente : fotosLado;
    const primeiraFoto = fotos[0].foto;
    const ultimaFoto = fotos[fotos.length - 1].foto;
    
    container.innerHTML = `
        <div class="progress-comparison">
            <div class="progress-slider" id="progress-slider">
                <img src="${primeiraFoto}" class="progress-image" id="progress-before" style="position: absolute; left: 0; width: 50%; height: 100%; object-fit: cover;">
                <img src="${ultimaFoto}" class="progress-image" id="progress-after" style="position: absolute; right: 0; width: 50%; height: 100%; object-fit: cover;">
                <div class="progress-handle" id="progress-handle" style="left: 50%;"></div>
            </div>
        </div>
    `;
    
    // Setup slider
    setupProgressSlider();
}

function setupProgressSlider() {
    const slider = document.getElementById('progress-slider');
    const handle = document.getElementById('progress-handle');
    if (!slider || !handle) return;
    
    let isDragging = false;
    
    handle.addEventListener('mousedown', (e) => {
        isDragging = true;
        e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        updateSliderPosition(e.clientX);
    });
    
    document.addEventListener('mouseup', () => {
        isDragging = false;
    });
    
    handle.addEventListener('touchstart', (e) => {
        isDragging = true;
        e.preventDefault();
    });
    
    document.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        updateSliderPosition(e.touches[0].clientX);
    });
    
    document.addEventListener('touchend', () => {
        isDragging = false;
    });
    
    function updateSliderPosition(x) {
        const rect = slider.getBoundingClientRect();
        const percentage = Math.max(0, Math.min(100, ((x - rect.left) / rect.width) * 100));
        handle.style.left = percentage + '%';
        document.getElementById('progress-before').style.width = percentage + '%';
        document.getElementById('progress-after').style.width = (100 - percentage) + '%';
    }
}

function renderStreak(registros) {
    const streakBadge = document.getElementById('streak-badge');
    const streakCount = document.getElementById('streak-count');
    if (!streakBadge || !streakCount) return;
    
    if (registros.length === 0) {
        streakCount.textContent = '0';
        return;
    }
    
    const hoje = new Date().toISOString().split('T')[0];
    const datas = registros.map(r => r.data).sort((a, b) => new Date(b) - new Date(a));
    
    let streak = 0;
    let dataAtual = new Date(hoje);
    
    for (const data of datas) {
        const dataStr = new Date(dataAtual).toISOString().split('T')[0];
        if (datas.includes(dataStr)) {
            streak++;
            dataAtual.setDate(dataAtual.getDate() - 1);
        } else {
            break;
        }
    }
    
    streakCount.textContent = streak;
}

// ==================== REGISTRO ====================

function loadRegistro() {
    const hoje = new Date().toISOString().split('T')[0];
    document.getElementById('registro-data').value = hoje;
    renderCalendar();
}

async function handleRegistroSubmit(e) {
    e.preventDefault();
    
    const data = document.getElementById('registro-data').value;
    const peso = parseFloat(document.getElementById('registro-peso').value);
    const cintura = document.getElementById('registro-cintura').value ? 
        parseFloat(document.getElementById('registro-cintura').value) : null;
    const agua = document.getElementById('registro-agua').value ? 
        parseFloat(document.getElementById('registro-agua').value) : null;
    const sono = document.getElementById('registro-sono').value ? 
        parseFloat(document.getElementById('registro-sono').value) : null;
    const observacao = document.getElementById('registro-observacao').value;
    
    // Validações
    const validacaoPeso = validatePeso();
    if (!validacaoPeso.valid) {
        return;
    }
    
    const validacaoSono = validateSono();
    if (!validacaoSono.valid) {
        return;
    }
    
    // Buscar registros
    const registros = getRegistros();
    
    // Verificar se já existe registro para esta data
    const indexExistente = registros.findIndex(r => r.data === data);
    
    const novoRegistro = {
        data: data,
        peso: peso,
        cintura: cintura,
        agua: agua,
        sono: sono,
        observacao: observacao
    };
    
    // Salvar fotos
    const fotoFrenteInput = document.getElementById('foto-frente');
    const fotoLadoInput = document.getElementById('foto-lado');
    
    if (fotoFrenteInput.files.length > 0) {
        const fotoFrenteBase64 = await compressImage(fotoFrenteInput.files[0]);
        novoRegistro.fotoFrente = fotoFrenteBase64;
        await savePhotoToDB('frente', data, fotoFrenteBase64);
    } else {
        // Tentar buscar foto existente
        const fotoExistente = await getPhotoFromDB('frente', data);
        if (fotoExistente) {
            novoRegistro.fotoFrente = fotoExistente;
        }
    }
    
    if (fotoLadoInput.files.length > 0) {
        const fotoLadoBase64 = await compressImage(fotoLadoInput.files[0]);
        novoRegistro.fotoLado = fotoLadoBase64;
        await savePhotoToDB('lado', data, fotoLadoBase64);
    } else {
        const fotoExistente = await getPhotoFromDB('lado', data);
        if (fotoExistente) {
            novoRegistro.fotoLado = fotoExistente;
        }
    }
    
    if (indexExistente >= 0) {
        registros[indexExistente] = novoRegistro;
    } else {
        registros.push(novoRegistro);
    }
    
    // Ordenar por data
    registros.sort((a, b) => new Date(a.data) - new Date(b.data));
    
    saveRegistros(registros);
    
    // Limpar formulário
    document.getElementById('registro-form').reset();
    document.getElementById('registro-data').value = new Date().toISOString().split('T')[0];
    document.getElementById('preview-frente').src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='133'%3E%3Crect fill='%23141b2d' width='100' height='133'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%2394a3b8' font-size='12'%3ESem foto%3C/text%3E%3C/svg%3E";
    document.getElementById('preview-lado').src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='133'%3E%3Crect fill='%23141b2d' width='100' height='133'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%2394a3b8' font-size='12'%3ESem foto%3C/text%3E%3C/svg%3E";
    
    // Feedback
    showModal('modal-success', 'Registro salvo com sucesso! 💪');
    
    // Vibração (se suportado)
    if (navigator.vibrate) {
        navigator.vibrate(100);
    }
    
    // Atualizar dashboard
    loadDashboard();
    renderCalendar();
}

function validatePeso() {
    const pesoInput = document.getElementById('registro-peso');
    const peso = parseFloat(pesoInput.value);
    const data = document.getElementById('registro-data').value;
    const registros = getRegistros();
    
    // Encontrar último registro antes desta data
    const registrosAntes = registros
        .filter(r => r.data < data)
        .sort((a, b) => new Date(b.data) - new Date(a.data));
    
    if (registrosAntes.length > 0) {
        const ultimoPeso = registrosAntes[0].peso;
        const diferenca = Math.abs(peso - ultimoPeso);
        
        if (diferenca > 10) {
            pesoInput.classList.add('invalid');
            pesoInput.classList.remove('valid');
            document.getElementById('peso-error').textContent = 
                'Peso não pode variar mais de 10kg de um dia para outro';
            return { valid: false };
        }
    }
    
    pesoInput.classList.remove('invalid');
    pesoInput.classList.add('valid');
    document.getElementById('peso-error').textContent = '';
    return { valid: true };
}

function validateSono() {
    const sonoInput = document.getElementById('registro-sono');
    const sono = parseFloat(sonoInput.value);
    
    if (sono && sono > 24) {
        sonoInput.classList.add('invalid');
        sonoInput.classList.remove('valid');
        document.getElementById('sono-error').textContent = 'Sono não pode ser maior que 24 horas';
        return { valid: false };
    }
    
    sonoInput.classList.remove('invalid');
    sonoInput.classList.add('valid');
    document.getElementById('sono-error').textContent = '';
    return { valid: true };
}

async function handlePhotoUpload(e, type) {
    const file = e.target.files[0];
    if (!file) return;
    
    const previewId = type === 'frente' ? 'preview-frente' : 'preview-lado';
    const preview = document.getElementById(previewId);
    
    const base64 = await compressImage(file);
    preview.src = base64;
}

function compressImage(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const maxWidth = 800;
                const scale = Math.min(maxWidth / img.width, maxWidth / img.height, 1);
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                
                const base64 = canvas.toDataURL('image/jpeg', 0.7);
                resolve(base64);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// ==================== CALENDÁRIO ====================

function renderCalendar() {
    const container = document.getElementById('calendar-container');
    if (!container) return;
    
    renderCalendarMonth(container, currentCalendarMonth, currentCalendarYear);
}

function renderCalendarMonth(container, mes, ano) {
    const registros = getRegistros();
    const checkins = getTreinoCheckins();
    const hoje = new Date().toISOString().split('T')[0];
    
    const primeiroDia = new Date(ano, mes, 1);
    const ultimoDia = new Date(ano, mes + 1, 0);
    const diasNoMes = ultimoDia.getDate();
    const diaSemanaInicio = primeiroDia.getDay();
    
    const nomesMeses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const nomesDias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    
    let html = `
        <div class="calendar-header">
            <button class="calendar-nav" onclick="navigateCalendar(-1)">←</button>
            <h3>${nomesMeses[mes]} ${ano}</h3>
            <button class="calendar-nav" onclick="navigateCalendar(1)">→</button>
        </div>
        <div class="calendar-grid">
    `;
    
    // Dias da semana
    nomesDias.forEach(dia => {
        html += `<div class="calendar-day-name">${dia}</div>`;
    });
    
    // Espaços vazios antes do primeiro dia
    for (let i = 0; i < diaSemanaInicio; i++) {
        html += `<div class="calendar-day"></div>`;
    }
    
    // Dias do mês
    for (let dia = 1; dia <= diasNoMes; dia++) {
        const dataStr = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
        const temRegistro = registros.some(r => r.data === dataStr);
        const temTreino = checkins.some(c => c.data === dataStr && c.concluido);
        const eHoje = dataStr === hoje;
        
        let classes = 'calendar-day';
        if (eHoje) classes += ' today';
        if (temRegistro) classes += ' has-record';
        if (temTreino) classes += ' has-workout';
        
        html += `
            <div class="${classes}" data-date="${dataStr}" onclick="selectCalendarDate('${dataStr}')">
                ${dia}
            </div>
        `;
    }
    
    html += '</div>';
    
    container.innerHTML = html;
}

window.navigateCalendar = function(direction) {
    currentCalendarMonth += direction;
    if (currentCalendarMonth < 0) {
        currentCalendarMonth = 11;
        currentCalendarYear--;
    } else if (currentCalendarMonth > 11) {
        currentCalendarMonth = 0;
        currentCalendarYear++;
    }
    renderCalendar();
};

window.selectCalendarDate = async function(dataStr) {
    document.getElementById('registro-data').value = dataStr;
    
    // Carregar dados existentes se houver
    const registros = getRegistros();
    const registro = registros.find(r => r.data === dataStr);
    
    if (registro) {
        document.getElementById('registro-peso').value = registro.peso || '';
        document.getElementById('registro-cintura').value = registro.cintura || '';
        document.getElementById('registro-agua').value = registro.agua || '';
        document.getElementById('registro-sono').value = registro.sono || '';
        document.getElementById('registro-observacao').value = registro.observacao || '';
        
        // Carregar fotos do registro ou do IndexedDB
        if (registro.fotoFrente) {
            document.getElementById('preview-frente').src = registro.fotoFrente;
        } else {
            const fotoFrenteDB = await getPhotoFromDB('frente', dataStr);
            if (fotoFrenteDB) {
                document.getElementById('preview-frente').src = fotoFrenteDB;
            }
        }
        
        if (registro.fotoLado) {
            document.getElementById('preview-lado').src = registro.fotoLado;
        } else {
            const fotoLadoDB = await getPhotoFromDB('lado', dataStr);
            if (fotoLadoDB) {
                document.getElementById('preview-lado').src = fotoLadoDB;
            }
        }
    } else {
        // Limpar previews se não houver registro
        document.getElementById('preview-frente').src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='133'%3E%3Crect fill='%23141b2d' width='100' height='133'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%2394a3b8' font-size='12'%3ESem foto%3C/text%3E%3C/svg%3E";
        document.getElementById('preview-lado').src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='133'%3E%3Crect fill='%23141b2d' width='100' height='133'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%2394a3b8' font-size='12'%3ESem foto%3C/text%3E%3C/svg%3E";
    }
    
    // Ir para seção de registro
    const registroNav = document.querySelector('[data-section="registro"]');
    showSection('registro', registroNav);
};

// ==================== HISTÓRICO ====================

function loadHistorico() {
    const container = document.getElementById('historico-list');
    if (!container) return;
    
    const registros = getRegistros();
    
    if (registros.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📋</div>
                <div class="empty-state-title">Nenhum registro ainda</div>
                <div class="empty-state-text">Comece hoje. Seu primeiro registro leva menos de 1 minuto.</div>
            </div>
        `;
        return;
    }
    
    container.innerHTML = registros
        .sort((a, b) => new Date(b.data) - new Date(a.data))
        .map((registro, index) => {
            const dataFormatada = new Date(registro.data).toLocaleDateString('pt-BR');
            const registroAnterior = index < registros.length - 1 ? registros[registros.length - 2 - index] : null;
            const mudanca = registroAnterior ? (registro.peso - registroAnterior.peso).toFixed(1) : null;
            
            let meta = [];
            if (registro.agua) meta.push(`💧 ${registro.agua}L`);
            if (registro.sono) meta.push(`😴 ${registro.sono}h`);
            if (registro.cintura) meta.push(`📏 ${registro.cintura}cm`);
            
            return `
                <div class="history-item">
                    <div>
                        <div class="history-date">${dataFormatada}</div>
                        <div class="history-meta">${meta.join(' • ')}</div>
                        ${mudanca ? `
                            <div class="history-change ${mudanca < 0 ? 'positive' : mudanca > 0 ? 'negative' : ''}">
                                ${mudanca > 0 ? '↑' : mudanca < 0 ? '↓' : '→'} ${Math.abs(mudanca)} kg
                            </div>
                        ` : ''}
                    </div>
                    <div class="history-weight">${registro.peso.toFixed(1)} kg</div>
                </div>
            `;
        })
        .join('');
}

// ==================== TREINOS ====================

function loadTreinos() {
    renderTreinoDoDia();
    renderTreinosList();
}

function renderTreinoDoDia() {
    const container = document.getElementById('treino-do-dia-content');
    const card = document.getElementById('treino-do-dia-card');
    if (!container) return;
    
    const treinos = getTreinos();
    const hoje = new Date();
    const diaSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][hoje.getDay()];
    
    const treinoDoDia = treinos.find(t => 
        t.ativo && t.diasSemana && t.diasSemana.includes(diaSemana)
    );
    
    if (!treinoDoDia) {
        card.style.display = 'none';
        return;
    }
    
    card.style.display = 'block';
    container.innerHTML = `
        <div class="workout-header">
            <div>
                <div class="workout-name">${treinoDoDia.nome}</div>
                ${treinoDoDia.descricao ? `<p style="color: var(--text-secondary); font-size: 14px;">${treinoDoDia.descricao}</p>` : ''}
            </div>
        </div>
        <div class="exercise-list">
            ${treinoDoDia.exercicios.map(ex => `
                <div class="exercise-item">
                    <div>
                        <strong>${ex.nome}</strong>
                        <div style="font-size: 12px; color: var(--text-secondary); margin-top: 5px;">
                            ${ex.series}x ${ex.repeticoes} • ${ex.descanso}s descanso
                            ${ex.carga ? ` • ${ex.carga}` : ''}
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
        <button class="btn btn-primary btn-full mt-20" data-action="start-workout" data-workout-id="${treinoDoDia.id}">
            🏋️ Iniciar Treino
        </button>
    `;
    
    // Adicionar event listener ao botão
    container.querySelector('[data-action="start-workout"]')?.addEventListener('click', (e) => {
        const workoutId = e.target.getAttribute('data-workout-id');
        startWorkout(workoutId);
    });
}

function renderTreinosList() {
    const container = document.getElementById('treinos-list');
    if (!container) return;
    
    const treinos = getTreinos();
    
    if (treinos.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🏋️</div>
                <div class="empty-state-title">Nenhum treino criado</div>
                <div class="empty-state-text">Crie seu primeiro treino personalizado</div>
            </div>
        `;
        return;
    }
    
    container.innerHTML = treinos.map(treino => `
        <div class="workout-card">
            <div class="workout-header">
                <div>
                    <div class="workout-name">${treino.nome}</div>
                    ${treino.descricao ? `<p style="color: var(--text-secondary); font-size: 14px; margin-top: 5px;">${treino.descricao}</p>` : ''}
                    <div class="workout-days">
                        ${treino.diasSemana ? treino.diasSemana.map(dia => 
                            `<span class="workout-day-badge">${dia}</span>`
                        ).join('') : ''}
                    </div>
                    <div style="margin-top: 10px; font-size: 12px; color: var(--text-secondary);">
                        Status: ${treino.ativo ? '✅ Ativo' : '⏸️ Inativo'}
                    </div>
                </div>
            </div>
            <div class="workout-actions">
                <button class="btn btn-secondary" data-action="edit-workout" data-workout-id="${treino.id}">
                    ✏️ Editar
                </button>
                <button class="btn btn-danger" data-action="delete-workout" data-workout-id="${treino.id}">
                    🗑️ Excluir
                </button>
            </div>
        </div>
    `).join('');
    
    // Event listeners
    container.querySelectorAll('[data-action="edit-workout"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const workoutId = e.target.getAttribute('data-workout-id');
            openWorkoutEditor(workoutId);
        });
    });
    
    container.querySelectorAll('[data-action="delete-workout"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const workoutId = e.target.getAttribute('data-workout-id');
            deleteWorkout(workoutId);
        });
    });
}

function openWorkoutEditor(workoutId = null) {
    const modal = document.getElementById('modal-workout-editor');
    const title = document.getElementById('modal-workout-title');
    const form = document.getElementById('workout-editor-form');
    const exercisesContainer = document.getElementById('workout-exercises-container');
    
    if (workoutId) {
        const treinos = getTreinos();
        const treino = treinos.find(t => t.id === workoutId);
        if (treino) {
            title.textContent = 'Editar Treino';
            document.getElementById('workout-editor-id').value = treino.id;
            document.getElementById('workout-editor-nome').value = treino.nome;
            document.getElementById('workout-editor-descricao').value = treino.descricao || '';
            
            // Marcar dias da semana
            document.querySelectorAll('.workout-day').forEach(cb => {
                cb.checked = treino.diasSemana && treino.diasSemana.includes(cb.value);
            });
            
            // Renderizar exercícios
            exercisesContainer.innerHTML = '';
            treino.exercicios.forEach((ex, index) => {
                addExerciseToEditor(ex, index);
            });
        }
    } else {
        title.textContent = 'Novo Treino';
        form.reset();
        document.getElementById('workout-editor-id').value = '';
        exercisesContainer.innerHTML = '';
    }
    
    modal.classList.add('active');
}

function addExerciseToEditor(exercise = null, index = null) {
    const container = document.getElementById('workout-exercises-container');
    if (!container) return;
    
    const exerciseIndex = index !== null ? index : container.children.length;
    
    const exerciseHtml = `
        <div class="card mb-20" data-exercise-index="${exerciseIndex}">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <strong>Exercício ${exerciseIndex + 1}</strong>
                <button type="button" class="btn btn-danger" onclick="removeExercise(${exerciseIndex})" style="padding: 5px 10px; font-size: 12px;">Remover</button>
            </div>
            <div class="form-group">
                <label>Nome do Exercício *</label>
                <input type="text" class="exercise-nome" value="${exercise?.nome || ''}" required>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Séries</label>
                    <input type="number" class="exercise-series" value="${exercise?.series || ''}" min="1">
                </div>
                <div class="form-group">
                    <label>Repetições</label>
                    <input type="text" class="exercise-repeticoes" value="${exercise?.repeticoes || ''}" placeholder="8-10">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Descanso (segundos)</label>
                    <input type="number" class="exercise-descanso" value="${exercise?.descanso || ''}" min="0">
                </div>
                <div class="form-group">
                    <label>Carga</label>
                    <input type="text" class="exercise-carga" value="${exercise?.carga || ''}" placeholder="60kg">
                </div>
            </div>
        </div>
    `;
    
    container.insertAdjacentHTML('beforeend', exerciseHtml);
}

window.removeExercise = function(index) {
    const container = document.getElementById('workout-exercises-container');
    const exerciseEl = container.querySelector(`[data-exercise-index="${index}"]`);
    if (exerciseEl) {
        exerciseEl.remove();
        // Renumerar exercícios
        container.querySelectorAll('[data-exercise-index]').forEach((el, i) => {
            el.setAttribute('data-exercise-index', i);
            el.querySelector('strong').textContent = `Exercício ${i + 1}`;
            el.querySelector('button').setAttribute('onclick', `removeExercise(${i})`);
        });
    }
};

function handleWorkoutEditorSubmit(e) {
    e.preventDefault();
    
    const treinos = getTreinos();
    const workoutId = document.getElementById('workout-editor-id').value;
    const nome = document.getElementById('workout-editor-nome').value;
    const descricao = document.getElementById('workout-editor-descricao').value;
    
    const diasSemana = Array.from(document.querySelectorAll('.workout-day:checked'))
        .map(cb => cb.value);
    
    const exercisesContainer = document.getElementById('workout-exercises-container');
    const exercicios = Array.from(exercisesContainer.children).map(exEl => ({
        id: `ex-${Date.now()}-${Math.random()}`,
        nome: exEl.querySelector('.exercise-nome').value,
        series: parseInt(exEl.querySelector('.exercise-series').value) || 0,
        repeticoes: exEl.querySelector('.exercise-repeticoes').value || '',
        descanso: parseInt(exEl.querySelector('.exercise-descanso').value) || 0,
        carga: exEl.querySelector('.exercise-carga').value || ''
    }));
    
    if (exercicios.length === 0) {
        alert('Adicione pelo menos um exercício');
        return;
    }
    
    const novoTreino = {
        id: workoutId || `treino-${Date.now()}`,
        nome: nome,
        descricao: descricao,
        diasSemana: diasSemana,
        ativo: true,
        exercicios: exercicios,
        criadoEm: workoutId ? treinos.find(t => t.id === workoutId)?.criadoEm || new Date().toISOString() : new Date().toISOString()
    };
    
    if (workoutId) {
        const index = treinos.findIndex(t => t.id === workoutId);
        if (index >= 0) {
            treinos[index] = novoTreino;
        }
    } else {
        treinos.push(novoTreino);
    }
    
    saveTreinos(treinos);
    closeModal();
    loadTreinos();
    showModal('modal-success', 'Treino salvo com sucesso! 💪');
}

function deleteWorkout(workoutId) {
    if (!confirm('Tem certeza que deseja excluir este treino?')) return;
    
    const treinos = getTreinos();
    const filtrados = treinos.filter(t => t.id !== workoutId);
    saveTreinos(filtrados);
    loadTreinos();
}

function startWorkout(workoutId) {
    const treinos = getTreinos();
    const treino = treinos.find(t => t.id === workoutId);
    if (!treino) return;
    
    currentWorkoutExecution = {
        treinoId: workoutId,
        exercicios: treino.exercicios.map(ex => ({ ...ex, concluido: false })),
        inicio: new Date()
    };
    
    renderWorkoutExecution();
    document.getElementById('modal-workout-execution').classList.add('active');
}

function renderWorkoutExecution() {
    const container = document.getElementById('workout-execution-content');
    const title = document.getElementById('workout-execution-title');
    if (!container || !currentWorkoutExecution) return;
    
    const treinos = getTreinos();
    const treino = treinos.find(t => t.id === currentWorkoutExecution.treinoId);
    if (!treino) return;
    
    title.textContent = treino.nome;
    
    container.innerHTML = currentWorkoutExecution.exercicios.map((ex, index) => `
        <div class="card mb-20">
            <div style="display: flex; justify-content: space-between; align-items: start;">
                <div style="flex: 1;">
                    <h3 style="margin-bottom: 10px;">${ex.nome}</h3>
                    <div style="color: var(--text-secondary); font-size: 14px;">
                        ${ex.series}x ${ex.repeticoes} • ${ex.descanso}s descanso
                        ${ex.carga ? ` • ${ex.carga}` : ''}
                    </div>
                </div>
                <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                    <input type="checkbox" class="exercise-checkbox" data-exercise-index="${index}" 
                           ${ex.concluido ? 'checked' : ''} 
                           onchange="toggleExerciseComplete(${index})">
                    <span>Concluído</span>
                </label>
            </div>
        </div>
    `).join('');
}

window.toggleExerciseComplete = function(index) {
    if (currentWorkoutExecution && currentWorkoutExecution.exercicios[index]) {
        currentWorkoutExecution.exercicios[index].concluido = 
            !currentWorkoutExecution.exercicios[index].concluido;
    }
};

function finishWorkout() {
    if (!currentWorkoutExecution) return;
    
    const todosConcluidos = currentWorkoutExecution.exercicios.every(ex => ex.concluido);
    if (!todosConcluidos) {
        if (!confirm('Nem todos os exercícios foram concluídos. Deseja finalizar mesmo assim?')) {
            return;
        }
    }
    
    const duracao = Math.floor((new Date() - currentWorkoutExecution.inicio) / 1000 / 60);
    const hoje = new Date().toISOString().split('T')[0];
    
    const checkins = getTreinoCheckins();
    const novoCheckin = {
        data: hoje,
        treinoId: currentWorkoutExecution.treinoId,
        concluido: true,
        duracao: duracao,
        observacao: ''
    };
    
    // Remover check-in existente do dia se houver
    const checkinsFiltrados = checkins.filter(c => !(c.data === hoje && c.treinoId === currentWorkoutExecution.treinoId));
    checkinsFiltrados.push(novoCheckin);
    
    saveTreinoCheckins(checkinsFiltrados);
    
    closeModal();
    showModal('modal-success', 'Treino concluído! 💪 Continue assim!');
    
    // Vibração
    if (navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
    }
    
    currentWorkoutExecution = null;
    loadTreinos();
    loadDashboard();
}

// ==================== CONFIGURAÇÕES ====================

function handleConfigSubmit(e) {
    e.preventDefault();
    
    const config = {
        nome: document.getElementById('config-nome').value,
        pesoMeta: document.getElementById('config-peso-meta').value ? 
            parseFloat(document.getElementById('config-peso-meta').value) : null,
        prazoMeta: document.getElementById('config-prazo-meta').value ? 
            parseInt(document.getElementById('config-prazo-meta').value) : null,
        lembreteAtivo: document.getElementById('config-lembrete-ativo').checked,
        lembreteHorario: document.getElementById('config-lembrete-horario').value,
        temaEscuro: document.getElementById('config-tema-escuro').checked
    };
    
    saveConfig(config);
    
    // Aplicar tema
    document.documentElement.setAttribute('data-theme', config.temaEscuro ? 'dark' : 'light');
    
    showModal('modal-success', 'Configurações salvas! ✅');
    loadDashboard();
}

function exportData() {
    const data = {
        config: getConfig(),
        registros: getRegistros(),
        treinos: getTreinos(),
        treinoCheckins: getTreinoCheckins(),
        exportDate: new Date().toISOString()
    };
    
    // Remover fotos do export (muito grande)
    data.registros = data.registros.map(r => {
        const { fotoFrente, fotoLado, ...rest } = r;
        return rest;
    });
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fittrack-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function clearAllData() {
    if (!confirm('Tem certeza? Esta ação não pode ser desfeita!')) return;
    if (!confirm('Última chance! Todos os dados serão perdidos permanentemente!')) return;
    
    localStorage.removeItem(CONFIG.storageKeys.config);
    localStorage.removeItem(CONFIG.storageKeys.registros);
    localStorage.removeItem(CONFIG.storageKeys.treinos);
    localStorage.removeItem(CONFIG.storageKeys.treinoCheckins);
    
    // Limpar IndexedDB
    if (db) {
        const transaction = db.transaction(['photos'], 'readwrite');
        const store = transaction.objectStore('photos');
        store.clear();
    }
    
    location.reload();
}

// ==================== MODAIS ====================

function showModal(modalId, message = '') {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    if (message && modalId === 'modal-success') {
        document.getElementById('modal-success-message').textContent = message;
    }
    
    modal.classList.add('active');
}

function closeModal() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.classList.remove('active');
    });
}

// Fechar modal ao clicar fora
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
});

// ==================== SERVICE WORKER ====================

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        const swPath = './service-worker.js';
        navigator.serviceWorker.register(swPath)
            .then(reg => console.log('Service Worker registrado:', reg.scope))
            .catch(err => console.log('Erro ao registrar Service Worker:', err));
    }
}

// ==================== NOTIFICAÇÕES ====================

function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

function scheduleNotifications() {
    const config = getConfig();
    if (!config.lembreteAtivo) return;
    
    // Implementação básica - notificações seriam agendadas aqui
    // Em produção, usaria Service Worker para notificações agendadas
}

// ==================== INICIALIZAÇÃO FINAL ====================

