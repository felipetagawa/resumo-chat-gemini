# 1. Conversas abertas lado a lado

Inspeção em 09/11/2026, na aba autenticada `https://chat.softensistemas.com.br/soften-sistemas/chat`. Dois painéis observados, chamados **C1** e **C2** neste relatório. C1/C2 são aliases, não IDs enviados à API. Nenhum texto de mensagem foi registrado: `[txt:N]` indica o tamanho. Nomes, telefones e valores identificadores foram mascarados. `…` encurta classes/trechos estruturais, não representa um seletor literal.

**Evidência:** “DOM/API” significa observado nesta sessão; “bundle” significa leitura do JavaScript servido pela própria página (`/assets/index-oWiPwbJ-.js`), sem executar seus fluxos de atendimento.

## Painéis e identidade — DOM/API

- Existem **2** `article[data-conversa]`, um para cada conversa aberta.
- `GET /soften-sistemas/api/conversations/{id}` retornou **200 nos dois casos**; `response.id === article.dataset.conversa` foi **true em ambos**.
- Os dois retornaram `channel="widget"` (Site), `status="human"`, `queueStatus="attending"`, `isActive=true`, responsável e equipe preenchidos.
- Os valores exibidos no lugar do telefone são identificadores de visitante (`visitor_…`), não números de telefone. Não trate `contact.phoneNumber` como telefone numérico em todos os canais.

Seletores verificados:

```css
article[data-conversa]                           /* 2 */
article[data-conversa] > header                  /* 2 */
article[data-conversa] > .fundo-da-conversa       /* 2 */
article[data-conversa] > div:last-of-type > div > textarea /* 2, com drawer fechado */
```

Para escolher uma conversa, obtenha o ID do próprio article e sempre escopo as consultas nesse elemento. Com o drawer aberto, há outro textarea para notas: não use `article textarea` indiscriminadamente. Para o composer, exclua descendentes de `[role="dialog"]` e prefira o footer direto do article.

## Header — DOM

Estrutura completa de C1 abaixo, sem SVG e com classes longas abreviadas. C2 tem a mesma estrutura; seu fundo é `bg-card`, enquanto C1 tem `bg-amber-50 dark:bg-amber-500/10`.

```html
<header title="aaaaaaaaa (aaaaaaa_aa999a99-aaaa-9999-a99a-9aa999a9aa9a) — aaaa · aaaaa a · aaa aaaa" class="px-2 py-1.5 border-b border-border shrink-0 flex items-center gap-2  bg-amber-50 dark:bg-amber-500/10">
<div class="flex items-center gap-2 min-w-0 flex-1">
<span class="relative shrink-0">
<div class="flex items-center justify-center bg-muted text-foreground font-semibold select-none … rounded-full object-cover" aria-label="aaaaaaaaa">
<span class="text-[10px]">a</span>
</div>
<span title="aaaa" class="absolute -right-0.5 -bottom-0.5 w-3 h-3 rounded-full border-2 border-card bg-blue-600">
</span>
</span>
<div class="min-w-0 flex-1">
<p class="flex items-center gap-1.5 min-w-0 leading-tight">
<span class="text-[13px] font-bold truncate">aaaaaaaaa</span>
<span class="shrink-0 text-[9px] font-semibold text-muted-foreground border border-border rounded px-1" title="aaaaaa aaaa aaaaaaa aaaaa aaaaaaaa">aaa+9</span>
<span class="text-[10px] text-muted-foreground truncate min-w-0">aaaaaaa_aa999a99-aaaa-9999-a99a-9aa999a9aa9a</span>
</p>
<p class="flex items-center gap-1 min-w-0 text-[10px] font-medium leading-tight … text-emerald-600 dark:text-emerald-400">
<!-- icon lucide lucide-user w-3 h-3 shrink-0 -->
<span class="truncate">aaa aaaa· aaaaa a</span>
</p>
</div>
</div>
<div class="flex items-center gap-0.5 shrink-0 ">
<button type="button" title="aaaaaaaaaa" aria-label="aaaaaaaaaa" class="w-6 h-6 shrink-0 rounded-md flex items-center justify-center … dark:hover:bg-indigo-500/15 disabled:opacity-40">
<!-- ícone: lucide lucide-arrow-right-left w-3.5 h-3.5 -->
</button>
<button type="button" title="aaaaaaaa" aria-label="aaaaaaaa" class="w-6 h-6 shrink-0 rounded-md flex items-center justify-center … dark:text-emerald-400 dark:hover:bg-emerald-500/15">
<!-- ícone: lucide lucide-circle-check w-3.5 h-3.5 -->
</button>
<button type="button" title="aaaa aaaaa" aria-label="aaaa aaaaa" class="w-6 h-6 shrink-0 rounded-md flex items-center justify-center … dark:text-slate-300 dark:hover:bg-slate-700" id="radix-:rd:" aria-haspopup="menu" aria-expanded="false" data-state="closed">
<!-- ícone: lucide lucide-ellipsis w-3.5 h-3.5 -->
</button>
<button type="button" title="aaaaaaaaaaa aa aaaaaaa" aria-label="aaaaaaaaaaa aa aaaaaaa" aria-pressed="false" class="w-6 h-6 shrink-0 rounded-md flex items-center justify-center … hover:bg-sky-50 dark:hover:bg-sky-500/15">
<!-- ícone: lucide lucide-info w-3.5 h-3.5 -->
</button>
<button type="button" title="aaaaaa aaaa aaaaaa" aria-label="aaaaaa aaaa aaaaaa" class="w-6 h-6 shrink-0 rounded-md flex items-center justify-center … hover:bg-red-50 dark:hover:bg-red-500/15">
<!-- ícone: lucide lucide-x w-3.5 h-3.5 -->
</button>
</div>
</header>
```

Campos:

| Informação | Seletor relativo ao article | Evidência |
|---|---|---|
| Nome | `header p:first-of-type > span.font-bold` | texto mascarado `aaaaaaaaa` / `aaaaaa` |
| Telefone/identificador | `header p:first-of-type > span.min-w-0.text-muted-foreground` | `aaaaaaa_…`, identificador de visitante |
| Canal | `header span.relative > span[title]` | ponto azul; `title` real de UI: Site; forma mascarada `aaaa` |
| Estado/responsável/equipe | `header p:nth-of-type(2)` | ícone de usuário e texto mascarado com responsável/equipe |
| Atalho | `header p:first-of-type > span[title]` | badge `Alt+1` / `Alt+2`; `title` de UI indica foco no painel |

Formato do title, confirmado no bundle:

```text
{nome} ({telefone/identificador}) — {canal} · {equipe} · {estado/responsável}
```

Exemplo real mascarado de C1:

```text
aaaaaaaaa (aaaaaaa_aa999a99-aaaa-9999-a99a-9aa999a9aa9a) — aaaa · aaaaa a · aaa aaaa
```

## Balões — DOM e condições do bundle

**Cliente**: `.fundo-da-conversa > div.justify-start.group`, fundo `bg-card`.

```html
<div class="flex justify-start group">
<div class="flex flex-col max-w-[80%] min-w-0 items-start">
<div class="relative px-2.5 py-1.5 rounded-2xl text-[13px] leading-snug shadow-sm … border border-border/60">
<button type="button" aria-label="aaaaaa aa aaaaaaaa" class="absolute top-0.5 right-0.5 w-6 h-6 rounded-full flex … text-muted-foreground hover:bg-foreground/10" id="radix-:r11:" aria-haspopup="menu" aria-expanded="false" data-state="closed">
<!-- ícone: lucide lucide-chevron-down w-4 h-4 -->
</button>
<div class="flex items-end gap-2">
<div class="min-w-0 flex-1">
<p class="whitespace-pre-wrap break-words">[txt:9]</p>
</div>
<span class="shrink-0 mb-px flex items-center gap-1 text-[10px] leading-none … whitespace-nowrap text-muted-foreground">
<span>[txt:5]</span>
</span>
</div>
</div>
</div>
</div>
```

**Atendente humano**: `.fundo-da-conversa > div.justify-end.group`, fundo `bg-primary`.

```html
<div class="flex justify-end group">
<div class="flex flex-col max-w-[80%] min-w-0 items-end">
<div class="relative px-2.5 py-1.5 rounded-2xl text-[13px] leading-snug shadow-sm … text-primary-foreground rounded-tr-sm">
<button type="button" aria-label="aaaaaa aa aaaaaaaa" class="absolute top-0.5 right-0.5 w-6 h-6 rounded-full flex … text-white/80 hover:bg-black/20" id="radix-:r53:" aria-haspopup="menu" aria-expanded="false" data-state="closed">
<!-- ícone: lucide lucide-chevron-down w-4 h-4 -->
</button>
<div class="flex items-end gap-2">
<div class="min-w-0 flex-1">
<p class="whitespace-pre-wrap break-words">[txt:93]</p>
</div>
<span class="shrink-0 mb-px flex items-center gap-1 text-[10px] leading-none … whitespace-nowrap text-white/75">
<span>[txt:5]</span>
<!-- icon lucide lucide-check w-3.5 h-3.5 -->
</span>
</div>
</div>
</div>
</div>
```

**Agente de IA**: mesma direção à direita, fundo `bg-primary/80` e ícone com `aria-label="Enviada pelo Agente"`. O atributo pertence ao ícone, não ao balão.

```html
<div class="flex justify-end group">
<div class="flex flex-col max-w-[80%] min-w-0 items-end">
<div class="relative px-2.5 py-1.5 rounded-2xl text-[13px] leading-snug shadow-sm … text-primary-foreground rounded-tr-sm">
<button type="button" aria-label="aaaaaa aa aaaaaaaa" class="absolute top-0.5 right-0.5 w-6 h-6 rounded-full flex … text-white/80 hover:bg-black/20" id="radix-:r13:" aria-haspopup="menu" aria-expanded="false" data-state="closed">
<!-- ícone: lucide lucide-chevron-down w-4 h-4 -->
</button>
<div class="flex items-end gap-2">
<div class="min-w-0 flex-1">
<p class="whitespace-pre-wrap break-words">[txt:31]</p>
</div>
<span class="shrink-0 mb-px flex items-center gap-1 text-[10px] leading-none … whitespace-nowrap text-white/75">
<!-- icon lucide lucide-bot w-3 h-3 -->
<span>[txt:5]</span>
<!-- icon lucide lucide-check w-3.5 h-3.5 -->
</span>
</div>
</div>
</div>
</div>
```

Seletor sugerido para o balão de IA:

```css
.fundo-da-conversa > .group:has([aria-label="Enviada pelo Agente"])
```

**Sistema**, observado:

```html
<div class="flex justify-center my-1">
<div class="flex items-start gap-1.5 px-2.5 py-0.5 bg-muted/60 border border-border/40 rounded-2xl max-w-[90%]">
<!-- icon lucide lucide-info w-3 h-3 mt-0.5 shrink-0 text-muted-foreground -->
<span class="text-[10px] text-foreground">[txt:32]<span class="text-muted-foreground">[txt:1][txt:12]</span>
</span>
</div>
</div>
```

**Nota interna**: o bundle usa **o mesmo renderer centralizado** quando `metadata.internal === true` ou `fromType === "system"`. Portanto, `.justify-center.my-1` identifica o grupo visual, mas **não distingue nota interna de sistema**. Exemplo estrutural desse renderer, sem afirmar que uma nota separada foi encontrada:

```html
<div class="flex justify-center my-1">
  <div class="flex items-start gap-1.5 … bg-muted/60 border border-border/40 rounded-2xl max-w-[90%]">
    <!-- ícone informativo -->
    <span class="text-[10px] text-foreground">[txt:N]<span class="text-muted-foreground">· 99:99</span></span>
  </div>
</div>
```

Nas mensagens inspecionadas, os wrappers e balões não têm `data-message-id`, `data-id`, `data-author`, `data-direction`, ID de autor ou ID semântico de mensagem. A direção é indicada por classes. Os botões de opções têm IDs Radix (`radix-:…:`), `aria-haspopup="menu"`, `aria-expanded` e `data-state`; **esses IDs não são IDs da mensagem**. O bundle usa IDs de mensagem como keys React, que não viram atributos HTML.

O balão comum **não mostra o nome do atendente**: mostra conteúdo, horário, estado de envio e, quando aplicável, indicador de IA/edição. Uma citação pode mostrar autor da mensagem citada; isso não identifica o remetente do balão atual. Para autoria humana, use a API da seção 3.

## Campo de resposta — DOM/bundle

Nos dois painéis, o composer estava presente e `disabled=false`. Os campos de resposta não foram alterados.

```html
<div class="border-t border-border bg-card px-2 py-2">
  <div class="flex items-end gap-1.5">
    <input type="file" class="hidden" />
    <button type="button" aria-label="aaaaaa aaaaaaa"><!-- anexar --></button>
    <textarea rows="1" aria-label="aaaaaaaa aaaa aaaaaaaaa" placeholder="aaaaaaaa"
      class="flex-1 min-w-0 max-h-40 min-h-[36px] resize-none rounded-lg …"></textarea>
    <button type="button" aria-label="aaaaaa aaaaa" title="aaaaaa aaaaa"><!-- microfone --></button>
  </div>
</div>
```

- Placeholder mascarado: `aaaaaaaa`.
- aria-label mascarado: `aaaaaaaa aaaa {nome mascarado}`; selector sem nome de cliente: `textarea[aria-label^="Mensagem para "]`, excluindo dialogs.
- Com o composer vazio, **não havia botão Enviar**: havia `button[aria-label="Gravar áudio"]`.
- Pelo bundle, texto não vazio ou anexo faz aparecer `button[aria-label="Enviar"]`. Não digitei para testar essa transição.
- Pelo bundle, só há composer se `!encerrada && assignedUserId === meuId && status === "human"`. Nos demais estados, o textarea é **ausente/substituído**, não simplesmente disabled, e aparece “Assuma o atendimento para responder.” com botão Assumir. Não abri/assumi outra conversa para provocar o estado.

## Foco, Alt+N e ciclo de vida

- O foco efetivo é observável com `document.activeElement.closest('article[data-conversa]')` ou `article[data-conversa]:focus-within`.
- Durante a inspeção, **C2 continha o foco**, enquanto **C1 tinha a borda âmbar**. A borda `border-2 border-amber-500` e o fundo âmbar do header significam que a última mensagem não interna/não sistema veio do cliente e a conversa não está encerrada; **não são sinal de foco** (condição confirmada no bundle).
- Não apareceu atributo semântico de painel ativo nos articles.
- Há **Alt+1…N**, confirmado pelos badges e pelo listener do bundle, que foca `[data-conversa="{id}"] textarea`. Não disparei atalhos.
- Pelo bundle, a grade é criada por uma lista de IDs e cada componente recebe a key React do ID da conversa: remover da lista desmonta o painel; acrescentar monta outro; manter a mesma key tende a preservar o painel. Isso é evidência de código, não teste empírico de recriação/reaproveitamento.
- **Não cliquei em cards, nem abri/fechei conversas**. O bundle mostra que abrir um card pode marcar como lida e, em certas atribuições, assumir automaticamente. O comportamento não foi acionado para testar ciclo de vida.

# 2. Lista de conversas / fila

## Container, cards e abas — DOM

Seletores testados nesta página:

```css
main aside > div.overflow-y-auto                  /* 1 container de lista */
main aside [role="button"][tabindex="0"]          /* 2 cards */
main aside [role="button"][aria-current="true"]   /* conversas abertas, não apenas foco */
main aside [role="tablist"][aria-label="Quais atendimentos"]
main aside [role="tab"]
main aside [role="tab"][aria-selected="true"]
main aside [role="group"][aria-label="Canal"] button
main aside [role="group"][aria-label="Canal"] button[aria-pressed="true"]
```

Abas presentes: **Fila, Equipe, Meus**; Meus estava selecionada. Canais presentes: **Todos os canais, WhatsApp, Site, App, Telefone**. Não troquei abas/filtros. Pelo bundle, Instagram/Messenger/E-mail também podem aparecer conforme os canais ativos.

```html
<aside class="w-[300px] shrink-0 flex flex-col bg-card border-r border-border min-h-0">
  <div class="p-3 space-y-2.5 border-b border-border">
    <div role="tablist" aria-label="aaaaa aaaaaaaaaaaa" class="grid gap-1 rounded-lg bg-muted p-1">
      <button type="button" role="tab" aria-selected="false">Fila<span>9</span></button>
      <button type="button" role="tab" aria-selected="false">Equipe<span>99</span></button>
      <button type="button" role="tab" aria-selected="true">Meus<span>9</span></button>
    </div>
    <label class="flex items-center …"><input placeholder="aaaaaa aaaa aa aaaaaaaa" aria-label="aaaaaa aaaaaaaaaaa" /></label>
    <div role="group" aria-label="aaaaa" class="flex gap-1 flex-wrap">
      <button type="button" aria-pressed="true">Todos os canais</button>
      <button type="button" aria-pressed="false">WhatsApp</button>
      <button type="button" aria-pressed="false">Site</button>
      <button type="button" aria-pressed="false">App</button>
      <button type="button" aria-pressed="false">Telefone</button>
    </div>
  </div>
  <div class="flex-1 min-h-0 overflow-y-auto"><!-- cards abaixo --></div>
</aside>
```

Card observado, estrutura completa com ícones omitidos e classes abreviadas; o tempo foi normalizado para preservar apenas sua forma:

```html
<div role="button" tabindex="0" aria-current="true"
 title="aaaaaaaaa · aaaa · aaaaaa: aaaaa a · aaa: aaaaaa aaaaaa aaaaaaa"
 class="w-full flex flex-col gap-1 px-2.5 py-2 text-left … bg-primary/10 shadow-[inset_3px_0_0_hsl(var(--primary))]">
  <span class="flex items-center gap-1 min-w-0 h-5">
    <!-- ícone de responsável/status -->
    <span class="text-[10px] font-medium truncate flex-1 min-w-0 …">aaaaaa aaaaaa aaaaaaa · aaaaa a</span>
  </span>
  <span class="flex items-center gap-1.5 min-w-0">
    <span class="relative shrink-0">
      <div class="flex items-center justify-center …" aria-label="aaaaaaaaa"><span class="text-[9px]">a</span></div>
      <span title="aaaa" class="absolute -right-0.5 -bottom-0.5 … bg-blue-600"></span>
    </span>
    <span class="text-xs font-semibold truncate flex-1 min-w-0">aaaaaaaaa</span>
    <span class="shrink-0"><span title="aaaaaa aaaaaaaa aa 99/99/9999, 99:99:99" class="text-[10px] whitespace-nowrap …">99 aaa</span></span>
    <span title="9 aaaaaaaaa aaa aaaaaaaa" aria-label="9 aaa aaaaaaaa"
      class="shrink-0 min-w-[18px] h-[16px] … border-amber-500 …">9</span>
  </span>
  <span class="flex items-center gap-1.5 min-w-0 pl-[30px]">
    <span class="text-[11px] text-muted-foreground truncate flex-1 min-w-0">[txt:19]</span>
  </span>
</div>
```

| Campo | Localização relativa ao card | Observação |
|---|---|---|
| Responsável/equipe/estado | `:scope > span:nth-child(1) > span` | linha superior com ícone; usa responsável ou rótulo de IA/estado e equipe |
| Nome | `:scope > span:nth-child(2) > span.font-semibold` | texto mascarado |
| Canal | `:scope > span:nth-child(2) span.relative > span[title]` | ponto colorido e title; Site nos dois cards |
| Tempo | `:scope > span:nth-child(2) > span.shrink-0:not(.relative) > span[title]` | title mascarado `aaaaaa aaaaaaaa aa 99/99/9999, 99:99:99` |
| Sem resposta | `span[aria-label$="sem resposta"]` | badge **âmbar**, contador de mensagens sem resposta; observado |
| Última mensagem | `:scope > span:nth-child(3) > span:first-child` | `[txt:19]` em C1, `[txt:130]` em C2 |
| Não lidas | `:scope > span:nth-child(3) > span.bg-blue-700` | badge **azul**, condicional no bundle; não presente nos cards inspecionados |
| Etiquetas | `title` do card, condicional | bundle acrescenta `Etiquetas: …`; sem etiquetas nos dois casos, sem chip de etiqueta observado |

O relógio do card é calculado a partir de **lastMessageAt**, não de início/assunção do atendimento. Para tempo total de atendimento, a API expõe `startedAt`/`assumedAt`; não confunda com esse relógio.

`aria-current="true"`, `bg-primary/10` e sombra interna indicam **card aberto**. Ambos os cards tinham esses sinais ao mesmo tempo.

**Identidade do card:** não há `data-conversa`, outro data-ID, `href` ou `id` semântico nos cards observados. O bundle usa `item.id` como key React, mas isso não é um atributo DOM e não fornece um seletor CSS. Não associe card/conversa por índice ou apenas nome. Não houve validação de uma ponte estável para IDs nos cards nesta coleta.

# 3. API de mensagens e conversa

Todas as chamadas provocadas pela inspeção foram **GET** na própria origem, autenticadas dentro da aba. Nenhum valor de credencial, cookie ou cabeçalho de autorização foi exportado. Os IDs dos exemplos abaixo estão mascarados.

## Mensagens — API real

```text
GET /soften-sistemas/api/conversations/{C1.id}/messages?limit=10
HTTP 200
Corpo: array, 10 objetos; sem envelope e sem chaves de paginação.
Ordem: sentAt crescente; não decrescente.
```

Tipos observados nas dez mensagens, aplicáveis aos objetos completos abaixo:

```text
string: id, conversationId, type, fromType, content, status, sentAt, createdAt
null: replyToId, whatsappMessageId, mediaUrl, mediaType, ninaResponseTime,
      editedAt, deliveredAt, responseToMessageId
boolean: processedByNina (false em todas)
object: metadata ({} ou {autor:{id:string,nome:string}})
null|string: readAt (string nas quatro mensagens user; null nas seis human)
```

Valores reais preservados de `fromType`, `type` e `status`. **metadata contém identidade pessoal de atendente**, contrariando a premissa de que não há dados pessoais nesse campo: sua estrutura foi preservada, mas `autor.id/nome` foram mascarados para cumprir a privacidade. Não havia outros campos de metadata nessa amostra.

Abaixo, **cada linha é um objeto completo**, na ordem retornada (M1 a M10). As dez linhas juntas correspondem aos elementos do array; todas as chaves estão presentes, inclusive nulls:

```jsonl
{"id":"999aa9aa-99a9-999a-a9a9-9999a999aa99","conversationId":"aaa999a9-9a99-999a-9999-99a999aaa9aa","replyToId":null,"whatsappMessageId":null,"type":"text","fromType":"human","content":"[txt:64]","mediaUrl":null,"mediaType":null,"status":"sent","processedByNina":false,"ninaResponseTime":null,"metadata":{"autor":{"id":"a9999999-9999-99aa-9999-9a9aaa9a9a99","nome":"aaaaaa"}},"sentAt":"9999-99-99a99:99:99.999a","editedAt":null,"deliveredAt":null,"readAt":null,"createdAt":"9999-99-99a99:99:99.999a","responseToMessageId":null}
{"id":"a9aa9999-9999-99a9-99a9-9a99a9aaaaa9","conversationId":"aaa999a9-9a99-999a-9999-99a999aaa9aa","replyToId":null,"whatsappMessageId":null,"type":"text","fromType":"user","content":"[txt:41]","mediaUrl":null,"mediaType":null,"status":"read","processedByNina":false,"ninaResponseTime":null,"metadata":{},"sentAt":"9999-99-99a99:99:99.999a","editedAt":null,"deliveredAt":null,"readAt":"9999-99-99a99:99:99.999a","createdAt":"9999-99-99a99:99:99.999a","responseToMessageId":null}
{"id":"99a99999-aaa9-9a9a-9aaa-99a99aa9aaa9","conversationId":"aaa999a9-9a99-999a-9999-99a999aaa9aa","replyToId":null,"whatsappMessageId":null,"type":"text","fromType":"human","content":"[txt:21]","mediaUrl":null,"mediaType":null,"status":"sent","processedByNina":false,"ninaResponseTime":null,"metadata":{"autor":{"id":"a9999999-9999-99aa-9999-9a9aaa9a9a99","nome":"aaaaaa"}},"sentAt":"9999-99-99a99:99:99.999a","editedAt":null,"deliveredAt":null,"readAt":null,"createdAt":"9999-99-99a99:99:99.999a","responseToMessageId":null}
{"id":"a99aa99a-9a99-9aaa-a99a-99a9999aa999","conversationId":"aaa999a9-9a99-999a-9999-99a999aaa9aa","replyToId":null,"whatsappMessageId":null,"type":"text","fromType":"human","content":"[txt:11]","mediaUrl":null,"mediaType":null,"status":"sent","processedByNina":false,"ninaResponseTime":null,"metadata":{"autor":{"id":"a9999999-9999-99aa-9999-9a9aaa9a9a99","nome":"aaaaaa"}},"sentAt":"9999-99-99a99:99:99.999a","editedAt":null,"deliveredAt":null,"readAt":null,"createdAt":"9999-99-99a99:99:99.999a","responseToMessageId":null}
{"id":"99a9999a-9999-999a-9a99-9a9a999a9a99","conversationId":"aaa999a9-9a99-999a-9999-99a999aaa9aa","replyToId":null,"whatsappMessageId":null,"type":"text","fromType":"human","content":"[txt:62]","mediaUrl":null,"mediaType":null,"status":"sent","processedByNina":false,"ninaResponseTime":null,"metadata":{"autor":{"id":"a9999999-9999-99aa-9999-9a9aaa9a9a99","nome":"aaaaaa"}},"sentAt":"9999-99-99a99:99:99.999a","editedAt":null,"deliveredAt":null,"readAt":null,"createdAt":"9999-99-99a99:99:99.999a","responseToMessageId":null}
{"id":"9aa9a999-a9aa-9aa9-aaa9-aaa9a999a999","conversationId":"aaa999a9-9a99-999a-9999-99a999aaa9aa","replyToId":null,"whatsappMessageId":null,"type":"text","fromType":"human","content":"[txt:64]","mediaUrl":null,"mediaType":null,"status":"sent","processedByNina":false,"ninaResponseTime":null,"metadata":{"autor":{"id":"a9999999-9999-99aa-9999-9a9aaa9a9a99","nome":"aaaaaa"}},"sentAt":"9999-99-99a99:99:99.999a","editedAt":null,"deliveredAt":null,"readAt":null,"createdAt":"9999-99-99a99:99:99.999a","responseToMessageId":null}
{"id":"aaa9a999-a99a-99aa-a999-a9aa99999a99","conversationId":"aaa999a9-9a99-999a-9999-99a999aaa9aa","replyToId":null,"whatsappMessageId":null,"type":"text","fromType":"user","content":"[txt:66]","mediaUrl":null,"mediaType":null,"status":"read","processedByNina":false,"ninaResponseTime":null,"metadata":{},"sentAt":"9999-99-99a99:99:99.999a","editedAt":null,"deliveredAt":null,"readAt":"9999-99-99a99:99:99.999a","createdAt":"9999-99-99a99:99:99.999a","responseToMessageId":null}
{"id":"9a999999-9aa9-9a99-9a99-aaa9a999a9aa","conversationId":"aaa999a9-9a99-999a-9999-99a999aaa9aa","replyToId":null,"whatsappMessageId":null,"type":"text","fromType":"human","content":"[txt:44]","mediaUrl":null,"mediaType":null,"status":"sent","processedByNina":false,"ninaResponseTime":null,"metadata":{"autor":{"id":"a9999999-9999-99aa-9999-9a9aaa9a9a99","nome":"aaaaaa"}},"sentAt":"9999-99-99a99:99:99.999a","editedAt":null,"deliveredAt":null,"readAt":null,"createdAt":"9999-99-99a99:99:99.999a","responseToMessageId":null}
{"id":"a9999aa9-aa99-99a9-aaaa-99a9a99a9999","conversationId":"aaa999a9-9a99-999a-9999-99a999aaa9aa","replyToId":null,"whatsappMessageId":null,"type":"text","fromType":"user","content":"[txt:11]","mediaUrl":null,"mediaType":null,"status":"read","processedByNina":false,"ninaResponseTime":null,"metadata":{},"sentAt":"9999-99-99a99:99:99.999a","editedAt":null,"deliveredAt":null,"readAt":"9999-99-99a99:99:99.999a","createdAt":"9999-99-99a99:99:99.999a","responseToMessageId":null}
{"id":"9a9aaa99-9aaa-99aa-999a-a9a9aa999a99","conversationId":"aaa999a9-9a99-999a-9999-99a999aaa9aa","replyToId":null,"whatsappMessageId":null,"type":"text","fromType":"user","content":"[txt:19]","mediaUrl":null,"mediaType":null,"status":"read","processedByNina":false,"ninaResponseTime":null,"metadata":{},"sentAt":"9999-99-99a99:99:99.999a","editedAt":null,"deliveredAt":null,"readAt":"9999-99-99a99:99:99.999a","createdAt":"9999-99-99a99:99:99.999a","responseToMessageId":null}
```

## Autoria e usuário logado

- Existe **`metadata.autor.id` e `metadata.autor.nome` nas seis mensagens `fromType="human"`** da amostra.
- Não há campo top-level `senderId`/`sentBy`/`userId` nessas mensagens. Não conclua ausência de autoria por procurar somente no nível superior.
- Na sessão inspecionada, **`localStorage.auth.user` não existe**. Suas chaves são, portanto, `[]`; não é possível comparar diretamente com esse caminho.
- O bundle obtém o usuário por **GET `/soften-sistemas/api/auth/me`**, que também foi consultado: **HTTP 200**.
- Chaves retornadas de `/auth/me`: `id`, `email`, `fullName`, `createdAt`, `tenantId`, `tenantSlug`, `profile`, `userRole`. Nenhum desses valores pessoais foi exportado.
- Comparação realizada dentro da aba: `metadata.autor.id === authMe.id` deu **true em M1, M3, M4, M5, M6 e M8**. M2, M7, M9 e M10 são `user` e não possuem `metadata.autor`.
- Pelo bundle, `user` representa cliente, `human` atendente, `nina` IA, `system` sistema. IA/sistema foram vistos no DOM/código; **não aparecem nessas dez mensagens mais recentes**.

## Paginação — API real + bundle

```text
GET /soften-sistemas/api/conversations/{C1.id}/messages?limit=10&before={M1.id}
HTTP 200
Corpo: array, 10 mensagens
Ordem: sentAt crescente
Todas anteriores à primeira mensagem da página inicial: true
Sobreposição de IDs entre as duas páginas: 0
Campo temMais/hasMore no corpo: ausente
```

`before` recebe **ID da mensagem**, não timestamp. No bundle, o cliente usa o primeiro ID não temporário da lista, antepõe os registros recebidos e deduz `temMais` por `quantidadeRecebida === limit` (na tela, lote padrão 50). Não percorri até o fim do histórico para testar a última página.

## Conversa — API real

```text
GET /soften-sistemas/api/conversations/{id}
HTTP 200 em C1 e C2
Corpo: objeto
id === article.dataset.conversa: true nos dois
```

Chaves top-level do objeto C1:

```text
id, contactId, status, isActive, assignedTeamId, assignedUserId, channel, origem, queueStatus, queuedAt, assumedAt, unansweredCount, firstHumanResponseAt, archivedAt, archivedBy, archivedReason, tags, ninaContext, metadata, startedAt, lastMessageAt, createdAt, updatedAt, userId, motivoEncerramentoId, solucaoEncerramento, canalId, agenteId, contact, assignedTeam, state, transfers
```

Campos principais e tipos/valores:

```json
{
  "id": "aaa999a9-9a99-999a-9999-99a999aaa9aa",
  "contactId": "a9999999-999a-9999-99aa-a999aa99aa99",
  "status": "human",
  "queueStatus": "attending",
  "channel": "widget",
  "isActive": true,
  "assignedUserId": "a9999999-9999-99aa-9999-9a9aaa9a9a99",
  "assignedTeamId": "999aaa99-999a-9a99-aaa9-aaaa99a9a9a9",
  "assignedTeam": {"id":"999aaa99-999a-9a99-aaa9-aaaa99a9a9a9","name":"aaaaa a","isActive":true},
  "contact": {"id":"a9999999-999a-9999-99aa-a999aa99aa99","name":"aaaaaaaaa","phoneNumber":"aaaaaaa_aa999a99-aaaa-9999-a99a-9aa999a9aa9a","email":null,"tags":[]},
  "tags": [],
  "userId": null,
  "state": null,
  "archivedAt": null
}
```

- `contact` e `assignedTeam` são objetos; `transfers` é array com IDs de origem/destino de usuário/equipe e datas.
- `assignedUserId` identifica o responsável; **`userId` estava null** e não deve ser usado como seu substituto.
- O objeto individual inspecionado não trouxe `assignedUserName` top-level. O bundle também aceita esse campo e usa resumos da listagem; o nome exibido no header pode vir desse resumo.
- `queuedAt`, `assumedAt`, `firstHumanResponseAt`, `startedAt`, `lastMessageAt`, `createdAt`, `updatedAt` são strings de data/hora no exemplo. `origem`, `archivedBy`, `archivedReason`, `motivoEncerramentoId`, `solucaoEncerramento` estavam null; `unansweredCount` é number; `ninaContext`/`metadata` são objetos.
- `contact` também inclui `whatsappId`, `callName`, `profilePictureUrl`, `source`, `isBusiness`, `isBlocked`, `blockedAt`, `blockedReason`, `notes`, `ramo`, `situacao`, `clientMemory`, `firstContactDate`, `lastActivity`, `createdAt`, `updatedAt`, `userId`.
- Não reproduzi textos livres de `notes`, formulários, memória de contato ou conteúdo de tracking. Não são necessários para mapear a integração.

# 4. Tempo real e notificações

**Bundle:** a página inclui **Socket.IO/Engine.IO**, com transportes `websocket` e `polling`, inscrição/desinscrição por conversa (`conversation:join`/`conversation:leave`) e reconexão. Não abri uma nova conexão nem emiti inscrições/eventos.

Nomes encontrados nos handlers do JavaScript servido:

```text
message:new
message:updated
message:status
conversation:updated
conversations:updated
conversation:new
conversation:closed
connect
disconnect
connect_error
reconnect_attempt
```

`conversation:closed` foi encontrado no módulo de widget do mesmo bundle; sua utilização na tela de atendimento não foi confirmada. Os handlers da tela de chat inspecionados incluem os três eventos `message:*` e atualizações de conversa.

**Limite da evidência:** essa lista é de listeners no bundle, **não de frames observados chegando nesta sessão**. Não houve captura do socket existente; nenhum evento ou mensagem de teste foi enviado. Portanto, não posso afirmar quais desses eventos efetivamente chegaram durante a coleta.

Notificações e sinais:

- Card: badge azul de não lidas (`a.naoLidas > 0`, bundle), badge âmbar de sem resposta (`a.semResposta > 0`, visto em C1). São contadores diferentes.
- Painel: borda/header âmbar quando a última mensagem relevante é do cliente, observado em C1.
- Abas Fila/Equipe/Meus têm contadores de conversas, não devem ser tratados automaticamente como contadores de mensagens.
- Existe região de notificações `section[aria-live="polite"][aria-relevant="additions text"]`, vazia no momento. O bundle prevê toasts de conversa direcionada/fila e reconexão; não provoquei esses estados.
- O título da aba não tinha contador `(N)`/`[N]` no momento da inspeção. Alteração do título, badge azul novo e toast com a chegada de uma mensagem **não foram observados**.

Trecho de HTML da região observada:

```html
<section aria-label="aaaaaaaaaaaaa aaa+a" tabindex="-1"
 aria-live="polite" aria-relevant="additions text" aria-atomic="false"></section>
```

# 5. Layout geral e limites da verificação

Seletores testados:

```css
#root
main
main > div > div:has(> aside):has(article[data-conversa]) /* 1 tela de chat */
main aside                                              /* fila */
article[data-conversa]                                  /* painéis */
article[data-conversa] [role="dialog"][aria-label="Informações do cliente"]
```

```html
<div id="root">
  <div class="flex flex-col h-screen w-full …">
    <div class="flex flex-col md:flex-row flex-1 min-h-0 …">
      <!-- navegação geral fora de main -->
      <main class="flex-1 min-h-0 overflow-hidden flex flex-col">
        <header class="h-14 shrink-0 z-40 …"></header>
        <div class="flex-1 w-full min-h-0 relative overflow-auto bg-muted/30">
          <div class="flex h-full min-h-0 bg-background overflow-hidden">
            <aside class="w-[300px] …"><!-- fila --></aside>
            <section class="flex-1 min-w-0 flex flex-col min-h-0">
              <div class="flex items-center gap-3 px-4 py-2 …"><!-- toolbar e colunas --></div>
              <div class="flex-1 min-h-0 p-3 grid gap-3">
                <article data-conversa="{C1.id}">…</article>
                <article data-conversa="{C2.id}">…</article>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  </div>
</div>
```

**Drawer de detalhes:** abri somente “Informações do cliente”, cujo handler no bundle apenas alterna o painel local. Li a estrutura e fechei o mesmo painel. Estado final confirmado: drawer ausente, `aria-pressed="false"`. Nenhum select, textarea, etiqueta ou ação de atendimento foi alterado.

```html
<div role="dialog" aria-label="aaaaaaaaaaa aa aaaaaaa" tabindex="-1"
 class="absolute right-0 bottom-0 z-30 outline-none w-[min(340px,100%)] bg-card border-l border-border shadow-2xl flex flex-col">
  <div class="h-9 flex items-center px-3 border-b border-border shrink-0">
    <span class="font-semibold text-xs">Informações do cliente</span>
    <button type="button" aria-label="aaaaaa aaaaaaaaaaa"><!-- fechar informações --></button>
  </div>
  <div class="flex-1 overflow-y-auto p-3 space-y-4 text-xs">
    <!-- telefone/identificador, agenda, histórico, responsável, etiquetas, notas e origem -->
    <section><select aria-label="aaaaaaaaaaa aaaa aaaaaaaa">…</select></section>
    <section><textarea rows="3" placeholder="aaaaaaaaaaa aaaaa aaaa aaaaaaa (a aaaaaaa aaa aa)…">[txt:56]</textarea></section>
  </div>
</div>
```

O drawer é **absolute dentro do article**, não um drawer global fixo; pode cobrir parte daquele painel. Há um textarea de notas além do composer enquanto ele está aberto.

**Canto inferior direito:** nenhum elemento com `position:fixed` foi encontrado na primeira coleta; ao final, nenhum elemento fixo visível nesse canto. Isso não prova ausência de conflitos durante toast, modal ou chamada. O dock não deve cobrir composer, controles de áudio ou drawer.

**Tema:** `<html>` estava sem classe `dark`; preferência observada era `light`. O bundle/DOM incluem variantes `dark:*`, confirmando suporte estrutural ao tema escuro. Não alterei o tema nem validei seu visual.

**Não consegui verificar / não provoquei:**

- chegada real e sequência de eventos no socket existente;
- mudança de título/toast/contador com nova mensagem;
- exemplo de WhatsApp/App/Telefone aberto (as duas conversas eram Site/widget);
- conversa ainda não assumida no DOM (regra obtida do bundle);
- transição de microfone para Enviar (não digitei);
- nota com `metadata.internal=true` correlacionada a um balão específico; renderer comum identificado no bundle;
- abrir/fechar/trocar conversas para medir recriação/reuso real do article;
- identidade estável de cards da fila disponível em atributo DOM;
- última página/fim do histórico e todas as formas possíveis de mídia/metadata;
- tema escuro, redimensionamentos, responsividade e estados de chamada/modal.

Coleta limitada à leitura do DOM, GETs e código já servido. Nenhuma conversa foi enviada, assumida, transferida, encerrada ou reconfigurada pela inspeção. Os arquivos preexistentes da extensão foram preservados.
