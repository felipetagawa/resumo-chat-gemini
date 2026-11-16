# Marcações do Pré-atendimento no SoftenChat — Design curto

Data: 16/11/2026. Versão alvo: 1.10.0.
Status: **aguardando aprovação do Felipe**.

## Intenção

Na SZ, quem é do Pré-atendimento tinha duas marcações em cada chat "Em atendimento" (`modules/pre-controls.js`):
um **cronômetro** (verde até 5 min, amarelo até 10 min, vermelho depois) e o botão **💸** para marcar se o cliente
está em negociação. A equipe usa isso para se organizar. Com a troca para o SoftenChat
(`chat.softensistemas.com.br`) as marcações sumiram, porque o módulo só reconhece os cards da SZ.
Queremos as mesmas marcações, adaptadas à nova plataforma.

## Metas

- Mesmo público: só o setor Pré-atendimento (com nome configurado), como antes.
- Cronômetro e 💸 em cada card da lista do SoftenChat cuja conversa está com a própria pessoa.
- Mesmas cores e limites de antes. Clicar no 💸 liga/desliga a negociação e **não** abre o chat.
- O cronômetro conta desde que a conversa ficou com a pessoa, mesmo que a página tenha sido aberta depois,
  e não zera ao recarregar.

## Fora do escopo

- Envio para a API: `POST /api/pre-controls` responde `410 Gone` desde que o backend parou de guardar. Nada é enviado.
- Cards da aba Fila que ainda não são de ninguém; marcações no topo da conversa aberta.
- Qualquer mudança no comportamento da SZ: `pre-controls.js` continua igual lá.

## Nunca pode acontecer

- Cobrir ou empurrar para fora elementos nativos do card (nome, relógio do SoftenChat, contadores, botão Assumir).
- Mostrar o tempo ou o 💸 no card errado. Na dúvida, o card fica sem marcação.

## Abordagens consideradas

- **A — Ler a conversa de cada card (escolhida pelo Felipe).** Um script no mundo da página (MAIN, como
  `crm-primefaces-bridge.js`) lê nas props React do card (React 18.3.1) o `item` que a própria página usa:
  `item.id`, `item.assignedUserId` e `meuId`. Com o ID, o início vem da API. Ponto fraco: depende de um detalhe
  interno do SoftenChat; se mudar, as marcações somem até ajustarmos.
- **B — Pelo nome do cliente, como na SZ.** Mais simples, mas começa atrasado se a página abrir depois,
  confunde homônimos e só funciona com a aba Meus aberta.
- **C — Só no topo da conversa aberta.** ID seguro, mas perde a visão da lista, que é o que organiza. Descartada.

## Como fica (A)

- **Ponte (MAIN):** marca cada card `main aside [role="button"][tabindex="0"]` com `data-atendeai-conversa="{id}"`
  e `data-atendeai-minha="1"` quando `item.assignedUserId === meuId` e a conversa está ativa (não encerrada).
  Roda de novo quando a lista muda. Card que não dá para ler fica sem atributo.
- **Módulo (content script, só SoftenChat + Pré-atendimento):** para cada card com `data-atendeai-minha="1"`,
  coloca no **fim da primeira linha do card** (a de "NOME · Equipe", hoje só texto) um cronômetro e o 💸,
  dentro do fluxo e sem posição absoluta: o texto nativo apenas corta antes.
- **Início do cronômetro:** `GET /{empresa}/api/conversations/{id}` → `assumedAt`; se houver transferência
  para a própria pessoa mais recente que isso, vale a transferência. Sem nenhum dos dois, vale a primeira vez
  que a extensão viu o card como seu. Guardado por conversa em `chrome.storage.local`, uma busca por conversa.
- **💸:** guardado por ID da conversa em `chrome.storage.local`. O clique para a propagação (clique e teclado),
  para o SoftenChat não abrir o chat.
- **Limpeza:** registros de conversas que não aparecem como suas há 7 dias são apagados.
- **Visual:** chips pequenos que funcionam no tema claro e no escuro do SoftenChat, com tooltip
  "Tempo de atendimento (desde que ficou com você)" para não confundir com o relógio nativo,
  que conta desde a última mensagem.

## Decisões minhas (para o Felipe conferir)

- Formato do tempo: `HH:MM:SS` até 24 h; a partir daí `Nd HHh` (os cards da lista ficam dias em Meus e o chip
  precisa caber em 300 px).
- Limpeza em 7 dias.
- Marcar em qualquer aba onde o card apareça como seu (Meus, Equipe), não só em Meus.

## Fica para quem implementar

- Nome exato do campo de transferências na resposta da API (`transfers`), a confirmar na página real.
- Como a ponte descobre a mudança da lista (observer no `aside`) e a cadência do cronômetro.
- Testes com o `tests/mini-dom.js` existente.
