# 🔗 Integração Frontend-Backend

## 📊 Status da Integração

✅ **COMPLETO** - Todos os endpoints do backend estão integrados ao frontend da extensão Chrome.

---

## 🎯 Endpoints Integrados

### 1️⃣ **Gerar Resumo** (POST)
- **Backend**: `/api/gemini/resumir`
- **Frontend**: `background.js` - action `gerarResumo`
- **Uso**: Botão "🧠 Gerar Relatório" no `content.js`
- **Fluxo**:
  1. Usuário clica no botão
  2. Captura texto do chat
  3. Envia para backend com instruções customizadas
  4. Exibe popup com resultado
  5. **Salva automaticamente** na base de conhecimento

**Request:**
```json
{
  "texto": "INSTRUÇÕES ADICIONAIS DO USUÁRIO:\n...\n\n---\n\nHISTÓRICO DO CHAT:\n..."
}
```

**Response:**
```json
{
  "resumo": "## Resumo do Atendimento\n..."
}
```

---

### 2️⃣ **Sugerir Documentação** (POST)
- **Backend**: `/api/gemini/documentacoes`
- **Frontend**: `background.js` - action `sugerirDocumentacao`
- **Uso**: Botão "📚 Docs Sugeridos" no popup de resumo
- **Fluxo**:
  1. Após gerar resumo, usuário pode clicar em "Docs Sugeridos"
  2. Envia o resumo completo para o backend
  3. Backend usa Smart RAG (Gemini) para buscar docs relevantes
  4. Exibe lista de documentação oficial

**Request:**
```json
{
  "resumo": "## Resumo do Atendimento\n..."
}
```

**Response:**
```json
{
  "documentacoesSugeridas": [
    {
      "id": "doc-123",
      "content": "Como resolver erro 503...",
      "metadata": {
        "title": "Gateway 503 - Troubleshooting",
        "categoria": "GATEWAY"
      }
    }
  ]
}
```

---

### 3️⃣ **Buscar Soluções Similares** (POST)
- **Backend**: `/api/gemini/solucoes`
- **Frontend**: `background.js` - action `buscarSolucoes`
- **Uso**: Painel "💡 Ajuda Inteligente"
- **Fluxo**:
  1. Usuário abre painel de ajuda
  2. Descreve o problema
  3. Clica em "🔍 Sugerir Solução"
  4. Backend usa Smart RAG para buscar soluções em histórico

**Request:**
```json
{
  "problema": "Cliente com erro 503 no gateway"
}
```

**Response:**
```json
{
  "solucoesSugeridas": [
    "PROBLEMA: Erro 503...\nSOLUÇÃO: Verificar...",
    "PROBLEMA: Gateway timeout...\nSOLUÇÃO: Reiniciar..."
  ]
}
```

---

### 4️⃣ **Salvar Resumo Manualmente** (POST)
- **Backend**: `/api/gemini/salvar`
- **Frontend**: `background.js` - action `salvarResumo`
- **Uso**: **AUTOMÁTICO** após gerar resumo (linha 269 de `content.js`)
- **Fluxo**:
  1. Após exibir resumo no popup
  2. Sistema **automaticamente** salva na base
  3. Exibe status: "✅ Salvo como: ..."

**Request:**
```json
{
  "titulo": "Atendimento - Erro 503",
  "conteudo": "## Resumo do Atendimento\n..."
}
```

**Response:**
```json
{
  "message": "Resumo salvo na base de conhecimento."
}
```

---

### 5️⃣ **Buscar Documentação por Query** (GET)
- **Backend**: `/api/docs/search?query=impressao`
- **Frontend**: `background.js` - action `buscarDocumentacao`
- **Uso**: (Implementado mas não usado atualmente na UI)
- **Disponível para uso futuro**

**Request:**
```
GET /api/docs/search?query=impressao
```

**Response:**
```json
[
  {
    "id": "doc-456",
    "content": "Como configurar impressora...",
    "metadata": {
      "categoria": "IMPRESSAO"
    }
  }
]
```

---

## 🎨 Componentes da UI

### **Botões Flutuantes** (content.js)
1. **💡 Ajuda Inteligente**
   - Abre painel para buscar soluções
   - Usa endpoint `/api/gemini/solucoes`

2. **📋 Copiar Histórico**
   - Copia texto do chat atual
   - Não depende do backend

3. **🧠 Gerar Relatório**
   - Gera resumo com Gemini
   - Usa endpoint `/api/gemini/resumir`
   - **Auto-salva** com `/api/gemini/salvar`

### **Popup de Resumo** (content.js - função `exibirResumo`)
- **Exibe**: Resumo gerado com humor do cliente
- **Status Auto-Save**: Mostra se salvou com sucesso
- **Botões**:
  - 📋 Copiar
  - 💾 Baixar .txt
  - 📚 **Docs Sugeridos** → Usa `/api/gemini/documentacoes`

### **Painel Ajuda Inteligente** (content.js - função `exibirPainelAjuda`)
- **Campo**: Descrição do problema
- **Botão**: 🔍 Sugerir Solução → Usa `/api/gemini/solucoes`
- **Lista**: Exibe soluções similares do histórico

---

## 🔄 Fluxo Completo de Uso

```
1. USUÁRIO ATENDE CLIENTE NO CHAT
   ↓
2. CLICA EM "🧠 Gerar Relatório"
   ↓
3. EXTENSION CAPTURA HISTÓRICO
   ↓
4. CHAMA /api/gemini/resumir
   ↓
5. EXIBE POPUP COM RESUMO
   ↓
6. AUTO-SALVA COM /api/gemini/salvar ✅
   ↓
7. [OPCIONAL] CLICA "📚 Docs Sugeridos"
   ↓
8. CHAMA /api/gemini/documentacoes
   ↓
9. EXIBE DOCUMENTAÇÃO OFICIAL RELEVANTE

---

PARALELO: AJUDA INTELIGENTE

A. CLICA "💡 Ajuda Inteligente"
   ↓
B. DESCREVE PROBLEMA
   ↓
C. CLICA "🔍 Sugerir Solução"
   ↓
D. CHAMA /api/gemini/solucoes
   ↓
E. EXIBE SOLUÇÕES DO HISTÓRICO
```

---

## 🛠️ Variáveis de Configuração

### URL da API
**Local**: `background.js` linha 2
```javascript
const API_BASE_URL = "https://gemini-resumo-api-298442462030.southamerica-east1.run.app";
```

Para mudar ambiente (dev/prod), altere apenas essa linha.

---

## 📝 Histórico Local

A extensão também salva localmente (Chrome Storage):
- **Chave**: `history`
- **Limite**: 20 resumos mais recentes
- **Visualização**: Página de opções (`options.html`)

**Não substitui** a base de conhecimento do backend, serve apenas para consulta rápida local.

---

## ✅ Checklist de Testes

- [ ] Gerar resumo de um chat
- [ ] Verificar auto-save (status verde)
- [ ] Clicar em "Docs Sugeridos" e ver resultados
- [ ] Abrir "Ajuda Inteligente"
- [ ] Buscar solução para um problema
- [ ] Verificar histórico em Options
- [ ] Copiar resumo
- [ ] Baixar .txt

---

## 🚀 Próximos Passos Sugeridos

1. **Upload de Documentação** via `/api/docs` (POST)
   - Criar interface para admin fazer upload de docs oficiais
   
2. **Dashboard de Analytics**
   - Quantos resumos gerados
   - Documentações mais buscadas
   - Problemas recorrentes

3. **Feedback Loop**
   - Botão "👍 Solução útil" / "👎 Não ajudou"
   - Melhorar algoritmo de Smart RAG

---

**Última atualização**: 2025-12-16  
**Versão da API**: Cloud Run (Google File Search)
