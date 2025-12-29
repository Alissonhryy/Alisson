# 📱 Como Publicar no GitHub Pages

## Passos para Publicar

1. **Criar repositório no GitHub**
   - Nome: `FitTrack-Pro` (ou qualquer nome)
   - Público ou Privado

2. **Fazer upload dos arquivos**
   - Faça upload de todos os arquivos do projeto
   - Certifique-se de incluir:
     - `index.html`
     - `app.js`
     - `manifest.json`
     - `service-worker.js`
     - `icon.svg`
     - `.nojekyll`
     - `README.md`

3. **Ativar GitHub Pages**
   - Vá em Settings → Pages
   - Source: selecione a branch principal (main ou master)
   - Folder: `/ (root)`
   - Clique em Save

4. **Acessar o app**
   - O app estará disponível em: `https://seu-usuario.github.io/FitTrack-Pro/`
   - Ou: `https://seu-usuario.github.io/nome-do-repositorio/`

## ⚠️ Importante

- O arquivo `.nojekyll` é necessário para que o GitHub Pages não processe os arquivos com Jekyll
- Todos os caminhos no código usam `./` (relativos) para funcionar em qualquer subpasta
- O ícone SVG funciona, mas você pode gerar PNGs usando `generate-icons.html` se quiser

## 🔧 Gerar Ícones PNG (Opcional)

1. Abra `generate-icons.html` no navegador
2. Clique nos botões para baixar os PNGs
3. Faça upload dos arquivos `icon-192.png` e `icon-512.png` para o repositório
4. Atualize o `manifest.json` para incluir os PNGs (opcional)

## ✅ Testar Localmente

Antes de publicar, teste localmente:

```bash
# Python
python -m http.server 8000

# Node.js
npx http-server

# Acesse: http://localhost:8000
```

