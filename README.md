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

1. Navegador **Google Chrome** ou **Microsoft Edge (Chromium)** atualizado  
2. Criar uma **chave de API do Google Gemini**:
   - Acesse: 👉 [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
   - Clique em **“Create API Key”**
   - Copie a chave gerada (exemplo: `AIzaSy...`)

---

## 📂 Estrutura da pasta

Coloque todos os arquivos abaixo dentro de uma pasta chamada, por exemplo, `extensao-gemini-sz`:

extensao-gemini-sz/
│
├── manifest.json
├── background.js
├── content.js
├── popup.html
├── popup.js
├── options.html
└── options.js

yaml
Copiar código

*(Os arquivos devem ser obtidos com o técnico responsável pelo projeto ou via repositório interno.)*

---

## 🧰 Instalação no navegador

1. Abra o navegador e acesse:
chrome://extensions/

yaml
Copiar código
2. Ative o **Modo do desenvolvedor** (no canto superior direito)
3. Clique em **“Carregar sem compactação”**
4. Selecione a pasta da extensão (ex: `extensao-gemini-sz`)

A extensão aparecerá na barra superior (ícone 🧩).

---

## 🔑 Configuração da API Key

1. Clique com o **botão direito** no ícone da extensão  
2. Vá em **“Opções”**
3. Cole sua **API Key** do Gemini  
4. Clique em **Salvar**

> ⚠️ Sem a API Key configurada, o resumo **não será gerado**.

---

## 💬 Como usar no SZ Chat

1. Acesse o **painel do SZ Chat**:
https://softeninformatica.sz.chat/user/agent

markdown
Copiar código
2. Abra o **chat do cliente** que deseja resumir  
3. Aguarde alguns segundos — dois botões aparecerão no canto inferior direito da tela:

- 📋 **Copiar Histórico** → copia apenas o chat aberto  
- 🧠 **Gerar Relatório** → envia o histórico para o Gemini e mostra o resumo formatado  

4. O resumo será exibido em um popup com campos como:
PROBLEMA / DÚVIDA: ...
SOLUÇÃO APRESENTADA: ...
OPORTUNIDADE DE UPSELL: ...
PRINTS DE ERRO OU DE MENSAGENS RELEVANTES: ...
HUMOR DO CLIENTE: ...

yaml
Copiar código

5. Clique em **📋 Copiar Resumo** para copiar o texto e colar no relatório interno ou CRM.

---

## ⚙️ Funcionamento técnico (para manutenção)

### 🔹 background.js
Responsável por enviar o histórico de chat para o modelo Gemini:

```js
const url = "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=" + geminiApiKey;
Ele envia o texto capturado como prompt e recebe o resumo formatado.

🔹 content.js
Insere os botões flutuantes no chat SZ e captura apenas o conteúdo visível (chat atual):

js
Copiar código
const mensagensDOM = document.querySelectorAll(".msg");
const mensagens = Array.from(mensagensDOM)
  .map(msg => {
    const nome = msg.querySelector(".name")?.innerText?.trim() || "";
    const texto = msg.querySelector(".message span")?.innerText?.trim() || "";
    return `${nome ? nome + ": " : ""}${texto}`;
  })
  .join("\n");
🔹 options.js / options.html
Tela simples para o técnico salvar e recuperar a API Key no chrome.storage.sync.

🧾 Exemplo de relatório gerado
markdown
Copiar código
**PROBLEMA / DÚVIDA:** Cliente relatou dificuldade ao emitir CTe para outra empresa.
**SOLUÇÃO APRESENTADA:** Técnico verificou a emissão, confirmou que apenas o CTe é emitido e explicou o procedimento correto.
**OPORTUNIDADE DE UPSELL:** Não identificado.
**PRINTS DE ERRO OU DE MENSAGENS RELEVANTES:** Não houve.
**HUMOR DO CLIENTE:** Neutro. Demonstrou dúvida, mas foi receptivo à explicação.
🧩 Dicas e boas práticas
Copie apenas o chat visível (a extensão já ignora os outros).

O limite de texto enviado ao Gemini é de ~4000 caracteres por vez.

Caso os botões não apareçam, recarregue a página do SZ.

Se o relatório não for gerado:

Verifique se a API Key está salva corretamente;

Veja o Console (F12 → Aba Console) para erros.

Créditos
Desenvolvimento: Felipe Tagawa

Equipe: Suporte Técnico – SoftEN Informática

Modelo de IA: gemini-2.5-flash

Tecnologia: JavaScript (Chrome Extension + Gemini API)

Última atualização: Novembro / 2025

🛠 Suporte interno
Em caso de erro, dúvidas ou necessidade de atualização:

📧 Contate: Felipe Tagawa – Desenvolvimento / Automação do Suporte