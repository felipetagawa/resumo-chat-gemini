# Sugerir resposta em chat e Consultar Docs em destaque — Design

Data: 06/11/2026. Base: extensão `cdfdb7a` (1.7.0), API `b36eec2`.
Status: aguardando aprovação do Felipe.

Repositórios:
- Extensão: este repositório (`resumo-chat-gemini`).
- API: `~/Developer/Repositorios/resumo-chat-api` (Spring Boot, Cloud Run, `deploy.sh`).

## 1. Intenção

O Felipe é técnico de suporte de ERP. Há momentos em que ele não quer digitar uma resposta para o cliente: quer receber um texto pronto, copiar ou inserir e mandar.

Hoje o "Consultar Docs" é um chat com o manual do SoftenDocs e, nas palavras dele, "está muito bom". O "Sugerir resposta", por outro lado, não está no mesmo nível:
- abre um cartão espremido dentro da área do dock;
- mostra um rascunho por vez;
- para corrigir, há só um campo de uma linha ("Direcionar/Ajustar").

O pedido tem três partes:
1. O Sugerir resposta passa a ser um **chat igual ao Consultar Docs**, e esse é o modo principal (não um extra).
2. Ele usa o SoftenDocs como fonte **quando for necessário**.
3. No dock, o **Consultar Docs ganha destaque** e o **Sugerir resposta perde destaque**.

## 2. Objetivos

1. **Dock (opção A do mockup, escolhida pelo Felipe).** O grupo que hoje é "botão Sugerir resposta + link Consultar Docs" se inverte:
   - **Consultar Docs** vira o botão do grupo, com o estilo azul suave que hoje é do Sugerir resposta (`.atendeai-reply-primary`) e um ícone;
   - **Sugerir resposta** vira o link pequeno embaixo (estilo `.gemini-preserved-link`).

   O resto do dock não muda.
2. **Sugerir resposta abre uma janela de chat** com o mesmo formato, tamanho e posição da janela do Consultar Docs. Ela substitui o cartão atual dentro do dock.
3. **Toda resposta da IA é um texto pronto para mandar ao cliente**, num quadro rotulado "Resposta para o cliente", com dois botões: **Copiar** e **Inserir no chat**.
4. **Correção conversando.** O técnico escreve normalmente ("ela já tentou e continua dando erro", "mais curto", "pede o XML") e recebe uma nova versão da resposta.
5. **Manual automático.** O SoftenDocs entra sozinho quando o assunto pede, por exemplo quando o cliente pergunta como fazer algo ou relata um erro do sistema. Ele não entra em Cobrar e Encerrar. Embaixo da resposta ("Base: …", com links para `docs.softensistemas.com.br`) aparecem só as páginas que a resposta **usou**, não todas as encontradas. Como isso funciona está na seção 7.2.
6. **Conversa presa ao atendimento.** Ao trocar de cliente e voltar, a conversa continua de onde parou. Num atendimento novo, ela começa vazia.
7. **Tudo o que já existe continua valendo:**
   - os botões rápidos (Resolver, Pedir info, Aviso, Cliente difícil, Cobrar, Encerrar);
   - os Avisos do dia;
   - o Adendo para resposta;
   - as amostras de estilo do técnico;
   - as regras de escrita do `SmartReplyService.POLICY`.

## 3. Fora do escopo

- O chat do Sugerir resposta não explica nada para o técnico: ele sempre produz texto para o cliente. Para entender algo do sistema, o técnico usa o Consultar Docs.
- O Consultar Docs não muda por dentro. Muda só a posição e o destaque do botão no dock.
- Os outros botões do dock não mudam (Gerar Relatório, Conversas preservadas, Mensagens Padrão, Agenda, Observações, Configurações).
- Não entra modelo nem provedor novo. Continua Claude (`ANTHROPIC_MODEL`, hoje `claude-haiku-5-5`) primeiro, com Gemini de reserva, como no `SmartReplyService` atual.
- A extensão nunca envia mensagem ao cliente sozinha.

## 4. Seria um fracasso se…

- **Gerasse algo ao abrir a janela.** O Felipe já decidiu que o Sugerir resposta abre vazio (commit `c3aba3f`), por causa de custo e controle. Na janela nova, nada é gerado até ele clicar num botão rápido ou enviar uma mensagem.
- **Passasse do teto de custo de IA.** O Felipe paga do próprio bolso: hoje ≈ R$10/mês, com teto de ≈ R$20/mês.
- **Mostrasse ou inserisse uma resposta escrita para outro atendimento.**
- **Voltasse a soar como IA.** A lista "NUNCA USE" e o `ReplyPolish` continuam valendo para toda mensagem do chat.
- **Cobrisse elementos nativos do SZ.chat** (badges, contadores, •••) ou o campo de digitação do SZ. A janela fica onde a do Consultar Docs já fica (fixa, `right: 20px; bottom: 130px`), e essa posição o Felipe já usa e aprovou.
- **Renderizasse texto do modelo como HTML.** O texto vira nós DOM, como faz o `docs.js`.
- **Quebrasse as versões antigas da extensão** que ainda chamam `POST /api/gemini/responder` com o payload de hoje.

## 5. Restrições

- **Custo.** Cada mensagem do chat manda de novo o atendimento inteiro (limitado como hoje por `boundContext`, 16.000 caracteres) e mais o histórico do chat. Por isso uma correção custa um pouco mais que o "↻ Outra" de hoje.
  - O histórico enviado precisa de teto (seção 7.2).
  - **Conferência de custo antes do release** (o `eval/smart-reply/monthly-cost.mjs` não serve como está: só conhece preços do Gemini e não lê as linhas `claude_usage`):
    1. Medir nos logs do Cloud Run (`claude_usage feature=smart_reply`) quantas chamadas houve nos últimos 30 dias e a média de tokens de entrada, saída e `cacheRead`.
    2. O `cacheRead` mostra se o `POLICY` está mesmo em cache. Se for 0, a conta usa o preço cheio de entrada.
    3. Pegar o preço atual do modelo configurado em `ANTHROPIC_MODEL` na tabela oficial da Anthropic (não de memória).
    4. Estimar o custo do mês com o chat. Cada chamada fica mais longa pelo histórico (até o teto da seção 7.2). Supor 1,5 chamada por resposta inserida, contando as correções. *(Premissa minha.)*
    5. Uma conta à mão anotada no PR basta; estender o script é opcional.
  - **Se a estimativa passar de R$20/mês**, cortar nesta ordem: histórico de 12 para 6 turnos; depois mandar só a última troca (última resposta + pedido atual). *(Decisão minha.)*
  - O mesmo levantamento mostra se o limite de 30 chamadas/min por instância (compartilhado por todos os técnicos) fica apertado. Se ficar, registrar no PR; mudar o limite não está no escopo.
- **Ordem de deploy.** O `SmartReplyRequest` rejeita campos desconhecidos (`@JsonAnySetter` → 400). Por isso **a API precisa estar publicada antes** de liberar a extensão que manda o campo novo. O deploy (`deploy.sh`) é ação externa e só acontece com o OK do Felipe.
- **Privacidade.** As conversas do chat ficam só em `chrome.storage.local`, como as do Consultar Docs. Nada novo é gravado no servidor.
- **Isolamento de CSS.** Todo ID ou classe nova de raiz precisa entrar na lista de escopo de `styles/tokens.css`. O `tests/css-isolation.test.js` verifica isso.

## 6. Como fica a tela (decidido com o Felipe no mockup)

Mockup aprovado: `.superpowers/brainstorm/51095-1793938118/content/chat-resposta.html`.

### 6.1 Dock

```
[ Gerar Relatório        ]
[ Conversas preservadas  ]   ← grupo 1, sem mudança

[ 📘 Consultar Docs      ]   ← botão azul suave (estilo que era do Sugerir resposta)
[ 💬 Sugerir resposta    ]   ← link pequeno, estilo .gemini-preserved-link
```

- Os IDs atuais continuam: `btnConsultarDocsLoop` e `btnSmartReply`. Assim os interruptores de visibilidade da página de opções (`btnSmartReply`, `btnConsultarDocsLoop`) e o foco de volta ao fechar seguem funcionando.
- Se só um dos dois estiver visível, ele aparece sozinho no grupo, como acontece hoje.

### 6.2 Janela do Sugerir resposta

De cima para baixo:

1. **Cabeçalho:** "Sugerir resposta", link **Nova** (limpa a conversa deste atendimento) e **×**.
2. **Linha de contexto:**
   - "Lendo o atendimento de **{nome do cliente}**";
   - o botão **Avisos (n)**, que abre o mesmo painel de avisos que existe hoje no cartão (adicionar, validade, remover);
   - a marca **adendo** quando o Adendo para resposta foi usado.

   O selo de produto que aparece no mockup é opcional: só entra se a extensão já souber o produto com segurança. *(Decisão minha.)*
3. **Mensagens:**
   - Com a conversa vazia, aparecem os botões rápidos como ponto de partida, mais uma dica curta.
   - Mensagem do técnico: balão à direita, como no Consultar Docs. Um clique num botão rápido vira uma mensagem com o nome dele ("Resolver").
   - Mensagem da IA: rótulo "Resposta para o cliente", quadro com o texto, botões **Copiar** e **Inserir no chat**, e "Base: [1] …" quando usou o manual.
   - Erro: balão de erro, como no Consultar Docs.
4. **Campo de mensagem:** "Diga o que responder, ou corrija a última… (Enter envia)". Shift+Enter quebra linha. As teclas digitadas não chegam aos atalhos do SZ (`stopPropagation`), e Esc fecha.

Os botões rápidos também ficam acessíveis depois da primeira resposta, numa fileira compacta acima do campo. *(Decisão minha: o técnico pode querer "Encerrar" no fim de uma conversa longa.)*

## 7. Comportamento

### 7.1 Extensão

**Abrir e fechar**
- Clicar em "Sugerir resposta" abre a janela do atendimento ativo. Clicar de novo, ou ×, ou Esc, fecha.
- Só uma das duas janelas fica aberta por vez: abrir o Sugerir resposta fecha o Consultar Docs, e vice-versa. As duas ocupam o mesmo lugar. *(Decisão minha.)*

**Atendimento**
- A janela sempre mostra a conversa do atendimento ativo. Se o técnico troca de atendimento com a janela aberta, ela passa a mostrar a conversa do novo atendimento (vazia, se for novo).
- Uma resposta que chega depois da troca é guardada na conversa do atendimento de origem e não aparece no novo.
- A identidade do atendimento é a que o Sugerir resposta já usa com segurança: o token de `ChatCaptureModule.identificarAtendimentoResposta()`. Ele também é a chave da conversa guardada. O módulo continua sem depender do `RecoveryBufferModule`, e um teste existente garante isso. Sem identidade segura, a janela mostra o aviso atual ("Não foi possível identificar com segurança o atendimento ativo…") e não gera nada.

**Guardar**
- `chrome.storage.local`, com uma conversa por atendimento.
- Validade de 24 h desde a última mensagem, no máximo 50 conversas e 40 mensagens por conversa.
- Gravação serializada com o padrão `enqueue`/`navigator.locks` dos módulos vizinhos.
- Os números são decisão minha; o builder pode ajustar.

**Gerar**
- Toda mensagem do técnico lê o atendimento como ele está naquele momento (`capturarConversaRotulada`).
- Vão junto, como hoje: adendo, avisos ativos, amostras de estilo e a intenção (quando foi um botão rápido).
- Vai também o histórico do chat (seção 7.2).

**Resposta desatualizada**
- Se o cliente manda mensagem nova depois de uma resposta, aparece a nota "O cliente mandou mensagem nova. Envie algo para atualizar."
- **Inserir no chat** fica desabilitado nas respostas antigas, na resposta desatualizada e quando o atendimento não bate, como a regra de segurança de hoje.
- **Copiar** funciona sempre. *(Decisão minha.)*

**Inserir no chat**
- Usa a lógica atual de `insert`: localiza o composer com segurança, pergunta Substituir/Acrescentar/Cancelar quando já há rascunho e confere de novo o atendimento antes de escrever.
- A janela continua aberta depois de inserir. *(Decisão minha: é uma conversa e pode continuar.)*

**Copiar**
- `navigator.clipboard.writeText`, com um retorno visual curto ("Copiado").
- **Copiar e Inserir chamam `StyleSamplesModule.noteInserted(texto)`.** Sem isso, um texto da IA colado e enviado seria aprendido como a voz do técnico.

**Texto da resposta**
- Não é editável na janela. O técnico corrige conversando ou edita no campo do SZ depois de inserir. *(Decisão minha: o chat substitui a edição no lugar.)*

**Código antigo**
- O cartão dentro do dock sai: `lockDock`, o layout do cartão e o CSS correspondente em `styles/smart-reply.css`.
- O painel de avisos e a lógica de segurança de inserção são reaproveitados.
- A renderização de mensagens (texto como nós DOM, links só para o site oficial) pode ser compartilhada com o `docs.js`.

### 7.2 API (`POST /api/gemini/responder`)

**Proposta:** um campo opcional novo, `messages`, no `SmartReplyRequest`. O builder pode trocar por um endpoint novo se achar mais limpo, desde que o payload antigo continue funcionando.

**Formato de `messages`**
- Lista de turnos do chat: `{ "role": "user" | "assistant", "content": "..." }`.
- `user` são as mensagens do técnico; `assistant` são as respostas que a IA já deu.
- Os turnos alternam, começam e terminam com `user`.

**Limites** (a extensão manda os turnos mais recentes que cabem, como o `messagesForApi` do `docs.js`; os números são decisão minha):
- até 12 turnos;
- cada turno com até 1.500 caracteres;
- até 8.000 caracteres no total.

**Combinações**
- Com `messages`, os campos `replyInstruction`, `currentReply` e `regenerate` não são aceitos (400).
- Sem `messages`, tudo funciona exatamente como hoje.

**Prompt.** O `POLICY` ganha uma seção CHAT, nos termos de hoje:
- `messages` é a conversa do técnico com o assistente;
- a última mensagem do técnico é o pedido atual: objetivo, correção ou fato novo ("ela já tentou");
- a última resposta do assistente é a base quando o pedido é um ajuste;
- a saída continua sendo só o texto da mensagem ao cliente;
- as mensagens do técnico são instrução de objetivo, mas nunca mudam as regras de FATOS e NUNCA USE (o mesmo limite que DIRECIONAR tem hoje).

**Manual "quando necessário"** (vale para o modo chat e para o payload antigo)

O manual passa por três filtros:
1. **Pela intenção.** Com `intent` igual a `cobrar_retorno` ou `encerrar`, não há busca no manual. Nas outras intenções e em mensagem livre, há busca. *(Decisão minha: `cliente_dificil` continua buscando, porque o cliente irritado em geral tem um problema técnico de fundo.)*
2. **Pela relevância.** A busca no `DocsIndex` continua com o mesmo filtro (`DOCS_MIN_MATCHED_TERMS`). No modo chat, a consulta inclui também a última mensagem do técnico, além do começo e do fim do atendimento. Assim um pedido como "explica como emitir em contingência" acha a página certa. Se nada passa no filtro, não vai documentação.
3. **Pelo uso.** Os trechos vão numerados (`[1]`, `[2]`, `[3]`). O prompt pede que a saída termine com uma linha de controle `FONTES: 1,3` ou `FONTES: nenhuma`. A API remove essa linha antes do `ReplyPolish` e devolve em `sources` só as páginas citadas.
   - Sem a linha, ou com ela malformada, `sources` vem vazio. É melhor não mostrar "Base:" do que mostrar uma página que não foi usada.
   - A linha nunca chega ao técnico.
   - Vale igual para o Claude e para o Gemini de reserva.

Não há uso de ferramentas (*tool use*) nem segunda chamada ao modelo. O tempo e o custo ficam como hoje.

**Resposta.** O formato não muda: `{ reply, sources }`.

**Limite de uso.** O mesmo `SmartReplyRateLimiter` (30/min).

## 8. O que fica com o builder

- O visual fino da janela, seguindo os tokens de `styles/tokens.css` e o padrão visual do `docs-chat.css`.
- A estrutura do código na extensão, incluindo o que compartilhar com o `docs.js`.
- O texto exato da seção CHAT do prompt, desde que siga a seção 7.2 e passe nos testes de salvaguarda existentes.
- Os limites numéricos marcados como decisão minha.
- Os testes:
  - reescrever `tests/smart-reply.test.js` para a janela de chat;
  - ajustar `tests/dock.test.js` para a nova ordem;
  - manter `tests/css-isolation.test.js` passando;
  - na API, testar a validação de `messages`, a compatibilidade com o payload antigo e a consulta ao manual com a mensagem do técnico.
- O release segue o padrão dos anteriores: versão 1.8.0 no `manifest.json` e o zip. O deploy da API vem antes e só acontece com o OK do Felipe.

## 9. Decisões minhas para o Felipe conferir

1. O selo de produto só aparece se a extensão já souber o produto.
2. Os botões rápidos continuam disponíveis depois da primeira resposta.
3. Só uma janela aberta por vez (Docs ou Sugerir resposta).
4. Copiar funciona sempre; Inserir só na resposta mais recente e atual.
5. A janela continua aberta depois de inserir.
6. O texto da resposta não é editável na janela.
7. A conversa vale por 24 h, com no máximo 50 conversas e 40 mensagens cada.
8. O histórico enviado à API tem até 12 turnos e 8.000 caracteres.
9. O manual não entra em Cobrar e Encerrar, mas entra em Cliente difícil.
10. "Base:" mostra só as páginas que a resposta citou; na dúvida, não mostra nenhuma.
11. Conferência de custo com os logs reais e premissa de 1,5 chamada por resposta. Se passar de R$20, o histórico é cortado primeiro.
