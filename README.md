# 🧠 Extensão Gemini – Gerador de Relatórios de Atendimento (SZ Chat)

## 📋 Descrição

Esta extensão foi criada para os técnicos do suporte utilizarem no **chat SZ**.  
Ela gera **relatórios automáticos** de cada atendimento com base no histórico de mensagens, usando a inteligência artificial **Google Gemini** integrada com **Smart RAG** (Retrieval-Augmented Generation).

### 🚀 Funcionalidades Principais

#### 1. **Geração de Resumos Inteligentes**
- Analisa histórico completo do chat
- Gera relatório estruturado com:
  - ✅ Problema relatado
  - ✅ Solução apresentada
  - ✅ Humor do cliente (😊😐😡)
  - ✅ Oportunidades de upsell
  - ✅ Prints ou mensagens relevantes
- **Auto-save**: Salva automaticamente na base de conhecimento

#### 2. **💡 Ajuda Inteligente (Smart RAG)**
- Busca soluções similares em atendimentos anteriores
- Sugere abordagens baseadas em casos de sucesso
- Aprende com cada atendimento salvo

#### 3. **📚 Documentação Oficial Sugerida**
- Recomenda docs oficiais relevantes ao problema
- Filtragem inteligente com Gemini (evita docs irrelevantes)
- Integração com Google File Search

#### 4. **📋 Copiar Chat**
- Copia apenas o chat aberto (ignora outros)
- Formatação limpa para relatórios

Tudo direto do navegador — sem precisar sair do SZ.

---

## ⚙️ Pré-requisitos

1. Navegador **Google Chrome** ou **Microsoft Edge (Chromium)** atualizado.
2. Acesso à rede interna (ou internet) para comunicação com a API de resumo.

---

## 📂 Estrutura da pasta

Coloque todos os arquivos abaixo dentro de uma pasta chamada, por exemplo, `extensao-gemini-sz`:

```text
extensao-gemini-sz/
│
├── manifest.json
├── background.js
├── content.js
├── popup.html
├── popup.js
├── options.html
└── options.js
```

*(Os arquivos devem ser obtidos com o técnico responsável pelo projeto ou via repositório interno.)*

---

## 🧰 Instalação no navegador

1. Abra o navegador e acesse:
   `chrome://extensions/`

2. Ative o **Modo do desenvolvedor** (no canto superior direito).
3. Clique em **“Carregar sem compactação”**.
4. Selecione a pasta da extensão (ex: `extensao-gemini-sz`).

A extensão aparecerá na barra superior (ícone 🧩).

---

## 💬 Como usar no SZ Chat

### 1️⃣ **Acesso Inicial**

1. Acesse o **painel do SZ Chat**:
   [https://softeninformatica.sz.chat/user/agent](https://softeninformatica.sz.chat/user/agent)

2. Abra o **chat do cliente** que deseja atender

3. Aguarde alguns segundos — **três botões** aparecerão no canto inferior direito:

---

### 2️⃣ **Gerar Relatório Completo**

**Botão**: 🧠 **Gerar Relatório**

**Fluxo**:
1. Clique no botão
2. Sistema captura histórico do chat atual
3. Gemini processa e gera resumo estruturado
4. **Popup aparece com**:
   - 📝 Resumo completo
   - 😊😐😡 Humor do cliente detectado
   - ✅ Status de salvamento (auto-save ativo)
   
5. **Ações disponíveis**:
   - 📋 **Copiar** → Copia resumo para área de transferência
   - 💾 **Baixar .txt** → Salva arquivo localmente
   - 📚 **Docs Sugeridos** → Busca documentação oficial relevante

**⚡ Auto-Save**: Cada resumo é **automaticamente salvo** na base de conhecimento para futuros atendimentos!

---

### 3️⃣ **Ajuda Inteligente** (Smart RAG)

**Botão**: 💡 **Ajuda Inteligente**

**Quando usar**: 
- Cliente reportou problema complexo
- Precisa de soluções similares rápidas
- Quer ver como casos semelhantes foram resolvidos

**Como funciona**:
1. Clique em "💡 Ajuda Inteligente"
2. **Descreva o problema** no campo de texto
   - Exemplo: *"Cliente com erro 503 ao imprimir na HP Laserjet"*
3. Clique em **🔍 Sugerir Solução**
4. Sistema busca em **todos os atendimentos anteriores** salvos
5. Exibe **soluções similares** que funcionaram

**💡 Dica**: Quanto mais específico for o problema, melhores as sugestões!

---

### 4️⃣ **Copiar Histórico**

**Botão**: 📋 **Copiar Histórico**

**Uso rápido**: 
- Copia apenas o chat aberto (ignora outros chats)
- Útil para colar em e-mails ou relatórios manuais
- Não gera resumo, apenas copia texto bruto

---

## 📚 Sobre Documentação Sugerida

Após gerar um resumo, você pode clicar em **"📚 Docs Sugeridos"** para:

✅ Ver manuais oficiais relacionados ao problema  
✅ Encontrar procedimentos padrão da empresa  
✅ Acessar troubleshooting guides  

**Tecnologia**: Usa **Smart RAG** com Gemini para filtrar apenas docs **realmente relevantes** (evita spam de documentação).

---

## ⚙️ Arquitetura Técnica (para desenvolvedores)

### 🏗️ Stack Tecnológico

**Frontend** (Chrome Extension):
- Vanilla JavaScript (ES6+)
- Chrome Extension Manifest V3
- Chrome Storage API
- Service Worker (background.js)

**Backend** (Spring Boot):
- Java 17+
- Spring AI Framework
- Google Gemini 2.5 Flash API
- Google File Search (Vector Store)
- Cloud Run (Deploy)

---

### 🔄 Fluxo de Dados

```
USER → Extension UI → background.js → Spring Boot API → Gemini AI
                                                        ↓
                                                   Google File Search
                                                        ↓
                                     ← JSON Response ← Smart RAG
```

---

### 📡 Endpoints Disponíveis

**Base URL**: `https://gemini-resumo-api-298442462030.southamerica-east1.run.app`

#### 1. **POST** `/api/gemini/resumir`
Gera resumo estruturado do atendimento
```json
{
  "texto": "Histórico completo do chat..."
}
```

#### 2. **POST** `/api/gemini/documentacoes`
Sugere documentação oficial relevante (Smart RAG)
```json
{
  "resumo": "Resumo gerado anteriormente..."
}
```

#### 3. **POST** `/api/gemini/solucoes`
Busca soluções similares em atendimentos anteriores
```json
{
  "problema": "Descrição do problema atual..."
}
```

#### 4. **POST** `/api/gemini/salvar`
Salva resumo manualmente (também usado pelo auto-save)
```json
{
  "titulo": "Título curto",
  "conteudo": "Resumo completo..."
}
```

#### 5. **GET** `/api/docs/search?query=...`
Busca documentação por termo específico

#### 6. **POST** `/api/docs` (Multipart)
Upload de novos documentos oficiais (admin only)

#### 7. **GET** `/api/gemini/ping`
Health check da API

---

### 🧠 Smart RAG (Retrieval-Augmented Generation)

**Como funciona**:

1. **Indexação**: 
   - Documentos salvos no Google File Search
   - Embeddings gerados automaticamente
   
2. **Busca**:
   - Query inicial recupera top-k documentos
   - **Gemini valida relevância** (filtro inteligente)
   - Retorna apenas docs realmente úteis

3. **Vantagens**:
   - ✅ Evita "poluição" de resultados irrelevantes
   - ✅ Contexto sempre atualizado
   - ✅ Aprende com cada atendimento

---

### 📂 Estrutura de Arquivos Frontend

```text
resumo-chat-gemini/
│
├── manifest.json          # Configuração da extensão
├── background.js          # Service Worker (API calls)
├── content.js             # UI injection + event handlers
├── popup.html/js          # Popup da extensão
├── options.html/js        # Página de configurações
├── icon48.png/128.png     # Ícones
│
└── Documentação:
    ├── README.md                        # Este arquivo
    ├── INTEGRACAO_FRONTEND_BACKEND.md  # Guia de integração
    ├── TROUBLESHOOTING.md              # Solução de problemas
    └── TESTES_API.md                   # Collection de testes
```

---

### 🔐 Segurança

- **API Key**: Gerenciada no backend (não exposta ao frontend)
- **CORS**: Configurado para aceitar origens da extensão
- **Rate Limiting**: Implementado no Cloud Run
- **Stateless**: Backend não mantém sessão (escalável)

---

## 🧾 Exemplo de relatório gerado

```markdown
**PROBLEMA / DÚVIDA:** Cliente relatou dificuldade ao emitir CTe para outra empresa.
**SOLUÇÃO APRESENTADA:** Técnico verificou a emissão, confirmou que apenas o CTe é emitido e explicou o procedimento correto.
**OPORTUNIDADE DE UPSELL:** Não identificado.
**PRINTS DE ERRO OU DE MENSAGENS RELEVANTES:** Não houve.
**HUMOR DO CLIENTE:** Neutro. Demonstrou dúvida, mas foi receptivo à explicação.
```

---

## 🧩 Dicas e boas práticas

### Para Técnicos de Suporte:

✅ **Use a Ajuda Inteligente primeiro**: Antes de pesquisar soluções manualmente, descreva o problema no painel 💡  
✅ **Seja específico**: "Erro 503 impressão" > "Erro"  
✅ **Auto-save é automático**: Não precisa salvar manualmente, já salva sozinho  
✅ **Docs Sugeridos**: Use após gerar resumo para ver manuais relevantes  
✅ **Histórico local**: Acesse `chrome://extensions` → Gemini Resumo → Opções para ver últimos 20 resumos  

### Limitações Conhecidas:

⚠️ **Limite de texto**: Máximo 4000 caracteres por resumo (chats muito longos serão cortados)  
⚠️ **Necessita conexão**: Backend na nuvem requer internet estável  
⚠️ **URL específica**: Só funciona em `softeninformatica.sz.chat/user/agent`  

---

## 📚 Documentação Adicional

Para desenvolvedores e administradores:

- 📖 **[INTEGRACAO_FRONTEND_BACKEND.md](./INTEGRACAO_FRONTEND_BACKEND.md)** - Arquitetura completa e mapeamento de endpoints
- 🔧 **[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)** - Guia de solução de problemas
- 🧪 **[TESTES_API.md](./TESTES_API.md)** - Collection de testes (cURL + Postman)
- 📝 **[MUDANCAS_API.md](./MUDANCAS_API.md)** - Histórico de mudanças da API

---

## 🚀 Roadmap

**Próximas funcionalidades planejadas**:

- [ ] **Dashboard de Analytics**: Métricas de atendimentos, problemas recorrentes
- [ ] **Feedback Loop**: Botões 👍👎 para melhorar Smart RAG
- [ ] **Upload de Docs**: Interface para admins fazerem upload de manuais
- [ ] **Multi-idioma**: Suporte para ES/EN
- [ ] **Integração CRM**: Export direto para sistemas internos

---

## 🛠 Suporte e Contribuição

**Para usuários finais** (técnicos de suporte):
- 💬 Problemas na extensão? Veja [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
- ❓ Dúvidas de uso? Releia a seção "Como usar"

**Para desenvolvedores**:
- 🐛 Bugs ou sugestões? Abra uma issue no repositório interno
- 🔧 Quer contribuir? Leia [INTEGRACAO_FRONTEND_BACKEND.md](./INTEGRACAO_FRONTEND_BACKEND.md) primeiro

📧 **Responsável**: Felipe Tagawa – Desenvolvimento / Automação do Suporte

---

**Versão**: 2.0 (Smart RAG + Google File Search)  
**Última atualização**: Dezembro 2025