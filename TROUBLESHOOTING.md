# 🔧 Guia de Troubleshooting - Integração Frontend-Backend

## 🚨 Problemas Comuns e Soluções

### 1. **Resumo não é gerado ao clicar no botão**

**Sintomas:**
- Botão fica em "⏳ Gerando resumo..." indefinidamente
- Nenhum popup aparece
- Console mostra erro de rede

**Causas Possíveis:**

#### A. Backend não está rodando
```bash
# Verificar se API está online
curl https://gemini-resumo-api-298442462030.southamerica-east1.run.app/api/gemini/ping

# Resposta esperada:
# {"status":"ok","app":"gemini-resumo"}
```

**Solução**: Verificar deploy no Cloud Run

#### B. CORS bloqueando requisição
**Solução**: Verificar se `@CrossOrigin(origins = "*")` está presente no `GeminiController.java`

#### C. URL da API incorreta
**Verificar**: `background.js` linha 2
```javascript
const API_BASE_URL = "https://gemini-resumo-api-298442462030.southamerica-east1.run.app";
```

---

### 2. **Auto-save falha (status vermelho)**

**Sintomas:**
- Popup exibe: "❌ Erro ao salvar: ..."
- Resumo é gerado mas não salva na base

**Debug:**

1. **Abrir DevTools** (F12 na página da extensão)
2. **Ir para Console**
3. **Procurar erro de `salvarResumo`**

**Causas Possíveis:**

#### A. Endpoint `/api/gemini/salvar` retornando erro
```bash
# Testar manualmente
curl -X POST https://gemini-resumo-api-298442462030.southamerica-east1.run.app/api/gemini/salvar \
  -H "Content-Type: application/json" \
  -d '{"titulo":"Teste","conteudo":"Conteúdo teste"}'
```

#### B. Google File Search com problema
**Verificar**: Logs do backend no Cloud Run
```bash
gcloud logging read "resource.type=cloud_run_revision" --limit 50
```

---

### 3. **Documentação Sugerida não aparece**

**Sintomas:**
- Clicar em "📚 Docs Sugeridos" não mostra resultados
- Mensagem: "Nenhuma documentação relevante encontrada"

**Causas Possíveis:**

#### A. Nenhum documento foi enviado ao Google File Search
```bash
# Verificar endpoint de upload
curl -X POST https://gemini-resumo-api-298442462030.southamerica-east1.run.app/api/docs \
  -F "file=@documento_teste.txt" \
  -F "categoria=TESTE"
```

**Solução**: Popular base com documentos oficiais

#### B. Smart RAG não encontra relevância
**Entender**: O backend usa Gemini para validar se docs são relevantes ao resumo
- Se Gemini não vê relação, não retorna resultados
- Isso é **intencional** para evitar docs irrelevantes

**Verificar**: Endpoint de debug
```bash
curl "https://gemini-resumo-api-298442462030.southamerica-east1.run.app/api/gemini/documentacoes/debug?query=impressao"
```

---

### 4. **Soluções Similares não aparecem**

**Sintomas:**
- Painel "Ajuda Inteligente" sempre retorna "Nenhuma solução similar encontrada"

**Causas Possíveis:**

#### A. Base de conhecimento vazia
- Nenhum resumo foi salvo ainda
- Sistema precisa de histórico para funcionar

**Solução**: 
1. Gerar alguns resumos primeiro
2. Aguardar auto-save
3. Depois testar busca de soluções

#### B. Problema descrito muito genérico
- "erro" → muito vago
- "Cliente com erro 503 no gateway ao tentar imprimir" → específico ✅

---

### 5. **Extensão não aparece na página**

**Sintomas:**
- Botões flutuantes não aparecem
- Nada acontece ao abrir chat

**Debug:**

#### A. Verificar URL alvo
**Esperado**: `https://softeninformatica.sz.chat/user/agent`

**Verificar**: `content.js` linha 19
```javascript
const TARGET_URL = "https://softeninformatica.sz.chat/user/agent";
```

#### B. Extensão não carregada
```
1. Abrir chrome://extensions/
2. Verificar se "Gemini Resumo" está ativa
3. Reload da extensão
4. Recarregar página do chat
```

---

### 6. **Erro de CORS no Console**

**Exemplo:**
```
Access to fetch at 'https://...' from origin 'chrome-extension://...' has been blocked by CORS policy
```

**Solução Backend**: Adicionar em TODOS os controllers:
```java
@CrossOrigin(origins = "*")
```

**Verificar**:
- ✅ `GeminiController.java` (linha 13)
- ❓ `DocumentationController.java` (adicionar se não houver)

---

### 7. **Histórico Local desapareceu**

**Nota**: Histórico local é **diferente** da base de conhecimento do backend

**Características**:
- Armazenado em `Chrome Storage`
- Máximo 20 resumos
- Pode ser limpo pelo usuário
- NÃO afeta backend

**Recuperação**: 
- Impossível recuperar histórico local deletado
- Backend ainda tem todos os dados via Google File Search

---

## 🔍 Ferramentas de Debug

### 1. **Chrome DevTools**
```
F12 → Console → Verificar erros
F12 → Network → Ver requisições API
F12 → Application → Storage → Local Storage
```

### 2. **Backend Logs (Cloud Run)**
```bash
gcloud logging read \
  "resource.type=cloud_run_revision AND resource.labels.service_name=gemini-resumo-api" \
  --limit 50 \
  --format json
```

### 3. **Teste Manual de Endpoints**

#### Gerar Resumo
```bash
curl -X POST https://gemini-resumo-api-298442462030.southamerica-east1.run.app/api/gemini/resumir \
  -H "Content-Type: application/json" \
  -d '{"texto":"Cliente: Erro 503\nAgente: Vou verificar"}'
```

#### Sugerir Docs
```bash
curl -X POST https://gemini-resumo-api-298442462030.southamerica-east1.run.app/api/gemini/documentacoes \
  -H "Content-Type: application/json" \
  -d '{"resumo":"Cliente com erro 503 no gateway de impressão"}'
```

#### Buscar Soluções
```bash
curl -X POST https://gemini-resumo-api-298442462030.southamerica-east1.run.app/api/gemini/solucoes \
  -H "Content-Type: application/json" \
  -d '{"problema":"erro 503 no gateway"}'
```

---

## 🧪 Checklist de Validação

Antes de reportar bug, verificar:

- [ ] Backend está online (`/api/gemini/ping` responde)
- [ ] Extensão está ativa em `chrome://extensions/`
- [ ] Página é a correta (`softeninformatica.sz.chat/user/agent`)
- [ ] DevTools mostra requisições chegando ao backend
- [ ] CORS não está bloqueando (Console limpo)
- [ ] Variável `API_BASE_URL` está correta

---

## 📞 Suporte

**Logs Úteis para Reportar**:
1. Console do Chrome (F12)
2. Network tab (requisições falhando)
3. Logs do Cloud Run (backend)
4. Versão da extensão (manifest.json)

---

**Última atualização**: 2025-12-16
