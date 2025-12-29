# 💪 FitTrack Pro

Aplicativo web PWA (Progressive Web App) completo para acompanhamento de peso, medidas corporais e treinos personalizados.

## 🎯 Características

- ✅ **Mobile-first**: Design totalmente otimizado para dispositivos móveis
- ✅ **PWA**: Instalável como aplicativo nativo
- ✅ **Offline**: Funciona completamente offline
- ✅ **Armazenamento Local**: Todos os dados salvos localmente (localStorage + IndexedDB)
- ✅ **Sistema de Treinos**: Criação e execução de treinos personalizados
- ✅ **Gráficos**: Visualização de evolução do peso
- ✅ **Insights Automáticos**: Análise inteligente dos seus dados
- ✅ **Tema Claro/Escuro**: Suporte a ambos os temas
- ✅ **Calendário Interativo**: Visualização e edição de registros

## 🚀 Como Usar

### Instalação Local

1. Clone ou baixe este repositório
2. Abra o arquivo `index.html` em um navegador moderno
3. Ou use um servidor local:
   ```bash
   # Com Python
   python -m http.server 8000
   
   # Com Node.js (http-server)
   npx http-server
   ```

### Instalação como PWA

1. Abra o aplicativo no navegador
2. No mobile: toque no menu do navegador e selecione "Adicionar à tela inicial"
3. No desktop: clique no ícone de instalação na barra de endereços

## 📱 Funcionalidades

### Dashboard
- Cards de estatísticas (peso atual, meta, total perdido, registros)
- Meta semanal inteligente com cálculo automático
- Insights baseados em seus dados
- Gráfico de evolução do peso
- Comparação visual antes/depois com fotos
- Streak de dias consecutivos

### Registro de Dados
- Peso (obrigatório)
- Cintura, água, sono (opcionais)
- Observações
- Fotos de progresso (Frente e Lado)
- Validações inteligentes
- Edição de registros antigos

### Calendário
- Visualização mensal
- Indicadores visuais (registros e treinos)
- Edição rápida de registros

### Histórico
- Lista cronológica de todos os registros
- Mudanças de peso
- Metadados (água, sono, cintura)

### Sistema de Treinos
- Treino do dia automático
- Criação de treinos personalizados
- Execução de treinos com checklist
- Histórico de treinos realizados
- Estatísticas de adesão

### Configurações
- Nome do usuário
- Meta de peso e prazo
- Lembretes configuráveis
- Tema claro/escuro
- Exportação de dados
- Limpeza de dados

## 🛠️ Tecnologias

- **HTML5**: Estrutura semântica
- **CSS3**: Design moderno com glassmorphism e gradientes
- **JavaScript Vanilla**: ES6+, sem frameworks
- **LocalStorage**: Armazenamento de dados
- **IndexedDB**: Armazenamento de fotos
- **Canvas API**: Gráficos
- **Service Worker**: Funcionalidade offline
- **PWA Manifest**: Instalação como app

## 📊 Estrutura de Dados

### localStorage Keys
- `fittrack_config`: Configurações do usuário
- `fittrack_registros`: Array de registros de peso
- `fittrack_treinos`: Array de treinos criados
- `fittrack_treino_checkins`: Array de check-ins de treinos
- `fittrack_schema_version`: Versão do schema

### IndexedDB
- **Database**: `FitTrackDB`
- **Store**: `photos`
- Armazena fotos de progresso comprimidas

## 🎨 Design

### Paleta de Cores
- **Fundo Primário**: #0a0e27
- **Fundo Secundário**: #141b2d
- **Cards**: #1a2332
- **Accent**: #6366f1 → #8b5cf6 (gradiente)
- **Texto Primário**: #ffffff
- **Texto Secundário**: #94a3b8

### Características
- Glassmorphism nos cards
- Gradientes modernos
- Animações suaves
- Sidebar inferior (mobile) / lateral (desktop)
- Skeleton loading
- Estados vazios amigáveis

## 📝 Validações

- **Peso**: Não pode variar mais de 10kg de um dia para outro
- **Sono**: Máximo 24 horas
- **Água**: Apenas números positivos
- Feedback visual inline (sem alerts)

## 🔒 Privacidade

- **100% Local**: Todos os dados ficam no seu dispositivo
- **Sem Backend**: Nenhum dado é enviado para servidores
- **Sem Rastreamento**: Nenhum analytics ou tracking
- **Exportável**: Você pode exportar seus dados a qualquer momento

## 🐛 Solução de Problemas

### Service Worker não funciona
- Certifique-se de estar usando um servidor (não apenas abrindo o arquivo)
- Limpe o cache do navegador
- Verifique o console para erros

### Fotos não salvam
- Verifique se o navegador suporta IndexedDB
- Tente em modo anônimo para descartar problemas de cache

### Dados não persistem
- Verifique se o localStorage está habilitado
- Alguns navegadores em modo privado não salvam dados

## 📄 Licença

Este projeto é de código aberto e está disponível para uso pessoal e comercial.

## 🤝 Contribuindo

Contribuições são bem-vindas! Sinta-se à vontade para abrir issues ou pull requests.

## 📧 Suporte

Para problemas ou sugestões, abra uma issue no repositório.

---

**Desenvolvido com 💪 para ajudar você a alcançar seus objetivos!**

