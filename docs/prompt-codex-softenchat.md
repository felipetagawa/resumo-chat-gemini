Você vai inspecionar uma página web no meu Chrome, onde já estou logado, para mapear o HTML e a API do SoftenChat. O objetivo é migrar uma extensão do Chrome (AtendeAI), que hoje funciona no SZ.chat, para essa plataforma. **Só leia. Não clique em nada que envie, assuma, transfira ou encerre conversas. Não digite nos campos de mensagem. Não altere configurações.**

Página: https://chat.softensistemas.com.br/soften-sistemas/chat
Peça para eu deixar 2 ou 3 conversas abertas lado a lado antes de começar.

## Privacidade (obrigatório)
- Não copie o texto das mensagens dos clientes. Troque cada um por `[txt:N]`, onde N é o tamanho do texto.
- Mascare nomes e telefones mantendo só a forma: letras viram `a`, dígitos viram `9` (ex.: `Ana (5511...)` → `aaa (9999...)`).
- Nunca inclua `accessToken`, `refreshToken`, cookies ou cabeçalhos de autorização no resultado.

## O que eu preciso (responda cada item)

### 1. Conversas abertas lado a lado
O que já sei: cada conversa aberta é um `<article data-conversa="{id}">`.
- Confirme isso e diga se o `id` é o mesmo usado na API.
- `<header>` do article: estrutura completa (tags, classes, atributos), onde fica o nome do cliente, o telefone, o canal e o status, e o formato mascarado do atributo `title`.
- Balões de mensagem: estrutura de uma mensagem do cliente, uma do atendente, uma do agente de IA (com ícone "Enviada pelo Agente"), uma nota interna e uma de sistema. Diga se existe algum atributo (`data-*`, `aria-*`, `id`) que identifique a mensagem, o autor ou a direção, ou se só há classes do Tailwind (`justify-start`/`justify-end`, `bg-card`/`bg-primary`). Diga também se o balão mostra o nome do atendente.
- Campo de resposta: seletor do `textarea`, `placeholder` e `aria-label` (mascarado), botão Enviar e se o campo fica `disabled`/ausente quando a conversa não foi assumida ("Assuma o atendimento para responder").
- Como a página indica qual conversa está "ativa" ou em foco (classe, borda, atributo). Diga se há atalho Alt+N.
- Conversas aparecem e somem do DOM ao abrir/fechar? O `article` é recriado ou reaproveitado ao trocar de conversa?

### 2. Lista de conversas (coluna da esquerda / fila)
A extensão desenha coisas em cada card da fila (tempo de atendimento, contexto, controles).
- Container da lista e seletor de um card de conversa: estrutura completa de um card (tags, classes, atributos), onde ficam o nome do cliente, a última mensagem, o horário/tempo de espera, o canal (WhatsApp/site/app), o contador de não lidas, a etiqueta e o responsável.
- Como o card indica que a conversa está aberta/selecionada.
- O card tem algum id da conversa (`data-*`, `href`, `key`)?
- As abas da lista ("meus", equipe, etc.) e o filtro de canal: seletores.

### 3. API de mensagens
O que já sei: `GET /soften-sistemas/api/conversations/{id}/messages?limit=N`, com `Authorization: Bearer {localStorage.auth.accessToken}`.
- Faça a chamada para uma conversa aberta com `limit=10` e informe: status HTTP, se o corpo é array ou objeto (e as chaves), a ordem (`sentAt` crescente ou decrescente) e, para cada mensagem, **todas as chaves** com tipo/valor mascarado. Para os campos `fromType`, `type`, `status`, `metadata`, mostre os valores reais (não são dados de cliente).
- **Importante:** existe algum campo que diga qual atendente enviou a mensagem (nome, `userId`, `senderId`, `sentBy`...)? Se houver id, compare com o id do usuário logado em `localStorage.auth.user` (mostre só as chaves de `auth.user` e se os ids batem).
- Como funciona a paginação (`before`, `temMais`)?
- `GET /soften-sistemas/api/conversations/{id}` (ou o equivalente que a página usa): chaves da conversa, especialmente nome/telefone do contato, status, responsável e equipe.

### 4. Tempo real e notificações
- A página usa socket (engine.io/socket.io)? Liste os nomes dos eventos que chegam quando entra uma mensagem nova (por ex. `message:new`, `message:updated`), sem o conteúdo.
- Onde aparecem os avisos de mensagem nova ou não lida (título da aba, badge no card, toast)?

### 5. Layout geral
- Seletor do container principal da tela de chat e do painel/drawer de detalhes do contato, se houver.
- Algum elemento fixo no canto inferior direito que possa conflitar com um dock flutuante da extensão?
- A página tem tema escuro (classe `dark` no `<html>`)?

## Formato da resposta
Um único bloco de Markdown com as seções 1 a 5. Em cada uma, coloque os seletores CSS sugeridos e trechos de HTML **resumidos** (sem SVG, com classes longas encurtadas e textos mascarados como descrito acima). No fim, liste o que você não conseguiu verificar.
