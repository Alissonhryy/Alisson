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
        pesoAtual: null,
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
    // Verificar onboarding - só aparece no primeiro acesso
    const onboardingComplete = localStorage.getItem('onboarding_complete');
    
    if (!onboardingComplete || onboardingComplete !== 'true') {
        // Mostrar onboarding apenas se não foi completado
        showOnboarding();
        return; // Não carregar app ainda
    }
    
    // Esconder onboarding se já foi completado
    const onboarding = document.getElementById('onboarding');
    if (onboarding) {
        onboarding.classList.add('hidden');
    }
    
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
    
    // Setup notificações
    setupNotifications();
    
    // Verificar achievements
    checkAchievements();
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
    
    // Formulário de adicionar registro do modal
    const modalAddForm = document.getElementById('modal-add-registro-form');
    if (modalAddForm) {
        modalAddForm.addEventListener('submit', handleModalAddRegistroSubmit);
    }
    
    // Validação em tempo real
    document.getElementById('registro-peso').addEventListener('blur', validatePeso);
    document.getElementById('registro-sono').addEventListener('blur', validateSono);
    
    // Validação no modal
    const modalPeso = document.getElementById('modal-add-registro-peso');
    const modalSono = document.getElementById('modal-add-registro-sono');
    if (modalPeso) {
        modalPeso.addEventListener('blur', () => validatePesoModal());
    }
    if (modalSono) {
        modalSono.addEventListener('blur', () => validateSonoModal());
    }
    
    // Upload de fotos
    document.getElementById('foto-frente').addEventListener('change', (e) => handlePhotoUpload(e, 'frente'));
    document.getElementById('foto-lado').addEventListener('change', (e) => handlePhotoUpload(e, 'lado'));
    
    // Upload de fotos do modal
    const fotoFrenteModal = document.getElementById('foto-frente-modal');
    const fotoLadoModal = document.getElementById('foto-lado-modal');
    if (fotoFrenteModal) {
        fotoFrenteModal.addEventListener('change', (e) => handlePhotoUploadModal(e, 'frente-modal'));
    }
    if (fotoLadoModal) {
        fotoLadoModal.addEventListener('change', (e) => handlePhotoUploadModal(e, 'lado-modal'));
    }
    
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
    
    // Atualizar visualização dos dias selecionados
    document.querySelectorAll('.workout-day').forEach(cb => {
        cb.addEventListener('change', updateSelectedDaysDisplay);
    });
    
    // Editar registro do modal
    document.querySelector('[data-action="edit-registro-from-modal"]')?.addEventListener('click', editRegistroFromModal);
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
        document.getElementById('config-peso-atual').value = config.pesoAtual || '';
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
    renderBeforeAfter();
    checkPendingNotifications();
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
            <div class="stat-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2v20M2 12h20"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                </svg>
            </div>
            <div class="stat-value">${pesoAtual ? pesoAtual.toFixed(1) : '--'} kg</div>
            <div class="stat-label">Peso Atual</div>
            ${mudancaPeso ? `
                <div class="stat-change ${mudancaPeso < 0 ? 'positive' : mudancaPeso > 0 ? 'negative' : ''}">
                    ${mudancaPeso > 0 ? '↑' : mudancaPeso < 0 ? '↓' : '→'} ${Math.abs(mudancaPeso)} kg
                </div>
            ` : ''}
        </div>
        <div class="stat-card">
            <div class="stat-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <circle cx="12" cy="12" r="6"></circle>
                    <circle cx="12" cy="12" r="2"></circle>
                </svg>
            </div>
            <div class="stat-value">${pesoMeta ? pesoMeta.toFixed(1) : '--'} kg</div>
            <div class="stat-label">Meta de Peso</div>
        </div>
        <div class="stat-card">
            <div class="stat-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"></polyline>
                    <polyline points="16 7 22 7 22 13"></polyline>
                </svg>
            </div>
            <div class="stat-value">${totalPerdido} kg</div>
            <div class="stat-label">Total Perdido</div>
        </div>
        <div class="stat-card">
            <div class="stat-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="7" height="7"></rect>
                    <rect x="14" y="3" width="7" height="7"></rect>
                    <rect x="14" y="14" width="7" height="7"></rect>
                    <rect x="3" y="14" width="7" height="7"></rect>
                </svg>
            </div>
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
    renderCalendar();
    // Limpar formulário para novo registro de hoje
    clearRegistroForm();
}

async function handleRegistroSubmit(e) {
    e.preventDefault();
    
    // Verificar se está editando registro antigo
    const editDate = document.getElementById('registro-form').getAttribute('data-edit-date');
    const data = editDate || new Date().toISOString().split('T')[0];
    
    const peso = parseFloat(document.getElementById('registro-peso').value);
    const cintura = document.getElementById('registro-cintura').value ? 
        parseFloat(document.getElementById('registro-cintura').value) : null;
    const agua = document.getElementById('registro-agua').value ? 
        parseFloat(document.getElementById('registro-agua').value) : null;
    const sono = document.getElementById('registro-sono').value ? 
        parseFloat(document.getElementById('registro-sono').value) : null;
    
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
        sono: sono
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
    clearRegistroForm();
    document.getElementById('registro-form').removeAttribute('data-edit-date');
    
    // Verificar achievements
    checkAchievements();
    
    // Feedback
    showModal('modal-success', 'Registro salvo com sucesso!');
    
    // Atualizar calendário
    renderCalendar();
    
    // Atualizar dashboard
    loadDashboard();
    
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
    
    // Verificar se está editando registro antigo
    const editDate = document.getElementById('registro-form').getAttribute('data-edit-date');
    const data = editDate || new Date().toISOString().split('T')[0];
    
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

// Função renderCalendarMonth movida para seção de melhorias no calendário

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
    const registros = getRegistros();
    const registro = registros.find(r => r.data === dataStr);
    
    if (registro) {
        // Mostrar modal de visualização/edição
        showRegistroModal(dataStr, registro);
    } else {
        // Abrir modal para adicionar registro
        openAddRegistroModal(dataStr);
    }
};

function openAddRegistroModal(dataStr) {
    const modal = document.getElementById('modal-add-registro');
    const dateTitle = document.getElementById('modal-add-registro-date');
    const form = document.getElementById('modal-add-registro-form');
    
    dateTitle.textContent = `Adicionar Registro - ${new Date(dataStr).toLocaleDateString('pt-BR')}`;
    document.getElementById('modal-add-registro-data').value = dataStr;
    
    // Limpar formulário
    form.reset();
    document.getElementById('modal-add-registro-data').value = dataStr;
    
    // Limpar previews
    const previewFrente = document.getElementById('preview-frente-modal');
    const previewLado = document.getElementById('preview-lado-modal');
    const boxFrente = previewFrente?.closest('.photo-upload-box');
    const boxLado = previewLado?.closest('.photo-upload-box');
    
    if (previewFrente) {
        previewFrente.src = '';
        if (boxFrente) boxFrente.classList.remove('has-image');
    }
    if (previewLado) {
        previewLado.src = '';
        if (boxLado) boxLado.classList.remove('has-image');
    }
    
    // Limpar inputs de arquivo
    document.getElementById('foto-frente-modal').value = '';
    document.getElementById('foto-lado-modal').value = '';
    
    modal.classList.add('active');
}

async function showRegistroModal(dataStr, registro) {
    const modal = document.getElementById('modal-registro-view');
    const content = document.getElementById('modal-registro-content');
    const dateTitle = document.getElementById('modal-registro-date');
    
    dateTitle.textContent = new Date(dataStr).toLocaleDateString('pt-BR', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
    
    // Buscar fotos do IndexedDB se necessário
    let fotoFrente = registro.fotoFrente;
    let fotoLado = registro.fotoLado;
    
    if (!fotoFrente) {
        fotoFrente = await getPhotoFromDB('frente', dataStr);
    }
    if (!fotoLado) {
        fotoLado = await getPhotoFromDB('lado', dataStr);
    }
    
    content.innerHTML = `
        <div class="registro-view-info">
            <div class="registro-view-item">
                <span class="registro-view-label">Peso</span>
                <span class="registro-view-value">${registro.peso.toFixed(1)} kg</span>
            </div>
            ${registro.cintura ? `
                <div class="registro-view-item">
                    <span class="registro-view-label">Cintura</span>
                    <span class="registro-view-value">${registro.cintura} cm</span>
                </div>
            ` : ''}
            ${registro.agua ? `
                <div class="registro-view-item">
                    <span class="registro-view-label">Água</span>
                    <span class="registro-view-value">${registro.agua} L</span>
                </div>
            ` : ''}
            ${registro.sono ? `
                <div class="registro-view-item">
                    <span class="registro-view-label">Sono</span>
                    <span class="registro-view-value">${registro.sono} h</span>
                </div>
            ` : ''}
        </div>
        ${(fotoFrente || fotoLado) ? `
            <div class="registro-view-photos">
                ${fotoFrente ? `
                    <div class="registro-view-photo">
                        <img src="${fotoFrente}" alt="Foto Frente">
                    </div>
                ` : '<div></div>'}
                ${fotoLado ? `
                    <div class="registro-view-photo">
                        <img src="${fotoLado}" alt="Foto Lado">
                    </div>
                ` : '<div></div>'}
            </div>
        ` : ''}
    `;
    
    // Armazenar data para edição
    modal.setAttribute('data-edit-date', dataStr);
    
    modal.classList.add('active');
}

function prepareAddRegistroForDate(dataStr) {
    // Esta função prepararia o formulário para adicionar registro em data específica
    // Por enquanto, apenas mostra a seção de registro
}

function clearRegistroForm() {
    document.getElementById('registro-form').reset();
    
    // Limpar previews de foto
    const previewFrente = document.getElementById('preview-frente');
    const previewLado = document.getElementById('preview-lado');
    const boxFrente = previewFrente?.closest('.photo-upload-box');
    const boxLado = previewLado?.closest('.photo-upload-box');
    
    if (previewFrente) {
        previewFrente.src = '';
        if (boxFrente) boxFrente.classList.remove('has-image');
    }
    if (previewLado) {
        previewLado.src = '';
        if (boxLado) boxLado.classList.remove('has-image');
    }
    
    // Limpar inputs de arquivo
    document.getElementById('foto-frente').value = '';
    document.getElementById('foto-lado').value = '';
}

// ==================== HISTÓRICO ====================

let selectedDatesForComparison = [];

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
    
    // Botão de comparação
    const comparisonButton = selectedDatesForComparison.length === 2 ? 
        `<button class="btn btn-primary btn-full mb-20" onclick="showPhotoComparison()">Comparar Fotos Selecionadas</button>` : 
        `<p style="color: var(--text-secondary); text-align: center; margin-bottom: 20px;">Selecione 2 datas para comparar fotos</p>`;
    
    container.innerHTML = comparisonButton + registros
        .sort((a, b) => new Date(b.data) - new Date(a.data))
        .map((registro, index) => {
            const dataFormatada = new Date(registro.data).toLocaleDateString('pt-BR');
            const registroAnterior = index < registros.length - 1 ? registros[registros.length - 2 - index] : null;
            const mudanca = registroAnterior ? (registro.peso - registroAnterior.peso).toFixed(1) : null;
            const isSelected = selectedDatesForComparison.includes(registro.data);
            
            let meta = [];
            if (registro.agua) meta.push(`💧 ${registro.agua}L`);
            if (registro.sono) meta.push(`😴 ${registro.sono}h`);
            if (registro.cintura) meta.push(`📏 ${registro.cintura}cm`);
            
            return `
                <div class="history-item ${isSelected ? 'selected' : ''}" data-date="${registro.data}" onclick="toggleDateForComparison('${registro.data}')">
                    <div>
                        <div class="history-date">${dataFormatada} ${isSelected ? '✓' : ''}</div>
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

window.toggleDateForComparison = function(date) {
    const index = selectedDatesForComparison.indexOf(date);
    if (index > -1) {
        selectedDatesForComparison.splice(index, 1);
    } else {
        if (selectedDatesForComparison.length < 2) {
            selectedDatesForComparison.push(date);
        } else {
            alert('Você pode selecionar no máximo 2 datas para comparação');
            return;
        }
    }
    loadHistorico();
};

async function showPhotoComparison() {
    if (selectedDatesForComparison.length !== 2) return;
    
    const registros = getRegistros();
    const registro1 = registros.find(r => r.data === selectedDatesForComparison[0]);
    const registro2 = registros.find(r => r.data === selectedDatesForComparison[1]);
    
    if (!registro1 || !registro2) return;
    
    // Buscar fotos
    let foto1Frente = registro1.fotoFrente || await getPhotoFromDB('frente', selectedDatesForComparison[0]);
    let foto1Lado = registro1.fotoLado || await getPhotoFromDB('lado', selectedDatesForComparison[0]);
    let foto2Frente = registro2.fotoFrente || await getPhotoFromDB('frente', selectedDatesForComparison[1]);
    let foto2Lado = registro2.fotoLado || await getPhotoFromDB('lado', selectedDatesForComparison[1]);
    
    // Usar frente se disponível, senão lado
    const foto1 = foto1Frente || foto1Lado;
    const foto2 = foto2Frente || foto2Lado;
    
    if (!foto1 || !foto2) {
        alert('Uma ou ambas as datas não possuem fotos para comparação');
        return;
    }
    
    const modal = document.getElementById('modal-photo-comparison');
    const content = document.getElementById('photo-comparison-content');
    
    content.innerHTML = `
        <div class="photo-comparison-grid">
            <div class="photo-comparison-item">
                <img src="${foto1}" alt="Foto 1">
                <div class="date-label">${new Date(selectedDatesForComparison[0]).toLocaleDateString('pt-BR')}</div>
            </div>
            <div class="photo-comparison-item">
                <img src="${foto2}" alt="Foto 2">
                <div class="date-label">${new Date(selectedDatesForComparison[1]).toLocaleDateString('pt-BR')}</div>
            </div>
        </div>
    `;
    
    modal.classList.add('active');
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
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6.5 6.5h11v11h-11z"></path>
                <path d="M6.5 17.5L12 12l5.5 5.5"></path>
                <path d="M12 12L6.5 6.5l5.5 5.5"></path>
            </svg>
            Iniciar Treino
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
                        Status: ${treino.ativo ? 'Ativo' : 'Inativo'}
                    </div>
                </div>
            </div>
            <div class="workout-actions">
                <button class="btn btn-secondary" data-action="edit-workout" data-workout-id="${treino.id}">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                    Editar
                </button>
                <button class="btn btn-danger" data-action="delete-workout" data-workout-id="${treino.id}">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                    Excluir
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
        // Limpar checkboxes
        document.querySelectorAll('.workout-day').forEach(cb => {
            cb.checked = false;
        });
    }
    
    // Atualizar visualização dos dias selecionados
    updateSelectedDaysDisplay();
    
    modal.classList.add('active');
}

function updateSelectedDaysDisplay() {
    const container = document.getElementById('workout-days-selected');
    if (!container) return;
    
    const selectedDays = Array.from(document.querySelectorAll('.workout-day:checked'))
        .map(cb => cb.value);
    
    if (selectedDays.length === 0) {
        container.innerHTML = '<span style="color: var(--text-tertiary); font-size: 13px;">Nenhum dia selecionado</span>';
    } else {
        container.innerHTML = selectedDays.map(day => `
            <span class="selected-day-badge">
                ${day}
                <span class="remove-day" onclick="removeDayFromSelection('${day}')">×</span>
            </span>
        `).join('');
    }
}

window.removeDayFromSelection = function(day) {
    const checkbox = document.querySelector(`.workout-day[value="${day}"]`);
    if (checkbox) {
        checkbox.checked = false;
        updateSelectedDaysDisplay();
    }
};

function editRegistroFromModal() {
    const modal = document.getElementById('modal-registro-view');
    const date = modal.getAttribute('data-edit-date');
    if (!date) return;
    
    closeModal();
    
    // Ir para seção de registro e carregar dados
    const registroNav = document.querySelector('[data-section="registro"]');
    showSection('registro', registroNav);
    
    // Carregar dados do registro
    loadRegistroForEdit(date);
}

async function loadRegistroForEdit(dataStr) {
    const registros = getRegistros();
    const registro = registros.find(r => r.data === dataStr);
    
    if (!registro) return;
    
    document.getElementById('registro-peso').value = registro.peso || '';
    document.getElementById('registro-cintura').value = registro.cintura || '';
    document.getElementById('registro-agua').value = registro.agua || '';
    document.getElementById('registro-sono').value = registro.sono || '';
    
    // Carregar fotos
    const previewFrente = document.getElementById('preview-frente');
    const previewLado = document.getElementById('preview-lado');
    const boxFrente = previewFrente?.closest('.photo-upload-box');
    const boxLado = previewLado?.closest('.photo-upload-box');
    
    let fotoFrente = registro.fotoFrente || await getPhotoFromDB('frente', dataStr);
    let fotoLado = registro.fotoLado || await getPhotoFromDB('lado', dataStr);
    
    if (fotoFrente && previewFrente) {
        previewFrente.src = fotoFrente;
        if (boxFrente) boxFrente.classList.add('has-image');
    }
    if (fotoLado && previewLado) {
        previewLado.src = fotoLado;
        if (boxLado) boxLado.classList.add('has-image');
    }
    
    // Armazenar data para salvar no registro existente
    document.getElementById('registro-form').setAttribute('data-edit-date', dataStr);
}

function addExerciseToEditor(exercise = null, index = null) {
    const container = document.getElementById('workout-exercises-container');
    if (!container) return;
    
    const exerciseIndex = index !== null ? index : container.children.length;
    const hasImage = exercise?.imagem ? 'has-image' : '';
    const imageSrc = exercise?.imagem || '';
    
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
            <div class="form-group">
                <label>Imagem do Exercício</label>
                <div class="exercise-image-upload ${hasImage}" onclick="openExerciseImagePicker(${exerciseIndex})" data-exercise-index="${exerciseIndex}">
                    <svg class="exercise-image-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                        <circle cx="12" cy="13" r="4"></circle>
                    </svg>
                    <div class="exercise-image-label">Adicionar Imagem</div>
                    <img class="exercise-image-preview" src="${imageSrc}" alt="Preview exercício">
                    <button type="button" class="exercise-image-remove" onclick="event.stopPropagation(); removeExerciseImage(${exerciseIndex})">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <input type="file" class="exercise-image-input" data-exercise-index="${exerciseIndex}" accept="image/*" style="display: none;">
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
    
    // Setup image input
    const imageInput = container.querySelector(`.exercise-image-input[data-exercise-index="${exerciseIndex}"]`);
    if (imageInput) {
        imageInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                const base64 = await compressImage(file);
                updateExerciseImagePreview(exerciseIndex, base64);
            }
        });
    }
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
    const exercicios = Array.from(exercisesContainer.children).map((exEl, idx) => {
        const preview = exEl.querySelector('.exercise-image-preview');
        const imagem = preview && preview.src && !preview.src.includes('data:image/svg') ? preview.src : null;
        return {
            id: `ex-${Date.now()}-${Math.random()}-${idx}`,
            nome: exEl.querySelector('.exercise-nome').value,
            series: parseInt(exEl.querySelector('.exercise-series').value) || 0,
            repeticoes: exEl.querySelector('.exercise-repeticoes').value || '',
            descanso: parseInt(exEl.querySelector('.exercise-descanso').value) || 0,
            carga: exEl.querySelector('.exercise-carga').value || '',
            imagem: imagem
        };
    });
    
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
        pesoAtual: document.getElementById('config-peso-atual').value ? 
            parseFloat(document.getElementById('config-peso-atual').value) : null,
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
    
    showModal('modal-success', 'Configurações salvas!');
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

// ==================== FOTO UPLOAD FUNCTIONS ====================

let currentPhotoType = null;

window.openPhotoOptions = function(type) {
    currentPhotoType = type;
    document.getElementById('photo-options-backdrop').classList.add('active');
    document.getElementById('photo-options-modal').classList.add('active');
};

window.closePhotoOptions = function() {
    document.getElementById('photo-options-backdrop').classList.remove('active');
    document.getElementById('photo-options-modal').classList.remove('active');
    currentPhotoType = null;
};

window.selectPhotoFromGallery = function() {
    let inputId;
    if (currentPhotoType === 'frente' || currentPhotoType === 'frente-modal') {
        inputId = currentPhotoType === 'frente-modal' ? 'foto-frente-modal' : 'foto-frente';
    } else {
        inputId = currentPhotoType === 'lado-modal' ? 'foto-lado-modal' : 'foto-lado';
    }
    const input = document.getElementById(inputId);
    if (input) {
        input.removeAttribute('capture');
        input.click();
    }
    closePhotoOptions();
};

window.takePhoto = function() {
    let inputId;
    if (currentPhotoType === 'frente' || currentPhotoType === 'frente-modal') {
        inputId = currentPhotoType === 'frente-modal' ? 'foto-frente-modal' : 'foto-frente';
    } else {
        inputId = currentPhotoType === 'lado-modal' ? 'foto-lado-modal' : 'foto-lado';
    }
    const input = document.getElementById(inputId);
    if (input) {
        input.setAttribute('capture', 'environment');
        input.click();
    }
    closePhotoOptions();
};

window.removePhoto = function(type) {
    const previewId = type === 'frente' ? 'preview-frente' : 'preview-lado';
    const preview = document.getElementById(previewId);
    const box = preview.closest('.photo-upload-box');
    const input = document.getElementById(`foto-${type}`);
    
    preview.src = '';
    box.classList.remove('has-image');
    input.value = '';
};

// Atualizar preview quando foto for selecionada
document.addEventListener('change', async (e) => {
    if (e.target.id === 'foto-frente' || e.target.id === 'foto-lado') {
        const file = e.target.files[0];
        if (file) {
            const type = e.target.id.replace('foto-', '');
            const previewId = `preview-${type}`;
            const preview = document.getElementById(previewId);
            if (preview) {
                const box = preview.closest('.photo-upload-box');
                
                const base64 = await compressImage(file);
                preview.src = base64;
                if (box) {
                    box.classList.add('has-image');
                }
            }
        }
    }
    
    // Fotos do modal
    if (e.target.id === 'foto-frente-modal' || e.target.id === 'foto-lado-modal') {
        const file = e.target.files[0];
        if (file) {
            const type = e.target.id.replace('foto-', '').replace('-modal', '');
            const previewId = `preview-${type}-modal`;
            const preview = document.getElementById(previewId);
            if (preview) {
                const box = preview.closest('.photo-upload-box');
                
                const base64 = await compressImage(file);
                preview.src = base64;
                if (box) {
                    box.classList.add('has-image');
                }
            }
        }
    }
});

async function handlePhotoUploadModal(e, type) {
    const file = e.target.files[0];
    if (!file) return;
    
    const previewId = type === 'frente-modal' ? 'preview-frente-modal' : 'preview-lado-modal';
    const preview = document.getElementById(previewId);
    
    if (preview) {
        const base64 = await compressImage(file);
        preview.src = base64;
        const box = preview.closest('.photo-upload-box');
        if (box) {
            box.classList.add('has-image');
        }
    }
}

window.openPhotoOptionsModal = function(type) {
    currentPhotoType = type;
    document.getElementById('photo-options-backdrop').classList.add('active');
    document.getElementById('photo-options-modal').classList.add('active');
};

window.removePhotoModal = function(type) {
    const previewId = type === 'frente-modal' ? 'preview-frente-modal' : 'preview-lado-modal';
    const preview = document.getElementById(previewId);
    const box = preview?.closest('.photo-upload-box');
    const inputId = type === 'frente-modal' ? 'foto-frente-modal' : 'foto-lado-modal';
    const input = document.getElementById(inputId);
    
    if (preview) {
        preview.src = '';
        if (box) box.classList.remove('has-image');
    }
    if (input) {
        input.value = '';
    }
};

function validatePesoModal() {
    const pesoInput = document.getElementById('modal-add-registro-peso');
    const peso = parseFloat(pesoInput.value);
    const data = document.getElementById('modal-add-registro-data').value;
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
            document.getElementById('modal-peso-error').textContent = 
                'Peso não pode variar mais de 10kg de um dia para outro';
            return { valid: false };
        }
    }
    
    pesoInput.classList.remove('invalid');
    pesoInput.classList.add('valid');
    document.getElementById('modal-peso-error').textContent = '';
    return { valid: true };
}

function validateSonoModal() {
    const sonoInput = document.getElementById('modal-add-registro-sono');
    const sono = parseFloat(sonoInput.value);
    
    if (sono && sono > 24) {
        sonoInput.classList.add('invalid');
        sonoInput.classList.remove('valid');
        document.getElementById('modal-sono-error').textContent = 'Sono não pode ser maior que 24 horas';
        return { valid: false };
    }
    
    sonoInput.classList.remove('invalid');
    sonoInput.classList.add('valid');
    document.getElementById('modal-sono-error').textContent = '';
    return { valid: true };
}

async function handleModalAddRegistroSubmit(e) {
    e.preventDefault();
    
    const data = document.getElementById('modal-add-registro-data').value;
    const peso = parseFloat(document.getElementById('modal-add-registro-peso').value);
    const cintura = document.getElementById('modal-add-registro-cintura').value ? 
        parseFloat(document.getElementById('modal-add-registro-cintura').value) : null;
    const agua = document.getElementById('modal-add-registro-agua').value ? 
        parseFloat(document.getElementById('modal-add-registro-agua').value) : null;
    const sono = document.getElementById('modal-add-registro-sono').value ? 
        parseFloat(document.getElementById('modal-add-registro-sono').value) : null;
    
    // Validações
    const validacaoPeso = validatePesoModal();
    if (!validacaoPeso.valid) {
        return;
    }
    
    const validacaoSono = validateSonoModal();
    if (!validacaoSono.valid) {
        return;
    }
    
    // Buscar registros
    const registros = getRegistros();
    
    const novoRegistro = {
        data: data,
        peso: peso,
        cintura: cintura,
        agua: agua,
        sono: sono
    };
    
    // Salvar fotos
    const fotoFrenteInput = document.getElementById('foto-frente-modal');
    const fotoLadoInput = document.getElementById('foto-lado-modal');
    
    if (fotoFrenteInput.files.length > 0) {
        const fotoFrenteBase64 = await compressImage(fotoFrenteInput.files[0]);
        novoRegistro.fotoFrente = fotoFrenteBase64;
        await savePhotoToDB('frente', data, fotoFrenteBase64);
    }
    
    if (fotoLadoInput.files.length > 0) {
        const fotoLadoBase64 = await compressImage(fotoLadoInput.files[0]);
        novoRegistro.fotoLado = fotoLadoBase64;
        await savePhotoToDB('lado', data, fotoLadoBase64);
    }
    
    // Verificar se já existe registro para esta data
    const indexExistente = registros.findIndex(r => r.data === data);
    
    if (indexExistente >= 0) {
        registros[indexExistente] = novoRegistro;
    } else {
        registros.push(novoRegistro);
    }
    
    // Ordenar por data
    registros.sort((a, b) => new Date(a.data) - new Date(b.data));
    
    saveRegistros(registros);
    
    // Fechar modal
    closeModal();
    
    // Verificar achievements
    checkAchievements();
    
    // Feedback
    showModal('modal-success', 'Registro salvo com sucesso!');
    
    // Atualizar calendário e dashboard
    renderCalendar();
    loadDashboard();
}

// ==================== EXERCISE IMAGE FUNCTIONS ====================

window.openExerciseImagePicker = function(exerciseIndex) {
    const input = document.querySelector(`.exercise-image-input[data-exercise-index="${exerciseIndex}"]`);
    if (input) {
        input.click();
    }
};

window.updateExerciseImagePreview = function(exerciseIndex, base64) {
    const container = document.querySelector(`[data-exercise-index="${exerciseIndex}"]`);
    if (!container) return;
    
    const uploadBox = container.querySelector('.exercise-image-upload');
    const preview = container.querySelector('.exercise-image-preview');
    
    if (preview && uploadBox) {
        preview.src = base64;
        uploadBox.classList.add('has-image');
    }
};

window.removeExerciseImage = function(exerciseIndex) {
    const container = document.querySelector(`[data-exercise-index="${exerciseIndex}"]`);
    if (!container) return;
    
    const uploadBox = container.querySelector('.exercise-image-upload');
    const preview = container.querySelector('.exercise-image-preview');
    const input = container.querySelector('.exercise-image-input');
    
    if (preview && uploadBox && input) {
        preview.src = '';
        uploadBox.classList.remove('has-image');
        input.value = '';
    }
};

// ==================== ONBOARDING ====================

let currentOnboardingSlide = 1;
const totalOnboardingSlides = 4;

function showOnboarding() {
    const onboarding = document.getElementById('onboarding');
    if (onboarding) {
        onboarding.classList.remove('hidden');
        currentOnboardingSlide = 1;
        updateOnboardingSlide(1);
    }
}

function updateOnboardingSlide(slide) {
    document.querySelectorAll('.onboarding-slide').forEach(s => s.classList.remove('active'));
    const currentSlide = document.querySelector(`.onboarding-slide[data-slide="${slide}"]`);
    if (currentSlide) {
        currentSlide.classList.add('active');
    }
    
    // Atualizar progress dots
    document.querySelectorAll('.onboarding-dot').forEach((dot, index) => {
        dot.classList.toggle('active', index === slide - 1);
    });
}

window.nextOnboardingSlide = function() {
    if (currentOnboardingSlide < totalOnboardingSlides) {
        currentOnboardingSlide++;
        updateOnboardingSlide(currentOnboardingSlide);
    }
};

window.prevOnboardingSlide = function() {
    if (currentOnboardingSlide > 1) {
        currentOnboardingSlide--;
        updateOnboardingSlide(currentOnboardingSlide);
    }
};

window.completeOnboarding = function(action) {
    // Salvar configurações do onboarding
    const config = {
        nome: document.getElementById('onboarding-nome')?.value || '',
        pesoAtual: document.getElementById('onboarding-peso-atual')?.value ? 
            parseFloat(document.getElementById('onboarding-peso-atual').value) : null,
        pesoMeta: document.getElementById('onboarding-peso-meta')?.value ? 
            parseFloat(document.getElementById('onboarding-peso-meta').value) : null,
        prazoMeta: document.getElementById('onboarding-prazo-meta')?.value ? 
            parseInt(document.getElementById('onboarding-prazo-meta').value) : null,
        temaEscuro: document.getElementById('onboarding-tema-escuro')?.checked !== false,
        lembreteAtivo: document.getElementById('onboarding-lembrete')?.checked || false,
        lembreteHorario: document.getElementById('onboarding-horario')?.value || '08:00'
    };
    
    saveConfig(config);
    
    // Aplicar tema
    document.documentElement.setAttribute('data-theme', config.temaEscuro ? 'dark' : 'light');
    
    // Marcar onboarding como completo
    localStorage.setItem('onboarding_complete', 'true');
    
    // Esconder onboarding
    document.getElementById('onboarding').classList.add('hidden');
    
    // Inicializar app
    initializeAppAfterOnboarding();
    
    // Navegar conforme ação
    if (action === 'register') {
        const registroNav = document.querySelector('[data-section="registro"]');
        showSection('registro', registroNav);
    } else {
        const dashboardNav = document.querySelector('[data-section="dashboard"]');
        showSection('dashboard', dashboardNav);
    }
};

async function initializeAppAfterOnboarding() {
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
    
    // Setup notificações
    setupNotifications();
}

// ==================== ACHIEVEMENTS ====================

const ACHIEVEMENTS = {
    firstRecord: { icon: '🎯', title: 'Primeiro Passo', description: 'Você registrou seu primeiro peso!' },
    weekStreak: { icon: '🔥', title: '7 Dias de Fogo', description: '7 dias seguidos registrando!' },
    monthStreak: { icon: '💪', title: 'Máquina de Disciplina', description: '30 dias sem faltar!' },
    weightLoss5kg: { icon: '🏆', title: '5kg Perdidos', description: 'Você perdeu 5kg! Continue assim!' },
    weightLoss10kg: { icon: '👑', title: '10kg Perdidos', description: 'Incrível! 10kg perdidos!' },
    weeklyGoal: { icon: '⭐', title: 'Meta Semanal', description: 'Meta semanal atingida!' },
    monthlyGoal: { icon: '🌟', title: 'Meta Mensal', description: 'Meta mensal atingida!' },
    finalGoal: { icon: '🎉', title: 'Meta Final', description: 'Parabéns! Você atingiu sua meta final!' }
};

function checkAchievements() {
    const registros = getRegistros();
    if (registros.length === 0) return;
    
    const achievements = JSON.parse(localStorage.getItem('fittrack_achievements') || '[]');
    
    // Primeiro registro
    if (registros.length === 1 && !achievements.includes('firstRecord')) {
        unlockAchievement('firstRecord');
    }
    
    // Streak de 7 dias
    const streak = calculateStreak(registros);
    if (streak >= 7 && !achievements.includes('weekStreak')) {
        unlockAchievement('weekStreak');
    }
    
    // Streak de 30 dias
    if (streak >= 30 && !achievements.includes('monthStreak')) {
        unlockAchievement('monthStreak');
    }
    
    // Perda de peso
    const primeiroPeso = registros[0].peso;
    const ultimoPeso = registros[registros.length - 1].peso;
    const perdaTotal = primeiroPeso - ultimoPeso;
    
    if (perdaTotal >= 5 && !achievements.includes('weightLoss5kg')) {
        unlockAchievement('weightLoss5kg');
    }
    
    if (perdaTotal >= 10 && !achievements.includes('weightLoss10kg')) {
        unlockAchievement('weightLoss10kg');
    }
    
    // Metas
    const config = getConfig();
    if (config.pesoMeta && ultimoPeso <= config.pesoMeta && !achievements.includes('finalGoal')) {
        unlockAchievement('finalGoal');
    }
}

function calculateStreak(registros) {
    if (registros.length === 0) return 0;
    
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
    
    return streak;
}

function unlockAchievement(achievementKey) {
    const achievements = JSON.parse(localStorage.getItem('fittrack_achievements') || '[]');
    if (achievements.includes(achievementKey)) return;
    
    achievements.push(achievementKey);
    localStorage.setItem('fittrack_achievements', JSON.stringify(achievements));
    
    const achievement = ACHIEVEMENTS[achievementKey];
    if (achievement) {
        showAchievementModal(achievement);
    }
}

function showAchievementModal(achievement) {
    document.getElementById('achievement-icon').textContent = achievement.icon;
    document.getElementById('achievement-title').textContent = achievement.title;
    document.getElementById('achievement-description').textContent = achievement.description;
    document.getElementById('achievement-modal').classList.add('active');
    
    // Vibração
    if (navigator.vibrate) {
        navigator.vibrate([200, 100, 200]);
    }
}

window.closeAchievementModal = function() {
    document.getElementById('achievement-modal').classList.remove('active');
};

// ==================== MELHORIAS NO CALENDÁRIO ====================

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
            <button class="calendar-nav" onclick="navigateCalendar(-1)" aria-label="Mês anterior">←</button>
            <h3>${nomesMeses[mes]} ${ano}</h3>
            <button class="calendar-nav" onclick="navigateCalendar(1)" aria-label="Próximo mês">→</button>
        </div>
        <div class="calendar-grid" role="grid">
    `;
    
    // Dias da semana
    nomesDias.forEach(dia => {
        html += `<div class="calendar-day-name" role="columnheader">${dia}</div>`;
    });
    
    // Espaços vazios antes do primeiro dia
    for (let i = 0; i < diaSemanaInicio; i++) {
        html += `<div class="calendar-day"></div>`;
    }
    
    // Dias do mês
    for (let dia = 1; dia <= diasNoMes; dia++) {
        const dataStr = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
        const registro = registros.find(r => r.data === dataStr);
        const temRegistro = !!registro;
        const temTreino = checkins.some(c => c.data === dataStr && c.concluido);
        const temFoto = registro && (registro.fotoFrente || registro.fotoLado);
        const eHoje = dataStr === hoje;
        
        // Calcular mudança de peso
        let mudancaPeso = null;
        if (registro) {
            const registrosAntes = registros.filter(r => r.data < dataStr).sort((a, b) => new Date(b.data) - new Date(a.data));
            if (registrosAntes.length > 0) {
                mudancaPeso = registro.peso - registrosAntes[0].peso;
            }
        }
        
        let classes = 'calendar-day';
        if (eHoje) classes += ' today';
        if (temRegistro) classes += ' has-record';
        if (temTreino) classes += ' has-workout';
        if (temFoto) classes += ' has-photo';
        if (mudancaPeso !== null) {
            if (mudancaPeso < 0) classes += ' weight-down';
            else if (mudancaPeso > 0) classes += ' weight-up';
        }
        
        html += `
            <div class="${classes}" data-date="${dataStr}" onclick="selectCalendarDate('${dataStr}')" 
                 role="gridcell" aria-label="${new Date(dataStr).toLocaleDateString('pt-BR')}${temRegistro ? ' - Com registro' : ''}">
                ${dia}
            </div>
        `;
    }
    
    html += '</div>';
    container.innerHTML = html;
}

// ==================== MELHORIAS NO GRÁFICO ====================

function renderChart(periodDays = 30) {
    const canvas = document.getElementById('weight-chart');
    if (!canvas) return;
    
    const registros = getRegistros();
    const config = getConfig();
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
    
    // Desenhar linha da meta se existir
    if (config.pesoMeta) {
        const metaY = padding + chartHeight - ((config.pesoMeta - minPeso) / range) * chartHeight;
        if (metaY >= padding && metaY <= height - padding) {
            ctx.strokeStyle = '#007AFF';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(padding, metaY);
            ctx.lineTo(width - padding, metaY);
            ctx.stroke();
            ctx.setLineDash([]);
            
            // Label da meta
            ctx.fillStyle = '#007AFF';
            ctx.font = '12px sans-serif';
            ctx.fillText('Meta', width - padding - 40, metaY - 5);
        }
    }
    
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
    
    // Adicionar texto motivacional
    renderMotivationalText(filteredRegistros, periodDays);
}

function renderMotivationalText(registros, periodDays) {
    const container = document.querySelector('.chart-container');
    if (!container) return;
    
    let existingText = container.querySelector('.chart-motivational-text');
    if (existingText) existingText.remove();
    
    if (registros.length < 2) return;
    
    const primeiroPeso = registros[0].peso;
    const ultimoPeso = registros[registros.length - 1].peso;
    const perda = primeiroPeso - ultimoPeso;
    const mediaSemanal = (perda / (periodDays / 7)).toFixed(2);
    
    let text = '';
    let className = '';
    
    if (perda > 0) {
        if (mediaSemanal > 0.5) {
            text = `🎉 Você está no caminho certo! Perdeu ${perda.toFixed(1)}kg nos últimos ${periodDays} dias.`;
            className = 'positive';
        } else {
            text = `Você perdeu ${perda.toFixed(1)}kg. Continue assim! 💪`;
            className = 'positive';
        }
    } else if (perda < 0) {
        text = `Você deu uma pausa, mas ainda dá tempo! 😉`;
        className = 'warning';
    } else {
        text = `Mantenha o foco! Você está estável.`;
    }
    
    if (text) {
        const textEl = document.createElement('div');
        textEl.className = `chart-motivational-text ${className}`;
        textEl.textContent = text;
        container.appendChild(textEl);
    }
}

// ==================== ANTES X DEPOIS ====================

function renderBeforeAfter() {
    const container = document.getElementById('before-after-content');
    if (!container) return;
    
    const registros = getRegistros();
    const registrosComFoto = registros.filter(r => r.fotoFrente || r.fotoLado);
    
    if (registrosComFoto.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">Adicione fotos para ver sua evolução visual</p>';
        return;
    }
    
    const primeiraFoto = registrosComFoto[0];
    const ultimaFoto = registrosComFoto[registrosComFoto.length - 1];
    
    let foto1 = primeiraFoto.fotoFrente || primeiraFoto.fotoLado;
    let foto2 = ultimaFoto.fotoFrente || ultimaFoto.fotoLado;
    
    // Buscar do IndexedDB se necessário
    Promise.all([
        foto1 ? Promise.resolve(foto1) : getPhotoFromDB('frente', primeiraFoto.data),
        foto2 ? Promise.resolve(foto2) : getPhotoFromDB('frente', ultimaFoto.data)
    ]).then(([f1, f2]) => {
        if (!f1 || !f2) {
            container.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">Adicione mais fotos para comparação</p>';
            return;
        }
        
        container.innerHTML = `
            <div class="before-after-grid">
                <div class="before-after-item">
                    <img src="${f1}" alt="Antes">
                    <div class="before-after-label">${new Date(primeiraFoto.data).toLocaleDateString('pt-BR')}</div>
                </div>
                <div class="before-after-item">
                    <img src="${f2}" alt="Depois">
                    <div class="before-after-label">${new Date(ultimaFoto.data).toLocaleDateString('pt-BR')}</div>
                </div>
            </div>
        `;
    });
}

// ==================== NOTIFICAÇÕES ====================

function setupNotifications() {
    const config = getConfig();
    if (!config.lembreteAtivo) return;
    
    // Limpar notificações anteriores
    if (window.notificationTimeout) {
        clearTimeout(window.notificationTimeout);
    }
    
    // Calcular próximo horário
    const [hours, minutes] = config.lembreteHorario.split(':').map(Number);
    const now = new Date();
    const nextNotification = new Date();
    nextNotification.setHours(hours, minutes, 0, 0);
    
    // Se já passou hoje, agendar para amanhã
    if (nextNotification < now) {
        nextNotification.setDate(nextNotification.getDate() + 1);
    }
    
    const msUntilNotification = nextNotification - now;
    
    window.notificationTimeout = setTimeout(() => {
        sendNotification('Hora de registrar seu peso! 💪');
        // Agendar próxima notificação (24h depois)
        setupNotifications();
    }, msUntilNotification);
}

function sendNotification(message) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('FitTrack Pro', {
            body: message,
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            tag: 'fittrack-reminder'
        });
    }
}

// Verificar notificações pendentes
function checkPendingNotifications() {
    const registros = getRegistros();
    const hoje = new Date().toISOString().split('T')[0];
    const temRegistroHoje = registros.some(r => r.data === hoje);
    
    if (!temRegistroHoje && Notification.permission === 'granted') {
        const ultimoRegistro = registros.length > 0 ? registros[registros.length - 1] : null;
        if (ultimoRegistro) {
            const diasSemRegistro = Math.floor((new Date() - new Date(ultimoRegistro.data)) / (1000 * 60 * 60 * 24));
            if (diasSemRegistro >= 2) {
                sendNotification('Você não registra há 2 dias. Que tal registrar agora?');
            }
        }
    }
}

// ==================== INICIALIZAÇÃO FINAL ====================

