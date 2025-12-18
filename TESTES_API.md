# 🧪 Collection de Testes - Postman/cURL

## 📍 Configuração Base

**Base URL**: `https://gemini-resumo-api-298442462030.southamerica-east1.run.app`

---

## 1️⃣ Health Check

### Ping (GET)
```bash
curl -X GET "https://gemini-resumo-api-298442462030.southamerica-east1.run.app/api/gemini/ping"
```

**Resposta Esperada:**
```json
{
  "status": "ok",
  "app": "gemini-resumo"
}
```

---

## 2️⃣ Gerar Resumo

### POST /api/gemini/resumir (JSON)
```bash
curl -X POST "https://gemini-resumo-api-298442462030.southamerica-east1.run.app/api/gemini/resumir" \
  -H "Content-Type: application/json" \
  -d '{
    "texto": "Cliente: Olá, estou com erro 503 ao tentar imprimir um documento.\nAgente: Vou verificar seu sistema. Qual impressora está usando?\nCliente: HP Laserjet 1020.\nAgente: Entendo. O erro 503 geralmente ocorre quando o gateway de impressão está sobrecarregado.\nCliente: Como resolvo isso?\nAgente: Vou reiniciar o serviço de impressão remotamente. Aguarde um momento.\nCliente: Ok, obrigado.\nAgente: Pronto, pode tentar novamente. O serviço foi reiniciado.\nCliente: Funcionou! Muito obrigado."
  }'
```

**Resposta Esperada:**
```json
{
  "resumo": "## Resumo do Atendimento\n\n**PROBLEMA / DÚVIDA:**\nCliente relatou erro 503 ao tentar imprimir documento na impressora HP Laserjet 1020...\n\n**SOLUÇÃO APRESENTADA:**\nAgente reiniciou o serviço de impressão remotamente...\n\n**HUMOR DO CLIENTE:**\nPositivo - Cliente agradeceu após resolução..."
}
```

### POST /api/gemini/resumir (Plain Text)
```bash
curl -X POST "https://gemini-resumo-api-298442462030.southamerica-east1.run.app/api/gemini/resumir" \
  -H "Content-Type: text/plain" \
  -d "Cliente: Não consigo acessar o sistema.
Agente: Qual mensagem de erro aparece?
Cliente: Timeout na conexão.
Agente: Vou verificar o servidor."
```

---

## 3️⃣ Sugerir Documentação

### POST /api/gemini/documentacoes
```bash
curl -X POST "https://gemini-resumo-api-298442462030.southamerica-east1.run.app/api/gemini/documentacoes" \
  -H "Content-Type: application/json" \
  -d '{
    "resumo": "## Resumo do Atendimento\n\n**PROBLEMA / DÚVIDA:**\nCliente com erro 503 ao imprimir na HP Laserjet 1020. O gateway de impressão estava sobrecarregado.\n\n**SOLUÇÃO APRESENTADA:**\nReinício do serviço de impressão remotamente resolveu o problema.\n\n**HUMOR DO CLIENTE:**\nPositivo - satisfeito com a resolução rápida."
  }'
```

**Resposta Esperada:**
```json
{
  "documentacoesSugeridas": [
    {
      "id": "doc-gateway-503",
      "content": "# Troubleshooting Erro 503 - Gateway\n\nO erro 503 (Service Unavailable) ocorre quando...",
      "metadata": {
        "title": "Gateway 503 - Troubleshooting",
        "categoria": "GATEWAY"
      }
    },
    {
      "id": "doc-impressao-hp",
      "content": "# Configuração HP Laserjet\n\nPara configurar e solucionar problemas...",
      "metadata": {
        "title": "HP Laserjet - Guia",
        "categoria": "IMPRESSAO"
      }
    }
  ]
}
```

---

## 4️⃣ Buscar Soluções Similares

### POST /api/gemini/solucoes
```bash
curl -X POST "https://gemini-resumo-api-298442462030.southamerica-east1.run.app/api/gemini/solucoes" \
  -H "Content-Type: application/json" \
  -d '{
    "problema": "Cliente não consegue acessar o sistema, aparece timeout na conexão"
  }'
```

**Resposta Esperada:**
```json
{
  "solucoesSugeridas": [
    "PROBLEMA / DÚVIDA:\nCliente com timeout ao acessar sistema corporativo.\n\nSOLUÇÃO APRESENTADA:\nVerificado firewall bloqueando conexão. Liberada porta 443 e acesso restabelecido.",
    
    "PROBLEMA / DÚVIDA:\nTimeout intermitente no acesso ao portal.\n\nSOLUÇÃO APRESENTADA:\nIdentificado problema de DNS. Alterado servidor DNS para 8.8.8.8 e resolvido."
  ]
}
```

---

## 5️⃣ Salvar Resumo Manual

### POST /api/gemini/salvar
```bash
curl -X POST "https://gemini-resumo-api-298442462030.southamerica-east1.run.app/api/gemini/salvar" \
  -H "Content-Type: application/json" \
  -d '{
    "titulo": "Erro 503 - Impressão HP Laserjet",
    "conteudo": "## Resumo do Atendimento\n\n**PROBLEMA / DÚVIDA:**\nCliente com erro 503 ao imprimir.\n\n**SOLUÇÃO APRESENTADA:**\nReiniciado serviço de impressão.\n\n**HUMOR DO CLIENTE:**\nPositivo"
  }'
```

**Resposta Esperada:**
```json
{
  "message": "Resumo salvo na base de conhecimento."
}
```

---

## 6️⃣ Upload de Documentação

### POST /api/docs (Multipart Form)
```bash
curl -X POST "https://gemini-resumo-api-298442462030.southamerica-east1.run.app/api/docs" \
  -F "file=@manual_gateway.txt" \
  -F "categoria=GATEWAY"
```

**Resposta Esperada:**
```json
{
  "message": "File uploaded to Google File Search",
  "id": "files/abc123xyz",
  "categoria": "GATEWAY"
}
```

### Criar arquivo de teste:
```bash
echo "# Manual do Gateway

## Erro 503 - Service Unavailable

Este erro ocorre quando o gateway está sobrecarregado ou temporariamente indisponível.

**Soluções:**
1. Reiniciar serviço
2. Verificar recursos do servidor
3. Checar logs de erro" > manual_gateway.txt
```

---

## 7️⃣ Buscar Documentação (Search)

### GET /api/docs/search
```bash
curl -X GET "https://gemini-resumo-api-298442462030.southamerica-east1.run.app/api/docs/search?query=impressao"
```

**Resposta Esperada:**
```json
[
  {
    "id": "doc-123",
    "content": "# Configuração de Impressora\n\nPara configurar impressoras no sistema...",
    "metadata": {
      "categoria": "IMPRESSAO",
      "uploadDate": "2025-12-15"
    }
  }
]
```

---

## 8️⃣ Debug - Documentações

### GET /api/gemini/documentacoes/debug
```bash
curl -X GET "https://gemini-resumo-api-298442462030.southamerica-east1.run.app/api/gemini/documentacoes/debug?query=gateway"
```

**Resposta Esperada:**
```json
{
  "query": "gateway",
  "totalEncontrados": 3,
  "documentos": [
    {
      "id": "doc-gateway-1",
      "content": "Manual do Gateway...",
      "metadata": {
        "categoria": "GATEWAY"
      }
    }
  ]
}
```

---

## 📝 Casos de Teste Completos

### Cenário 1: Fluxo Completo de Atendimento

```bash
# 1. Cliente reporta problema
PROBLEMA="Cliente não consegue acessar sistema ERP, timeout de conexão"

# 2. Buscar soluções similares
curl -X POST "https://gemini-resumo-api-298442462030.southamerica-east1.run.app/api/gemini/solucoes" \
  -H "Content-Type: application/json" \
  -d "{\"problema\": \"$PROBLEMA\"}"

# 3. Após resolver, gerar resumo
HISTORICO="Cliente: Não consigo acessar o ERP
Agente: Qual erro aparece?
Cliente: Connection timeout
Agente: Vou verificar o servidor... Identificado problema de rede.
Cliente: Já resolveu?
Agente: Sim, pode tentar novamente.
Cliente: Funcionou! Obrigado."

curl -X POST "https://gemini-resumo-api-298442462030.southamerica-east1.run.app/api/gemini/resumir" \
  -H "Content-Type: application/json" \
  -d "{\"texto\": \"$HISTORICO\"}"

# 4. Salvar para base de conhecimento (já automático via auto-save)

# 5. Buscar docs relacionados
RESUMO=$(curl -s -X POST "https://gemini-resumo-api-298442462030.southamerica-east1.run.app/api/gemini/resumir" \
  -H "Content-Type: application/json" \
  -d "{\"texto\": \"$HISTORICO\"}" | jq -r '.resumo')

curl -X POST "https://gemini-resumo-api-298442462030.southamerica-east1.run.app/api/gemini/documentacoes" \
  -H "Content-Type: application/json" \
  -d "{\"resumo\": \"$RESUMO\"}"
```

### Cenário 2: Criar Base de Conhecimento

```bash
# 1. Criar documento de troubleshooting
cat > troubleshooting_rede.txt << 'EOF'
# Troubleshooting - Problemas de Rede

## Timeout de Conexão

### Causas Comuns:
- Firewall bloqueando conexão
- DNS incorreto
- Servidor fora do ar
- Problemas de rota de rede

### Soluções:
1. Verificar regras de firewall
2. Testar conectividade (ping)
3. Validar configuração de DNS
4. Verificar status do servidor
EOF

# 2. Upload para Google File Search
curl -X POST "https://gemini-resumo-api-298442462030.southamerica-east1.run.app/api/docs" \
  -F "file=@troubleshooting_rede.txt" \
  -F "categoria=REDE"

# 3. Verificar se foi indexado
curl "https://gemini-resumo-api-298442462030.southamerica-east1.run.app/api/docs/search?query=timeout"

# 4. Testar debug
curl "https://gemini-resumo-api-298442462030.southamerica-east1.run.app/api/gemini/documentacoes/debug?query=rede"
```

---

## 🔄 Postman Collection (JSON)

```json
{
  "info": {
    "name": "Gemini Resumo API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "variable": [
    {
      "key": "base_url",
      "value": "https://gemini-resumo-api-298442462030.southamerica-east1.run.app"
    }
  ],
  "item": [
    {
      "name": "1. Health Check",
      "request": {
        "method": "GET",
        "header": [],
        "url": "{{base_url}}/api/gemini/ping"
      }
    },
    {
      "name": "2. Gerar Resumo",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"texto\": \"Cliente: Erro 503\\nAgente: Vou verificar.\"\n}"
        },
        "url": "{{base_url}}/api/gemini/resumir"
      }
    },
    {
      "name": "3. Sugerir Documentação",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"resumo\": \"Cliente com erro 503 na impressão.\"\n}"
        },
        "url": "{{base_url}}/api/gemini/documentacoes"
      }
    },
    {
      "name": "4. Buscar Soluções",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"problema\": \"Timeout ao acessar sistema\"\n}"
        },
        "url": "{{base_url}}/api/gemini/solucoes"
      }
    },
    {
      "name": "5. Salvar Resumo",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"titulo\": \"Erro 503\",\n  \"conteudo\": \"Problema resolvido reiniciando serviço.\"\n}"
        },
        "url": "{{base_url}}/api/gemini/salvar"
      }
    },
    {
      "name": "6. Upload Documentação",
      "request": {
        "method": "POST",
        "header": [],
        "body": {
          "mode": "formdata",
          "formdata": [
            {
              "key": "file",
              "type": "file",
              "src": "/path/to/document.txt"
            },
            {
              "key": "categoria",
              "value": "GERAL",
              "type": "text"
            }
          ]
        },
        "url": "{{base_url}}/api/docs"
      }
    },
    {
      "name": "7. Buscar Docs",
      "request": {
        "method": "GET",
        "header": [],
        "url": {
          "raw": "{{base_url}}/api/docs/search?query=impressao",
          "query": [
            {
              "key": "query",
              "value": "impressao"
            }
          ]
        }
      }
    },
    {
      "name": "8. Debug Docs",
      "request": {
        "method": "GET",
        "header": [],
        "url": {
          "raw": "{{base_url}}/api/gemini/documentacoes/debug?query=gateway",
          "query": [
            {
              "key": "query",
              "value": "gateway"
            }
          ]
        }
      }
    }
  ]
}
```

**Para importar no Postman:**
1. Copiar JSON acima
2. Postman → Import → Raw text → Colar → Import

---

**Última atualização**: 2025-12-16
