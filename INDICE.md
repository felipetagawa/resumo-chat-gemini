# 📚 Índice de Documentação - Extensão Gemini Resumo

## 🎯 Para Usuários Finais (Técnicos de Suporte)

**Comece aqui** → [README.md](./README.md)

📖 **O que você vai encontrar**:
- Como instalar a extensão
- Como usar os 3 botões (Gerar Relatório, Ajuda Inteligente, Copiar)
- Dicas e boas práticas
- Limitações conhecidas

⏱️ **Tempo de leitura**: 5-7 minutos

---

## 🔧 Para Desenvolvedores

### 1️⃣ **Início Rápido** - Entender a Integração
📖 [RESUMO_INTEGRACAO.md](./RESUMO_INTEGRACAO.md)

**O que você vai encontrar**:
- ✅ Status da integração (completo)
- Tabela de endpoints integrados
- Fluxo completo do usuário
- Checklist de testes
- Próximos passos

⏱️ **Tempo de leitura**: 8-10 minutos

---

### 2️⃣ **Detalhes Técnicos** - Arquitetura e Mapeamento
📖 [INTEGRACAO_FRONTEND_BACKEND.md](./INTEGRACAO_FRONTEND_BACKEND.md)

**O que você vai encontrar**:
- Mapeamento completo de todos os endpoints
- Request/Response de cada endpoint
- Fluxo de dados detalhado
- Componentes da UI explicados
- Variáveis de configuração

⏱️ **Tempo de leitura**: 12-15 minutos

---

### 3️⃣ **Testes** - Collection de API
📖 [TESTES_API.md](./TESTES_API.md)

**O que você vai encontrar**:
- 8 endpoints com exemplos cURL
- Postman Collection (JSON para importar)
- 2 cenários de teste completos
- Health checks e debugging

⏱️ **Tempo de leitura**: 10-12 minutos  
💡 **Use como**: Referência rápida para testar API

---

### 4️⃣ **Solução de Problemas** - Troubleshooting
📖 [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)

**O que você vai encontrar**:
- 7 problemas comuns + soluções
- Ferramentas de debug (Chrome DevTools, Cloud Logs)
- Checklist de validação
- Como reportar bugs

⏱️ **Tempo de leitura**: 15-20 minutos  
💡 **Use quando**: Algo não funcionar

---

### 5️⃣ **Histórico de Mudanças** - Changelog
📖 [MUDANCAS_API.md](./MUDANCAS_API.md)

**O que você vai encontrar**:
- Histórico de mudanças da API
- Breaking changes
- Migração de versões

⏱️ **Tempo de leitura**: 5-8 minutos

---

## 📊 Diagramas Visuais

### Arquitetura Completa
![Arquitetura](./docs/arquitetura_integracao.png)

**Mostra**:
- Chrome Extension (Frontend)
- Spring Boot Backend
- Gemini AI API
- Google File Search
- Fluxo de dados entre componentes

---

### Mapeamento UI → Endpoints
![Mapeamento](./docs/mapeamento_ui_endpoints.png)

**Mostra**:
- Cada botão da UI
- Qual endpoint ele chama
- Auto-save automático
- Ações locais vs remotas

---

## 🗂️ Arquivos de Código

### Frontend (Chrome Extension)

| Arquivo | Função Principal |
|---------|------------------|
| `manifest.json` | Configuração da extensão (permissões, versão) |
| `background.js` | Service Worker - Comunicação com API |
| `content.js` | UI injection - Botões e popups |
| `popup.html/js` | Popup da extensão (clique no ícone) |
| `options.html/js` | Página de configurações |
| `icon48.png`, `icon128.png` | Ícones da extensão |

### Backend (Spring Boot)
**Não incluído neste repositório** - Ver repositório do backend

---

## 🚀 Fluxo de Leitura Recomendado

### Para **Técnicos de Suporte**:
```
1. README.md (Como usar)
   ↓
2. TROUBLESHOOTING.md (Se algo não funcionar)
```

### Para **Desenvolvedores Novos no Projeto**:
```
1. README.md (Visão geral)
   ↓
2. RESUMO_INTEGRACAO.md (Status e overview técnico)
   ↓
3. INTEGRACAO_FRONTEND_BACKEND.md (Detalhes da arquitetura)
   ↓
4. TESTES_API.md (Como testar)
```

### Para **Debugging**:
```
1. TROUBLESHOOTING.md (Problemas comuns)
   ↓
2. TESTES_API.md (Testar endpoints manualmente)
   ↓
3. INTEGRACAO_FRONTEND_BACKEND.md (Ver fluxo esperado)
```

### Para **Adicionar Features**:
```
1. INTEGRACAO_FRONTEND_BACKEND.md (Ver arquitetura atual)
   ↓
2. background.js (Adicionar chamada de API)
   ↓
3. content.js (Adicionar UI)
   ↓
4. TESTES_API.md (Atualizar testes)
```

---

## 📋 Quick Reference

### URLs Importantes

- **API Base**: `https://gemini-resumo-api-298442462030.southamerica-east1.run.app`
- **SZ Chat**: `https://softeninformatica.sz.chat/user/agent`
- **Health Check**: `/api/gemini/ping`

### Variáveis de Ambiente

**Frontend**: 
```javascript
// background.js linha 2
const API_BASE_URL = "https://...";
```

**Backend**: 
```bash
GEMINI_API_KEY=...
```

### Comandos Úteis

```bash
# Testar API online
curl https://gemini-resumo-api-298442462030.southamerica-east1.run.app/api/gemini/ping

# Ver logs do backend (Cloud Run)
gcloud logging read "resource.type=cloud_run_revision" --limit 50

# Reload extensão (após modificar código)
chrome://extensions/ → Reload
```

---

## 🆘 Precisa de Ajuda?

**Escolha o documento certo**:

| Se você quer... | Leia isso |
|----------------|-----------|
| Aprender a usar a extensão | [README.md](./README.md) |
| Entender como funciona | [RESUMO_INTEGRACAO.md](./RESUMO_INTEGRACAO.md) |
| Ver detalhes técnicos | [INTEGRACAO_FRONTEND_BACKEND.md](./INTEGRACAO_FRONTEND_BACKEND.md) |
| Testar a API | [TESTES_API.md](./TESTES_API.md) |
| Resolver um problema | [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) |
| Ver o que mudou | [MUDANCAS_API.md](./MUDANCAS_API.md) |

---

## 📝 Contribuindo

Ao adicionar ou modificar funcionalidades:

1. ✅ Atualize o código (`background.js` ou `content.js`)
2. ✅ Teste manualmente (ver [TESTES_API.md](./TESTES_API.md))
3. ✅ Atualize documentação relevante:
   - [INTEGRACAO_FRONTEND_BACKEND.md](./INTEGRACAO_FRONTEND_BACKEND.md) se adicionou endpoint
   - [README.md](./README.md) se mudou UI
   - [TESTES_API.md](./TESTES_API.md) se criou novo teste
4. ✅ Documente em [MUDANCAS_API.md](./MUDANCAS_API.md)

---

## 🎓 Glossário

- **Smart RAG**: Retrieval-Augmented Generation com validação inteligente
- **Auto-save**: Salvamento automático de resumos após geração
- **Service Worker**: Script em background que roda mesmo com extensão fechada
- **Content Script**: Script injetado nas páginas web (adiciona botões)
- **Vector Store**: Google File Search (embeddings para busca semântica)

---

**Versão da Documentação**: 2.0  
**Última atualização**: Dezembro 2025  
**Responsável**: Felipe Tagawa – Desenvolvimento / Automação do Suporte
