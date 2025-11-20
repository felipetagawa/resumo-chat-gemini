# 🧠 Extensão Gemini – Gerador de Relatórios de Atendimento (SZ Chat)

## 📋 Descrição

Esta extensão foi criada para os técnicos do suporte utilizarem no **chat SZ**.  
Ela gera **relatórios automáticos** de cada atendimento com base no histórico de mensagens, usando a inteligência artificial **Google Gemini**.

Com ela, é possível:
- Copiar apenas o **chat aberto** no momento;
- Gerar um **resumo estruturado** com:
  - Problema relatado;
  - Solução apresentada;
  - Humor do cliente;
  - Oportunidades de upsell;
  - Prints ou mensagens relevantes.

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

1. Acesse o **painel do SZ Chat**:
   [https://softeninformatica.sz.chat/user/agent](https://softeninformatica.sz.chat/user/agent)

2. Abra o **chat do cliente** que deseja resumir.
3. Aguarde alguns segundos — dois botões aparecerão no canto inferior direito da tela:

   - 📋 **Copiar Histórico** → copia apenas o chat aberto.
   - 🧠 **Gerar Relatório** → envia o histórico para o Gemini e mostra o resumo formatado.

4. O resumo será exibido em um popup com campos como:
   - PROBLEMA / DÚVIDA
   - SOLUÇÃO APRESENTADA
   - OPORTUNIDADE DE UPSELL
   - PRINTS DE ERRO OU DE MENSAGENS RELEVANTES
   - HUMOR DO CLIENTE

5. Clique em **📋 Copiar Resumo** para copiar o texto e colar no relatório interno ou CRM.

---

## ⚙️ Funcionamento técnico (para manutenção)

### 🔹 background.js
Responsável por enviar o histórico de chat para uma **API Intermediária (Java)**, que processa a requisição e se comunica com o Google Gemini.

**Endpoint da API:**
`https://gemini-resumo-api-298442462030.southamerica-east1.run.app/api/gemini/resumir`

O fluxo é:
1. Extensão captura o chat.
2. Envia para a API Java (Service/Controller).
3. API Java chama o modelo `gemini-2.5-flash`.
4. Retorna o resumo formatado para a extensão.

### 🔹 content.js
Insere os botões flutuantes no chat SZ e captura apenas o conteúdo visível (chat atual).

### 🔹 options.js / options.html
*Atualmente não utilizado para autenticação, pois a chave de API é gerenciada pelo backend Java.*

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

- Copie apenas o chat visível (a extensão já ignora os outros).
- O limite de texto enviado é controlado para evitar erros de tokens.
- Caso os botões não apareçam, recarregue a página do SZ.

---

## 🛠 Suporte interno

Em caso de erro, dúvidas ou necessidade de atualização:

📧 Contate: Felipe Tagawa – Desenvolvimento / Automação do Suporte