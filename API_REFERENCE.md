# 📚 Referência da API - Gemini Chat Extension

Este documento detalha os endpoints da API utilizada pela extensão, exemplos de requisição/resposta e como a comunicação é realizada.

## 🔗 Base URL
`https://gemini-resumo-api-298442462030.southamerica-east1.run.app`

---

## 🛠️ Endpoints

### 1. Gerar Resumo
Gera um resumo estruturado do atendimento com base no histórico do chat.

- **Método:** `POST`
- **Endpoint:** `/api/gemini/resumir`
- **Content-Type:** `application/json`

#### Request
```json
{
  "texto": "Atendente: Olá, bom dia...\nCliente: Estou com erro 503..."
}
```

#### Response
```json
{
  "resumo": "## Resumo do Atendimento\n\n**PROBLEMA:** Erro 503 no gateway...\n**SOLUÇÃO:** Reiniciar o serviço..."
}
```

---

### 2. Sugerir Documentação (Smart RAG)
Busca documentações oficiais relevantes com base no resumo gerado.

- **Método:** `POST`
- **Endpoint:** `/api/gemini/documentacoes`
- **Content-Type:** `application/json`

#### Request
```json
{
  "resumo": "Problema relatado: Erro 503 ao processar nota fiscal..."
}
```

#### Response
```json
{
  "documentacoesSugeridas": [
    {
      "id": "doc-gw-503",
      "content": "Para resolver o erro 503 no Gateway, verifique a conexão...",
      "metadata": {
        "title": "Troubleshooting Gateway 503",
        "source": "Manual Técnico"
      }
    }
  ]
}
```

---

### 3. Buscar Soluções Similares
Busca no histórico de atendimentos soluções para um problema específico.

- **Método:** `POST`
- **Endpoint:** `/api/gemini/solucoes`
- **Content-Type:** `application/json`

#### Request
```json
{
  "problema": "Cliente não consegue emitir NF-e, erro de certificado."
}
```

#### Response
```json
{
  "solucoesSugeridas": [
    "PROBLEMA: Erro certificado expirado...\nSOLUÇÃO: Instalar novo certificado A1...",
    "PROBLEMA: Falha na assinatura digital...\nSOLUÇÃO: Verificar token..."
  ]
}
```

---

### 4. Salvar Resumo
Salva o resumo gerado na base de conhecimento (Vector Store) para consultas futuras.

- **Método:** `POST`
- **Endpoint:** `/api/gemini/salvar`
- **Content-Type:** `application/json`

#### Request
```json
{
  "titulo": "Atendimento - Erro Certificado A1",
  "conteudo": "## Resumo...\nProblema: Certificado...\nSolução: Renovação..."
}
```

#### Response
```json
{
  "message": "Resumo salvo na base de conhecimento."
}
```

---

### 5. Busca de Documentação (Pesquisa Livre)
Busca documentos na base de conhecimento por palavras-chave.

- **Método:** `GET`
- **Endpoint:** `/api/docs/search?query={termo}`

#### Request
`GET /api/docs/search?query=impressora`

#### Response
```json
[
  {
    "id": "doc-print-01",
    "content": "Configuração de impressora térmica...",
    "metadata": {
      "categoria": "Hardware"
    }
  }
]
```
