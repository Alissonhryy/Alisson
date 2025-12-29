# FitTrack Pro

Aplicativo web para acompanhamento de peso e treinos.

## 🚀 Como publicar no GitHub Pages

1. **Faça upload dos arquivos para o repositório:**
   - `index.html`
   - `app.js`
   - `manifest.json`
   - `service-worker.js` (opcional)
   - `.nojekyll` (importante para GitHub Pages)

2. **Configure o GitHub Pages:**
   - Vá em Settings > Pages
   - Selecione a branch (geralmente `main` ou `master`)
   - Selecione a pasta `/root` ou `/docs` (dependendo de onde estão os arquivos)
   - Salve

3. **Acesse:**
   - Se o repositório é `alissonhryy.github.io`, acesse: `https://alissonhryy.github.io`
   - Se está em uma subpasta, acesse: `https://alissonhryy.github.io/nome-do-repo`

## 📱 Funcionalidades

- ✅ Registro de peso diário
- ✅ Acompanhamento de progresso
- ✅ Gráficos e estatísticas
- ✅ Sistema de treinos personalizados
- ✅ Histórico completo
- ✅ Funciona offline (PWA)
- ✅ Tema claro/escuro

## 🔧 Estrutura de Arquivos

```
├── index.html          # Página principal
├── app.js              # Lógica JavaScript
├── manifest.json       # Configuração PWA
├── service-worker.js   # Service Worker (opcional)
└── .nojekyll          # Arquivo para GitHub Pages
```

## ⚠️ Notas Importantes

- O arquivo `.nojekyll` é necessário para que o GitHub Pages não processe os arquivos com Jekyll
- Todos os caminhos estão configurados como relativos (`./`) para funcionar em qualquer subpasta
- O Service Worker é opcional e não causará erros se não existir

## 📝 Licença

Uso livre para projetos pessoais e comerciais.
