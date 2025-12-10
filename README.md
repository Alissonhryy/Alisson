
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="apple-mobile-web-app-title" content="Foco & Peso">
    
    <title>Foco & Peso V14</title>
    
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

    <style>
        :root {
            --bg-color: #050505;
            --card-bg: #141414;
            --accent-color: #00D084;
            --accent-dim: rgba(0, 208, 132, 0.1);
            --text-color: #ffffff;
            --text-muted: #888888;
            --border-color: #262626;
        }
        
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }

        /* FIX PARA IOS - TELA CHEIA TRAVADA */
        html, body {
            margin: 0; padding: 0;
            width: 100%; height: 100%;
            background-color: var(--bg-color);
            color: var(--text-color);
            font-family: 'Poppins', sans-serif;
            overflow: hidden; /* Impede a página toda de rolar */
            position: fixed; /* Trava o corpo */
        }

        /* CONTAINER PRINCIPAL FLEXÍVEL */
        #app-layout {
            position: absolute; top: 0; left: 0; right: 0; bottom: 0;
            display: flex; flex-direction: column;
            padding-bottom: env(safe-area-inset-bottom); /* Proteção iPhone X+ */
        }

        /* ÁREA DE ROLAGEM */
        .content { 
            flex: 1; /* Ocupa todo espaço disponível */
            overflow-y: scroll; /* Força barra de rolagem */
            -webkit-overflow-scrolling: touch; /* ROLAGEM SUAVE NO IPHONE */
            padding: 20px; 
            padding-bottom: 90px; /* Espaço para nav bar */
            padding-top: max(20px, env(safe-area-inset-top)); /* Espaço topo iPhone */
        }

        .tab { display: none; animation: fadeUp 0.3s ease; }
        .tab.active { display: block; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }

        /* HEADER */
        .header-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .app-title { font-size: 1.2rem; font-weight: 700; background: linear-gradient(to right, #fff, #888); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .btn-config { background: none; border: none; color: #666; font-size: 1.2rem; cursor: pointer; padding: 5px; }

        /* DASHBOARD */
        .header-widgets { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 30px; }
        .widget-card {
            background: var(--card-bg); border-radius: 18px; padding: 15px;
            border: 1px solid var(--border-color); display: flex; flex-direction: column;
            justify-content: center; align-items: center; text-align: center;
        }
        .widget-card.wide { grid-column: span 2; align-items: flex-start; text-align: left; }
        .widget-label { font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600; margin-bottom: 4px; }
        .widget-value { font-size: 1.5rem; font-weight: 700; color: white; }
        .progress-container { width: 100%; margin-top: 10px; background: #222; height: 6px; border-radius: 3px; overflow: hidden; }
        .progress-fill { background: var(--accent-color); height: 100%; width: 0%; border-radius: 3px; }

        /* CALENDÁRIO */
        .calendar-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .btn-icon { background: var(--card-bg); border: 1px solid var(--border-color); color: white; width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; cursor: pointer; }
        
        .calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; margin-bottom: 25px; }
        .weekday { text-align: center; font-size: 0.7rem; color: #555; font-weight: 600; margin-bottom: 5px; }
        
        .day-cell {
            aspect-ratio: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
            border-radius: 12px; font-size: 0.9rem; cursor: pointer; position: relative; 
            background-color: #0F0F0F; border: 1px solid transparent; transition: 0.2s;
        }
        .day-cell.today { border-color: var(--accent-color); color: var(--accent-color); }
        .day-cell.selected { background-color: var(--accent-color); color: #000; font-weight: 700; }
        .day-cell.has-record::after {
            content: ''; width: 4px; height: 4px; background-color: var(--accent-color);
            border-radius: 50%; position: absolute; bottom: 5px;
        }
        .day-cell.selected.has-record::after { background-color: black; }

        /* DETALHES DO DIA */
        .day-details {
            background: var(--card-bg); border-radius: 18px; padding: 15px; 
            border: 1px solid var(--border-color); margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; min-height: 80px;
        }
        .detail-info { display: flex; flex-direction: column; gap: 4px; }
        .detail-stats-row { display: flex; gap: 10px; font-size: 0.75rem; color: #888; }
        .detail-thumbs { display: flex; gap: 8px; }
        .mini-thumb { width: 45px; height: 45px; border-radius: 8px; object-fit: cover; border: 1px solid #333; background: #000; }

        /* GRÁFICO */
        .chart-wrapper { background: var(--card-bg); padding: 10px; border-radius: 18px; border: 1px solid #222; height: 250px; }

        /* GALERIA & SELEÇÃO */
        .gallery-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; padding-bottom: 60px; }
        .gallery-item { position: relative; cursor: pointer; transition: 0.2s; border-radius: 8px; overflow: hidden; aspect-ratio: 1; border: 2px solid transparent;}
        .gallery-item img { width: 100%; height: 100%; object-fit: cover; }
        .gallery-item.selected { border-color: var(--accent-color); transform: scale(0.95); opacity: 0.8; }
        .gallery-overlay {
            position: absolute; bottom: 0; left: 0; width: 100%;
            background: linear-gradient(to top, rgba(0,0,0,0.9), transparent);
            color: white; font-size: 0.65rem; padding: 4px; text-align: center;
        }
        .btn-compare-float {
            position: fixed; bottom: 100px; left: 50%; transform: translateX(-50%);
            background: var(--accent-color); color: #000; padding: 12px 25px; border-radius: 30px;
            font-weight: 700; border: none; box-shadow: 0 5px 20px rgba(0,208,132,0.4); display: none; z-index: 201;
        }

        /* INPUTS & FORM */
        .input-box { width: 100%; padding: 15px; background: var(--card-bg); border: 1px solid var(--border-color); color: white; font-size: 1.4rem; border-radius: 14px; text-align: center; margin-bottom: 20px; font-family: 'Poppins', sans-serif; }
        .tags-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 25px; }
        .tag-option { background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 12px; padding: 10px 5px; text-align: center; display: flex; flex-direction: column; gap: 5px; cursor: pointer; }
        .tag-option.active { background: var(--accent-dim); border-color: var(--accent-color); }
        .tag-option i { font-size: 1.1rem; color: #666; } .tag-option.active i { color: var(--accent-color); }
        .tag-option span { font-size: 0.6rem; color: #888; }

        /* UPLOAD AREA */
        .photo-upload-row { display: flex; gap: 10px; margin-bottom: 20px; }
        .photo-box {
            flex: 1; height: 100px; background: #1a1a1a; border-radius: 12px; border: 1px dashed #444;
            display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; cursor: pointer;
        }
        .photo-box img { position: absolute; width: 100%; height: 100%; object-fit: cover; display: none; z-index: 1; }
        
        .btn-download-img {
            position: absolute; top: 5px; right: 5px; background: rgba(0,0,0,0.6); 
            color: white; border: none; border-radius: 50%; width: 25px; height: 25px;
            display: none; align-items: center; justify-content: center; z-index: 2; font-size: 0.8rem;
        }

        /* NAV */
        .bottom-nav { 
            position: absolute; bottom: 0; left: 0; width: 100%; height: 75px; 
            background: rgba(5,5,5,0.95); backdrop-filter: blur(10px); 
            border-top: 1px solid #222; display: flex; z-index: 100; 
            padding-bottom: env(safe-area-inset-bottom);
        }
        .nav-item { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #555; font-size: 0.7rem; cursor: pointer; }
        .nav-item.active { color: var(--accent-color); }
        .nav-item i { font-size: 1.4rem; margin-bottom: 4px; }

        /* MODAIS */
        .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.95); z-index: 200; align-items: center; justify-content: center; }
        .modal-content { background: #111; padding: 20px; border-radius: 20px; width: 95%; max-width: 400px; border: 1px solid #333; max-height: 90vh; overflow-y: auto; text-align: center; -webkit-overflow-scrolling: touch; }
        .btn-full { width: 100%; padding: 14px; background: var(--accent-color); color: #000; font-weight: 700; border: none; border-radius: 12px; margin-top: 10px; cursor: pointer; }
        .config-input { width: 100%; padding: 10px; background: #222; border: 1px solid #333; color: white; border-radius: 8px; margin-bottom: 10px; text-align: center; }

    </style>
</head>
<body>

    <div id="app-layout">
        
        <div class="content">
            <div class="header-top">
                <span class="app-title">Foco & Peso</span>
                <button class="btn-config" onclick="abrirConfig()"><i class="fa-solid fa-gear"></i></button>
            </div>

            <div class="header-widgets">
                <div class="widget-card wide">
                    <span class="widget-label">Progresso</span>
                    <div style="display:flex; justify-content:space-between; width:100%; align-items:baseline;">
                        <span class="widget-value" id="dash-peso">--</span>
                        <span style="font-size:0.8rem; color:#666;" id="dash-meta-lbl">Meta: --</span>
                    </div>
                    <div class="progress-container"><div class="progress-fill" id="dash-progresso"></div></div>
                </div>
                <div class="widget-card">
                    <span class="widget-label">Perdido</span>
                    <span class="widget-value" id="dash-perdido" style="color:var(--accent-color);">--</span>
                </div>
                <div class="widget-card">
                    <span class="widget-label">Streak</span>
                    <div style="display:flex; align-items:center; gap:5px;">
                        <i class="fa-solid fa-fire" style="color:#FF5722;"></i>
                        <span class="widget-value" id="dash-streak">0</span>
                    </div>
                </div>
            </div>

            <div id="tab-calendario" class="tab active">
                <div class="calendar-header">
                    <button class="btn-icon" onclick="mudarMes(-1)"><i class="fa-solid fa-chevron-left"></i></button>
                    <h2 id="mes-ano-label" style="font-size:0.9rem; margin:0; font-weight:600;">--</h2>
                    <button class="btn-icon" onclick="mudarMes(1)"><i class="fa-solid fa-chevron-right"></i></button>
                </div>

                <div class="calendar-grid" id="grid-calendario"></div>

                <div id="detalhes-dia" class="day-details">
                    <p style="color:#555; text-align:center; width:100%;">Selecione um dia.</p>
                </div>

                <h3 style="font-size:0.8rem; color:#666; margin-top:20px;">EVOLUÇÃO</h3>
                <div class="chart-wrapper">
                    <canvas id="weightChart"></canvas>
                </div>
            </div>

            <div id="tab-diario" class="tab">
                <div style="text-align:center; margin-bottom:15px;">
                    <h2 style="margin:0; font-size:1.1rem;">Registro</h2>
                    <span id="label-data-edicao" style="font-size:0.8rem; color:var(--accent-color);">Hoje</span>
                </div>

                <input type="number" id="input-peso" placeholder="Peso (kg)" class="input-box" inputmode="decimal">

                <div class="photo-upload-row">
                     <div class="photo-box" onclick="triggerFile('file-frente')">
                        <i class="fa-solid fa-camera" style="color:#555;"></i>
                        <img id="preview-frente">
                        <button class="btn-download-img" id="dl-frente" onclick="baixarFoto(event, 'preview-frente')"><i class="fa-solid fa-download"></i></button>
                        <span style="position:absolute; bottom:5px; font-size:0.7rem; color:#666;">Frente</span>
                     </div>
                     <div class="photo-box" onclick="triggerFile('file-lado')">
                        <i class="fa-solid fa-camera" style="color:#555;"></i>
                        <img id="preview-lado">
                        <button class="btn-download-img" id="dl-lado" onclick="baixarFoto(event, 'preview-lado')"><i class="fa-solid fa-download"></i></button>
                        <span style="position:absolute; bottom:5px; font-size:0.7rem; color:#666;">Lado</span>
                     </div>
                </div>
                
                <input type="file" id="file-frente" accept="image/*" style="display:none" onchange="previewImagem(this, 'preview-frente', 'dl-frente')">
                <input type="file" id="file-lado" accept="image/*" style="display:none" onchange="previewImagem(this, 'preview-lado', 'dl-lado')">

                <div class="tags-grid">
                    <div class="tag-option" onclick="toggleTag(this, 'treino')"><i class="fa-solid fa-dumbbell"></i><span>Treino</span></div>
                    <div class="tag-option" onclick="toggleTag(this, 'dieta')"><i class="fa-solid fa-leaf"></i><span>Dieta</span></div>
                    <div class="tag-option" onclick="toggleTag(this, 'agua')"><i class="fa-solid fa-glass-water"></i><span>Água</span></div>
                    <div class="tag-option" onclick="toggleTag(this, 'lixo')"><i class="fa-solid fa-pizza-slice"></i><span>Jaca</span></div>
                    <div class="tag-option" onclick="toggleTag(this, 'sono')"><i class="fa-solid fa-moon"></i><span>Sono</span></div>
                    <div class="tag-option" onclick="toggleTag(this, 'cardio')"><i class="fa-solid fa-person-running"></i><span>Cardio</span></div>
                    <div class="tag-option" onclick="toggleTag(this, 'estresse')"><i class="fa-solid fa-brain"></i><span>Tenso</span></div>
                    <div class="tag-option" onclick="toggleTag(this, 'jejum')"><i class="fa-solid fa-clock"></i><span>Jejum</span></div>
                </div>

                <input type="number" id="input-circ" placeholder="Circunferência (cm)" class="input-box" style="font-size:1.1rem; padding:12px;">

                <button class="btn-full" onclick="salvarRegistro()" id="btn-salvar">SALVAR</button>
            </div>

            <div id="tab-galeria" class="tab">
                <h2 style="text-align:center; font-size:1.1rem;">Galeria</h2>
                <p style="text-align:center; font-size:0.8rem; color:#666; margin-bottom:15px;">Selecione 2 fotos para comparar</p>
                <div id="galeria-container" class="gallery-grid"></div>
                <button id="btn-compare-float" class="btn-compare-float" onclick="compararSelecionados()">COMPARAR (2)</button>
            </div>
        </div>

        <div class="bottom-nav">
            <div class="nav-item active" onclick="irParaTab('tab-calendario', this)">
                <i class="fa-regular fa-calendar-alt"></i><span>Home</span>
            </div>
            <div class="nav-item" onclick="iniciarEdicao(new Date(), true)">
                <div style="background:var(--accent-color); width:48px; height:48px; border-radius:18px; display:flex; align-items:center; justify-content:center; box-shadow:0 0 15px rgba(0,208,132,0.3);">
                    <i class="fa-solid fa-plus" style="color:black; font-size:1.2rem; margin:0;"></i>
                </div>
            </div>
            <div class="nav-item" onclick="abrirGaleriaTab(this)">
                <i class="fa-solid fa-images"></i><span>Galeria</span>
            </div>
        </div>
    </div>

    <div id="modal-config" class="modal">
        <div class="modal-content">
            <h3>Configurações</h3>
            <label style="display:block; color:#888; text-align:left; font-size:0.8rem;">Peso Inicial</label>
            <input type="number" id="cfg-ini" class="config-input">
            <label style="display:block; color:#888; text-align:left; font-size:0.8rem;">Meta</label>
            <input type="number" id="cfg-meta" class="config-input">
            <label style="display:block; color:#888; text-align:left; font-size:0.8rem;">Altura (m)</label>
            <input type="number" id="cfg-altura" class="config-input" placeholder="Ex: 1.75">
            <button class="btn-full" onclick="salvarConfig()">Salvar</button>
            <button onclick="document.getElementById('modal-config').style.display='none'" style="background:none; border:none; color:#666; margin-top:15px;">Cancelar</button>
            <button onclick="exportarDados()" style="display:block; width:100%; margin-top:20px; color:#888; background:none; border:none; font-size:0.8rem;">Fazer Backup</button>
            <input type="file" id="inp-restore" style="display:none" onchange="importarDados(this)">
            <button onclick="document.getElementById('inp-restore').click()" style="display:block; width:100%; margin-top:10px; color:#888; background:none; border:none; font-size:0.8rem;">Restaurar Backup</button>
        </div>
    </div>

    <div id="modal-comparador" class="modal">
        <div class="modal-content" style="max-width:500px;">
            <div style="display:flex; justify-content:space-between; margin-bottom:15px;">
                <h3>Comparação</h3>
                <i class="fa-solid fa-times" onclick="document.getElementById('modal-comparador').style.display='none'" style="color:#666; padding:10px;"></i>
            </div>
            <div style="display:flex; gap:10px;">
                <div style="flex:1;">
                    <img id="comp-img-1" style="width:100%; border-radius:8px; border:1px solid #333; height:200px; object-fit:cover;">
                    <strong id="comp-lbl-1" style="display:block; margin-top:5px; font-size:0.8rem; color:#aaa;">--</strong>
                </div>
                <div style="flex:1;">
                    <img id="comp-img-2" style="width:100%; border-radius:8px; border:1px solid #333; height:200px; object-fit:cover;">
                    <strong id="comp-lbl-2" style="display:block; margin-top:5px; font-size:0.8rem; color:var(--accent-color);">--</strong>
                </div>
            </div>
        </div>
    </div>

    <script>
        // ESTADO GLOBAL
        let CONFIG = { pIni: 88, meta: 65, altura: 1.75 };
        let dataAtual = new Date();
        let dataSel = new Date();
        let dataEdicao = new Date();
        let chart = null;
        let selectedImages = [];

        // INICIALIZAÇÃO
        document.addEventListener('DOMContentLoaded', () => {
            const savedCfg = localStorage.getItem('app_config_v13');
            if(savedCfg) CONFIG = JSON.parse(savedCfg);
            atualizarInterface();
        });

        // --- NÚCLEO ---
        function getHistorico() {
            return JSON.parse(localStorage.getItem('app_peso_db') || '[]').sort((a,b) => b.timestamp - a.timestamp);
        }

        function atualizarInterface() {
            const hist = getHistorico();
            atualizarWidgets(hist);
            renderCalendario(hist);
            renderDetalhes(dataSel, hist);
            renderGrafico(hist);
        }

        function atualizarWidgets(hist) {
            const atual = hist.length ? hist[0].peso : CONFIG.pIni;
            const perdido = (CONFIG.pIni - atual).toFixed(1);
            const pct = ((CONFIG.pIni - atual) / (CONFIG.pIni - CONFIG.meta)) * 100;
            
            document.getElementById('dash-peso').innerText = atual + ' kg';
            document.getElementById('dash-meta-lbl').innerText = 'Meta: ' + CONFIG.meta;
            document.getElementById('dash-perdido').innerText = perdido > 0 ? `-${perdido} kg` : '0 kg';
            document.getElementById('dash-progresso').style.width = Math.max(0, Math.min(100, pct)) + '%';
            
            let streak = 0;
            if(hist.length){
                let hoje = new Date(); hoje.setHours(0,0,0,0);
                let ult = new Date(hist[0].timestamp); ult.setHours(0,0,0,0);
                if((hoje-ult)/86400000 <= 1) {
                    streak=1; let last=ult;
                    for(let i=1; i<hist.length; i++){
                        let d=new Date(hist[i].timestamp); d.setHours(0,0,0,0);
                        if((last-d)/86400000 === 1){ streak++; last=d; } else break;
                    }
                }
            }
            document.getElementById('dash-streak').innerText = streak;
        }

        // --- CALENDÁRIO ---
        function renderCalendario(hist) {
            const grid = document.getElementById('grid-calendario');
            grid.innerHTML = '<div class="weekday">D</div><div class="weekday">S</div><div class="weekday">T</div><div class="weekday">Q</div><div class="weekday">Q</div><div class="weekday">S</div><div class="weekday">S</div>';
            
            const ano = dataAtual.getFullYear();
            const mes = dataAtual.getMonth();
            document.getElementById('mes-ano-label').innerText = dataAtual.toLocaleDateString('pt-BR', {month:'long', year:'numeric'}).toUpperCase();

            const firstDay = new Date(ano, mes, 1).getDay();
            const daysInMonth = new Date(ano, mes + 1, 0).getDate();

            for(let i=0; i<firstDay; i++) grid.appendChild(document.createElement('div'));

            for(let i=1; i<=daysInMonth; i++) {
                let d = new Date(ano, mes, i);
                let dStr = d.toLocaleDateString('pt-BR');
                let has = hist.find(h => h.data === dStr);
                
                let el = document.createElement('div');
                el.className = 'day-cell';
                el.innerText = i;
                if(d.toDateString() === new Date().toDateString()) el.classList.add('today');
                if(d.toDateString() === dataSel.toDateString()) el.classList.add('selected');
                if(has) el.classList.add('has-record');
                
                el.onclick = () => { dataSel = d; renderCalendario(hist); renderDetalhes(d, hist); };
                grid.appendChild(el);
            }
        }

        function renderDetalhes(d, hist) {
            const dStr = d.toLocaleDateString('pt-BR');
            const reg = hist.find(h => h.data === dStr);
            const div = document.getElementById('detalhes-dia');
            
            if(!reg) {
                div.innerHTML = `
                    <div style="text-align:center; width:100%;">
                        <p style="color:#555; font-size:0.9rem; margin-bottom:10px;">Sem registro em ${dStr}</p>
                        <button onclick="iniciarEdicao(new Date(${d.getTime()}))" style="background:#222; border:1px solid #333; color:#ccc; padding:8px 15px; border-radius:10px; cursor:pointer; font-size:0.8rem;">
                            <i class="fa-solid fa-calendar-plus"></i> Adicionar Registro
                        </button>
                    </div>`;
                return;
            }

            // CALCULO IMC
            let imcStr = "--";
            if(CONFIG.altura && CONFIG.altura > 0 && reg.peso > 0) {
                imcStr = (reg.peso / (CONFIG.altura * CONFIG.altura)).toFixed(1);
            }

            let circStr = reg.circ ? `${reg.circ} cm` : "--";

            // Miniaturas
            let thumbsHtml = '';
            if(reg.frente) thumbsHtml += `<img src="${reg.frente}" class="mini-thumb">`;
            if(reg.lado) thumbsHtml += `<img src="${reg.lado}" class="mini-thumb">`;

            div.innerHTML = `
                <div class="detail-info">
                    <strong style="font-size:1.4rem; color:var(--accent-color); line-height:1;">${reg.peso} kg</strong>
                    <div class="detail-stats-row">
                        <span>IMC: ${imcStr}</span>
                        <span>Cintura: ${circStr}</span>
                    </div>
                    <span style="font-size:0.7rem; color:#666;">${dStr}</span>
                </div>
                <div class="detail-thumbs">
                    ${thumbsHtml}
                </div>
                <button onclick="iniciarEdicao(new Date(${d.getTime()}))" style="background:none; border:none; color:#666; margin-left:auto;"><i class="fa-solid fa-pen"></i></button>
            `;
        }

        // --- GRÁFICO ---
        function renderGrafico(hist) {
            const ctx = document.getElementById('weightChart').getContext('2d');
            if(chart) chart.destroy();
            
            let dataAsc = [...hist].sort((a,b) => a.timestamp - b.timestamp).slice(-10);
            
            chart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: dataAsc.map(h => h.data.substring(0,5)),
                    datasets: [{
                        label: 'Peso', data: dataAsc.map(h => h.peso),
                        borderColor: '#00D084', backgroundColor: 'rgba(0,208,132,0.1)',
                        borderWidth: 2, tension: 0.3, fill: true, pointRadius: 4, pointBackgroundColor:'#000', pointBorderColor:'#00D084'
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: {display: false} },
                    scales: {
                        x: { display: true, ticks: { color: '#444', font: {size: 10} }, grid: {display:false} },
                        y: { display: true, ticks: { color: '#444', font: {size: 10} }, grid: {color: '#222'} }
                    }
                }
            });
        }

        // --- GALERIA ---
        function abrirGaleriaTab(el) { irParaTab('tab-galeria', el); renderGaleriaInterativa(); }

        function renderGaleriaInterativa() {
            const hist = getHistorico();
            const grid = document.getElementById('galeria-container');
            grid.innerHTML = '';
            selectedImages = [];
            updateCompareBtn();

            const comFotos = hist.filter(h => h.frente || h.lado);
            if(comFotos.length === 0) { grid.innerHTML = '<p style="color:#666; grid-column:span 3; text-align:center;">Nenhuma foto salva.</p>'; return; }

            let allPhotos = [];
            comFotos.forEach(reg => {
                if(reg.frente) allPhotos.push({ src: reg.frente, data: reg.data, peso: reg.peso, type: 'Frente' });
                if(reg.lado) allPhotos.push({ src: reg.lado, data: reg.data, peso: reg.peso, type: 'Lado' });
            });

            allPhotos.forEach((item, index) => {
                const el = document.createElement('div');
                el.className = 'gallery-item';
                el.onclick = () => toggleSelectImage(index, el, item);
                el.innerHTML = `<img src="${item.src}"><div class="gallery-overlay">${item.data.substring(0,5)} • ${item.peso}kg</div>`;
                grid.appendChild(el);
            });
        }

        function toggleSelectImage(index, el, item) {
            const existingIdx = selectedImages.findIndex(x => x.index === index);
            if(existingIdx >= 0) {
                selectedImages.splice(existingIdx, 1); el.classList.remove('selected');
            } else {
                if(selectedImages.length < 2) { selectedImages.push({ index, item }); el.classList.add('selected'); }
                else {
                    const oldEl = document.querySelectorAll('.gallery-item')[selectedImages[0].index];
                    if(oldEl) oldEl.classList.remove('selected');
                    selectedImages.shift(); selectedImages.push({ index, item }); el.classList.add('selected');
                }
            }
            updateCompareBtn();
        }

        function updateCompareBtn() {
            const btn = document.getElementById('btn-compare-float');
            if(selectedImages.length === 2) {
                btn.style.display = 'block';
                btn.innerText = `COMPARAR (${selectedImages[0].item.data.substring(0,5)} x ${selectedImages[1].item.data.substring(0,5)})`;
            } else { btn.style.display = 'none'; }
        }

        function compararSelecionados() {
            if(selectedImages.length !== 2) return;
            const p1 = selectedImages[0].item; const p2 = selectedImages[1].item;
            document.getElementById('comp-img-1').src = p1.src; document.getElementById('comp-lbl-1').innerText = `${p1.data} - ${p1.peso}kg`;
            document.getElementById('comp-img-2').src = p2.src; document.getElementById('comp-lbl-2').innerText = `${p2.data} - ${p2.peso}kg`;
            document.getElementById('modal-comparador').style.display = 'flex';
        }

        // --- EDICAO ---
        function triggerFile(id) { document.getElementById(id).click(); }
        
        function baixarFoto(e, imgId) {
            e.stopPropagation(); 
            const img = document.getElementById(imgId);
            if(img.src && img.src.startsWith('data:image')) {
                const a = document.createElement('a'); a.href = img.src; a.download = `foto_${Date.now()}.jpg`; a.click();
            } else alert("Sem foto.");
        }

        function iniciarEdicao(d, forceClear = false) {
            dataEdicao = d;
            const dStr = d.toLocaleDateString('pt-BR');
            const ehHoje = new Date().toLocaleDateString('pt-BR') === dStr;
            const labelEl = document.getElementById('label-data-edicao');
            labelEl.innerText = ehHoje ? "Hoje" : `Editando: ${dStr}`;
            labelEl.style.color = ehHoje ? "var(--accent-color)" : "#FFB300";

            if(forceClear) {
                document.getElementById('input-peso').value = '';
                document.getElementById('input-circ').value = '';
                document.getElementById('preview-frente').style.display='none';
                document.getElementById('preview-lado').style.display='none';
                document.getElementById('dl-frente').style.display='none';
                document.getElementById('dl-lado').style.display='none';
                document.getElementById('file-frente').value = ''; 
                document.getElementById('file-lado').value = '';
                document.querySelectorAll('.tag-option').forEach(t => t.classList.remove('active'));
            } else {
                const hist = getHistorico();
                const reg = hist.find(h => h.data === dStr);
                if(reg) {
                    document.getElementById('input-peso').value = reg.peso;
                    document.getElementById('input-circ').value = reg.circ || '';
                    if(reg.frente){ document.getElementById('preview-frente').src=reg.frente; document.getElementById('preview-frente').style.display='block'; }
                    if(reg.lado){ document.getElementById('preview-lado').src=reg.lado; document.getElementById('preview-lado').style.display='block'; }
                    if(reg.tags) {
                        document.querySelectorAll('.tag-option').forEach(t => t.classList.remove('active'));
                        reg.tags.forEach(t => { document.querySelectorAll('.tag-option').forEach(el => { if(el.onclick.toString().includes(`'${t}'`)) el.classList.add('active'); }); });
                    }
                } else {
                    document.getElementById('input-peso').value = '';
                    document.getElementById('input-circ').value = '';
                    document.getElementById('preview-frente').style.display='none';
                    document.getElementById('preview-lado').style.display='none';
                    document.querySelectorAll('.tag-option').forEach(t => t.classList.remove('active'));
                }
            }
            irParaTab('tab-diario');
        }

        async function salvarRegistro() {
            const peso = document.getElementById('input-peso').value;
            if(!peso) return alert('Informe o peso');
            const btn = document.getElementById('btn-salvar');
            btn.innerText = 'SALVANDO...';
            
            const dStr = dataEdicao.toLocaleDateString('pt-BR');
            let hist = getHistorico();
            const antigo = hist.find(h => h.data === dStr);

            const f1 = document.getElementById('file-frente').files[0];
            const f2 = document.getElementById('file-lado').files[0];
            let img1 = f1 ? await compress(f1) : (antigo ? antigo.frente : null);
            let img2 = f2 ? await compress(f2) : (antigo ? antigo.lado : null);
            
            let tags = [];
            document.querySelectorAll('.tag-option.active').forEach(el => tags.push(el.onclick.toString().split("'")[1]));

            hist = hist.filter(h => h.data !== dStr);
            hist.push({ data: dStr, timestamp: dataEdicao.getTime(), peso: parseFloat(peso), circ: document.getElementById('input-circ').value, tags: tags, frente: img1, lado: img2 });

            localStorage.setItem('app_peso_db', JSON.stringify(hist));
            btn.innerText = 'SALVAR';
            irParaTab('tab-calendario', document.querySelectorAll('.nav-item')[0]);
            atualizarInterface();
        }

        // --- UTILS ---
        function abrirConfig(){ 
            document.getElementById('cfg-ini').value = CONFIG.pIni;
            document.getElementById('cfg-meta').value = CONFIG.meta;
            document.getElementById('cfg-altura').value = CONFIG.altura || '';
            document.getElementById('modal-config').style.display='flex'; 
        }
        function salvarConfig(){
            const i = parseFloat(document.getElementById('cfg-ini').value);
            const m = parseFloat(document.getElementById('cfg-meta').value);
            const a = parseFloat(document.getElementById('cfg-altura').value);
            if(i && m) { CONFIG = {pIni:i, meta:m, altura:a}; localStorage.setItem('app_config_v13', JSON.stringify(CONFIG)); atualizarInterface(); document.getElementById('modal-config').style.display='none'; }
        }

        function irParaTab(id, nav) { document.querySelectorAll('.tab').forEach(t => t.classList.remove('active')); document.getElementById(id).classList.add('active'); if(nav) { document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active')); nav.classList.add('active'); } }
        function mudarMes(d){ dataAtual.setMonth(dataAtual.getMonth()+d); renderCalendario(getHistorico()); }
        function toggleTag(e){ e.classList.toggle('active'); }
        function compress(file){ return new Promise(r=>{ const reader=new FileReader(); reader.onload=e=>{ const img=new Image(); img.onload=()=>{ const c=document.createElement('canvas'); const s=600/img.width; c.width=600; c.height=img.height*s; c.getContext('2d').drawImage(img,0,0,c.width,c.height); r(c.toDataURL('image/jpeg',0.6)); }; img.src=e.target.result; }; reader.readAsDataURL(file); }); }
        function previewImagem(inp, id, btnId){ if(inp.files[0]){ const r=new FileReader(); r.onload=e=>{ document.getElementById(id).src=e.target.result; document.getElementById(id).style.display='block'; if(btnId) document.getElementById(btnId).style.display='flex'; }; r.readAsDataURL(inp.files[0]); } }
        function exportarDados(){ const d=localStorage.getItem('app_peso_db'); if(!d) return alert('Sem dados'); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([d],{type:'application/json'})); a.download='backup.json'; a.click(); }
        function importarDados(inp){ const r=new FileReader(); r.onload=e=>{ if(confirm('Restaurar?')){ localStorage.setItem('app_peso_db', e.target.result); location.reload(); }}; r.readAsText(inp.files[0]); }
    </script>
</body>
</html>
