# Retornos automáticos (Agenda & Gestão) — Design

Data: 06/11/2026. Versão alvo: 1.8.0.
Status: **aguardando revisão do Felipe**.

## 1. Problema

Quando o cliente pede "me chama amanhã para continuar", o procedimento oficial é salvar o atendimento no CRM (sistemaempresarialweb) com **Agendar** e uma data e hora, em vez de **Finalizar**. Isso importa porque é assim que qualquer pessoa da empresa consegue ver em que situação o cliente está.

Na prática quase ninguém agenda. O motivo:

- O atendimento agendado vai para o fim da lista da tela **Chamado por Técnico** (`/crm-chamado-por-tecnico`, hoje com 200+ linhas, todas vermelhas), e o botão **Atender** dele fica travado.
- Para reabrir, é preciso ir à **Consulta Chamados** (`/crm-consulta-chamado`). Lá é preciso escolher o técnico na lupa, marcar "Agendamento" com o período, marcar "Abertos" e filtrar. A lista mistura todos os técnicos e passa de 5000 registros por mês. Depois disso ainda é preciso abrir o menu da linha e escolher "Atendimentos".
- Então o técnico finaliza e guarda o retorno na memória. No dia seguinte nada o avisa, e a equipe perde a visibilidade do caso.

A **Agenda & Gestão** da extensão (abas Calendário, CRM, Kanban e Notas) não resolve isso, porque é um segundo lugar para digitar a mesma coisa num formulário de 7 campos. O único gancho automático que ela tem é o aviso de `modules/notifications.js`: ele aparece ao abrir o chat de um cliente que tem item salvo, mas depende do mesmo preenchimento manual.

Fato verificado em 06/11/2026: o link direto `https://www.sistemaempresarialweb.com.br/crm-atendimento/<id>` abre normalmente um atendimento agendado. É isso que torna possível reabrir com um clique.

## 2. Objetivo e critérios de sucesso

Tornar o agendamento oficial no CRM o caminho mais fácil. O técnico agenda, e o AtendeAI guarda sozinho, lembra na hora e leva de volta ao atendimento com um clique.

- Agendar no CRM custa poucos cliques a mais que finalizar. O técnico não digita nada além do que o CRM já pede.
- Na data e hora marcadas, o técnico é lembrado dentro do navegador.
- Reabrir um atendimento agendado (para finalizar com o resumo ou reagendar) é um clique, sem Consulta Chamados.
- O retorno sai da lista sozinho quando o atendimento é finalizado no CRM, e atualiza a data sozinho quando é reagendado.
- Um técnico que recebe a versão nova entende o recurso sem ninguém explicar.
- Custo de IA adicional: zero. Nenhuma chamada nova ao backend.

## 3. Para quem

- **Só o setor Suporte.** O setor está em `chrome.storage.local`, na chave `atendeai_user_sector` (valores `suporte` ou `preatendimento`); ver `content.js`. Para Pré-atendimento, nenhuma parte deste recurso aparece.
- Os técnicos trabalham com **dois monitores**: o AnyDesk ocupa um e o Chrome com o SZ.chat e o CRM fica visível no outro. Por isso um aviso dentro do navegador basta.
- Cada técnico usa o próprio navegador, e os retornos dele ficam nele (`chrome.storage.local`). A fonte oficial para a equipe continua sendo o CRM.

## 4. Experiência

Mockups de referência, apenas locais e ignorados pelo git: `.superpowers/brainstorm/76755-1793940844/content/` (`retornos-v2-explicito.html` e `retornos-v3-agendar.html`). Eles mostram a intenção, não o pixel final.

O fluxo de um retorno:

1. O técnico salva o atendimento no CRM com Agendar. O AtendeAI guarda o retorno.
2. Na hora marcada, o AtendeAI avisa.
3. O técnico chama o cliente pelo SZ.chat, **manualmente**, como já faz hoje.
4. Quando termina, o técnico abre o atendimento pelo AtendeAI, cola o resumo com o "Colar Resumo IA" que já existe, e então **Finaliza** (o retorno sai da lista) ou **Agenda de novo** (o retorno muda de data).

### 4.1 Na hora de agendar (`/crm-atendimento/<id>`)

Uma linha do AtendeAI fica logo abaixo do campo nativo **Data do agendamento**. Ela aparece só enquanto **Agendar** está selecionado (decisão minha) e contém:

- **Atalhos.** Padrão: `Amanhã 08:00`, `Amanhã 14:00` e `Segunda 08:00`, personalizáveis nas opções (seção 4.7).
  - "Amanhã" numa sexta ou num sábado vira segunda (decisão minha).
  - "Segunda" é sempre a próxima segunda depois de hoje (decisão minha).
- **Data e hora livres.** Dois campos simples ao lado dos atalhos. O técnico escolhe a hora ali mesmo, sem usar o calendário de setinhas do CRM.
- Clicar num atalho, ou escolher data e hora livres, **preenche o campo nativo do CRM** de um jeito que o CRM aceite ao salvar. O campo nativo continua sendo a verdade: se o técnico mexer direto nele, vale o que estiver nele.
- **Caixa "Me lembrar deste retorno"**, marcada por padrão.
  - Desmarcada, o CRM agenda normal e o AtendeAI não guarda nada. Exemplo real: agendar só para o líder cancelar depois, porque o cliente não respondeu.
  - Texto com a caixa marcada: "Ao salvar, eu guardo este retorno e te aviso na hora."
  - Texto com a caixa desmarcada: "Este agendamento não vira lembrete."

O que acontece depois de um **salvamento bem-sucedido** (só conta se o CRM aceitou; uma validação recusada não muda nada):

| Situação ao salvar | O AtendeAI faz |
|---|---|
| Agendar, caixa marcada, sem retorno para este atendimento | Cria o retorno |
| Agendar, caixa marcada, já existe retorno para este atendimento | Atualiza a data e hora (reagendamento) |
| Agendar, caixa desmarcada, já existe retorno | Remove o retorno (decisão minha: ele pediu para não ser lembrado) |
| Finalizar | Remove o retorno deste atendimento, se houver |

**Identidade do retorno.** A chave do retorno é o **protocolo**. Ele também guarda o **id da URL** (`crm-atendimento/<id>`), usado pelo botão Abrir.
- O Felipe confirmou que o link de quando ele agendou reabre o atendimento agendado.
- Mesmo assim, por segurança, toda vez que qualquer página `crm-atendimento/<id>` mostrar o protocolo de um retorno guardado, o id guardado é atualizado para o dessa página (decisão minha). Assim o Abrir segue certo mesmo se o CRM trocar o id do atendimento num reagendamento.
- Se a tela não tiver id na URL na hora de salvar, o retorno é guardado pelo protocolo e o id é preenchido na próxima visita a um atendimento com esse protocolo. Enquanto isso, o Abrir fica indisponível.

O retorno guarda o que a tela já mostra, sem o técnico digitar nada:
- o protocolo e o id do atendimento;
- o cliente e o solicitante;
- os telefones;
- o problema (campo Problema; se vazio, uma linha curta da Resolução);
- a data e hora do agendamento e o momento em que foi criado.

### 4.2 Aviso na hora marcada

- **Só dentro do navegador** (decisão do Felipe), nas abas do SZ.chat e do CRM que estiverem abertas. Sem notificação do sistema operacional.
- Conteúdo: o selo AtendeAI, "Retorno agora", o cliente, o produto ou problema, e de quando é ("agendado ontem por você").
- Ações:
  - **×**: fecha. Conta como visto, e o retorno continua na lista até ser finalizado, reagendado ou removido.
  - **Adiar**: 15 min, 1 h ou amanhã às 08:00.
- **Sem "Abrir atendimento" aqui** (decisão do Felipe): nessa hora ele vai chamar o cliente pelo SZ, não abrir o CRM.
- **Fica na tela até o técnico fechar ou adiar.** Não some sozinho, ao contrário do aviso atual de `notifications.js`, que some em 10 s.
- Fechar ou adiar numa aba vale para todas as abas.
- Retornos que venceram com o navegador fechado aparecem como atrasados assim que uma aba do SZ.chat ou do CRM abrir.
- Nunca cobre nem desloca elementos nativos do SZ.chat.

### 4.3 Faixa "Meus retornos" (`/crm-chamado-por-tecnico`)

- Fica no topo da tela, acima da tabela nativa CHAMADOS, que continua intocada.
- Leva o selo AtendeAI e contadores: atrasados, hoje e próximos.
- Cada linha mostra quando, o cliente, o produto ou problema, e dois botões:
  - **Abrir**: vai direto para `crm-atendimento/<id>`. Para não tirar o técnico da tela Chamado por Técnico (que pede para "informar 'Ocupado' antes de sair desta tela"), abre como o Atender nativo abre. Se não for possível descobrir como ele abre, abre em nova aba (decisão minha).
  - **Remover**: tira o retorno da lista sem passar pelo CRM, para algo resolvido por fora (decisão minha).
- **Vazia**, a faixa explica o recurso: "Nenhum retorno marcado. Quando você salvar um atendimento com Agendar, ele aparece aqui com um botão para abrir direto, e eu te aviso na hora."
- A faixa mostra **só os retornos ligados a um atendimento do CRM**. Os lembretes manuais (seção 4.4) aparecem só na aba Retornos (decisão minha).

**Sincronia com o que mudou fora deste navegador** (decisão minha). Um retorno pode deixar de valer sem o técnico salvar nada aqui: o líder cancelou o atendimento, um colega finalizou, ou o chamado foi transferido. A tabela nativa CHAMADOS desta tela lista os chamados abertos do técnico, inclusive os agendados, que vão para o fim da lista. Ela tem a coluna Protocolo. Por isso:
- Sempre que a tabela estiver carregada por completo, um retorno cujo protocolo **não está** nela é removido automaticamente.
- Proteções: só remove se a tabela foi reconhecida (cabeçalhos esperados, pelo menos uma linha, sem paginação escondendo linhas). Na dúvida, não remove nada.
- O técnico costuma deixar esta tela aberta o dia todo (é onde ele informa Disponível/Ocupado), então a sincronia acontece naturalmente. Se ele não passar por ela, o pior caso é um aviso de um caso já fechado, que ele fecha com × ou Remover.

### 4.4 Agenda & Gestão (botão da dock no SZ.chat)

Enxugada (recomendação aceita pelo Felipe):
- **Ficam duas abas:** **Retornos** (primeira) e **Notas** (sem mudança).
- **Saem:** Calendário, CRM, Kanban e o botão "Reordenar".

A aba **Retornos** mostra a mesma lista da faixa, agrupada em Atrasados, Hoje e Próximos, com Abrir e Remover. Ela também tem:
- **"+ Lembrete"**: um lembrete manual com só dois campos (texto e data/hora), para o caso raro de um retorno sem atendimento no CRM. Ele aparece marcado como "anotado à mão", sem o botão Abrir, e avisa igual aos outros.
- **Migração**, para quem é do Suporte (decisões minhas):
  - Os eventos de `usuarioAgendaEventsV2` com status diferente de `done` e data **de hoje em diante** viram lembretes manuais normais, que avisam.
  - Os eventos em aberto com **data passada** não avisam. Eles ficam num grupo recolhido no fim da aba, "Da agenda antiga (N)", cada um com Remover, para a versão nova não nascer com dezenas de avisos atrasados.
  - As chaves antigas (`usuarioAgendaEventsV2`, `usuarioAgendaCRM`) não são apagadas, só deixam de ser exibidas, para permitir voltar atrás.

**Pré-atendimento: nada muda** (decisão minha, já que o Felipe disse que isto é do Suporte). Para esse setor, a Agenda & Gestão continua com as abas atuais, e o aviso atual de `notifications.js` (inclusive o de eventos vencidos) continua como está.

Para quem é do Suporte e desligou o recurso, a Agenda & Gestão mostra só Notas.

### 4.5 Aviso ao abrir o chat do cliente no SZ.chat

Para o Suporte, este aviso substitui o atual de `notifications.js`, que é baseado nos eventos e no CRM manuais. Para o Pré-atendimento, o atual continua.

- Quando o técnico abre no SZ.chat o chat de um cliente com retorno pendente, aparece: "AtendeAI · Você tem retorno marcado com este cliente (hoje 08:00)", com o botão **Abrir no CRM**, para finalizar com o resumo ou reagendar.
- Mostra apenas quando a correspondência entre o chat e o retorno for confiável: primeiro pelo telefone, depois pelo nome normalizado. Na dúvida, não mostra.
- Tem o × para fechar.

### 4.6 Explicar sozinho, para técnicos novos

- Tudo o que o AtendeAI coloca no CRM leva o **selo "AtendeAI"** e as **cores da extensão** (tokens `--ai-*` de `styles/tokens.css`, o dourado `--ai-primary`). Assim fica visivelmente diferente do azul do CRM e ninguém confunde com um recurso do CRM.
- Os textos falam na voz do AtendeAI: "eu guardo", "eu te aviso".
- **Aviso de novidade, uma vez por navegador.** Aparece na primeira vez que o técnico do Suporte, com o recurso ligado, abre o Chamado por Técnico depois de atualizar. Título: "Seus retornos agora te encontram". Três passos:
  1. Agende no CRM como sempre.
  2. O AtendeAI guarda e te avisa na hora.
  3. Abra direto pela faixa "Meus retornos".

  Tem um botão **Entendi** e não volta mais.
- A faixa e a aba Retornos vazias explicam o recurso, como na seção 4.3.
- O changelog nas opções ganha a entrada da versão.

### 4.7 Opções

Uma seção nova, **Retornos automáticos**, visível só para o Suporte:
- **Chave liga/desliga**, ligada por padrão. Desligado, não aparece nada deste recurso: nem a linha no CRM, nem a faixa, nem os avisos, nem a aba Retornos. Os retornos já guardados ficam guardados.
- **Atalhos editáveis**: adicionar, remover e editar. Cada atalho é um dia relativo (amanhã, depois de amanhã, próxima segunda… próximo dia da semana) mais uma hora. O padrão está na seção 4.1.

## 5. Fora do escopo

- Notificação do sistema operacional, e qualquer aviso fora do navegador.
- Lista de retornos compartilhada entre técnicos (o CRM já é a fonte da equipe).
- Importar agendamentos que já existem no CRM, como os 182 chamados com data desde abril/2026 na tela do Felipe, ou ler a Consulta Chamados automaticamente.
- Mudar o comportamento nativo do CRM, como o Atender travado ou a ordem da lista.
- Qualquer chamada de IA nova. O resumo ao finalizar é o "Colar Resumo IA" que já existe.
- O setor Pré-atendimento.

## 6. Anti-objetivos (fracasso mesmo funcionando)

- O técnico ter que digitar de novo algo que o CRM já tem.
- Um lembrete que ainda obrigue a ir procurar o atendimento.
- A faixa nascer poluída com coisas antigas ou de outros técnicos.
- Cobrir, deslocar ou alterar elementos nativos do SZ.chat (cards, badges, contadores, •••) ou a tabela nativa do CRM.
- Algo do AtendeAI ser confundido com um recurso do CRM.
- Lembrar de um agendamento cuja caixa o técnico desmarcou.

## 7. Restrições e fatos do ambiente

- **Extensão MV3.** Hoje a única permissão é `storage`. **Não adicionar permissão que dispare aviso de permissão no Chrome**, porque isso pode desativar a extensão na atualização até cada técnico aceitar. Se precisar, `alarms` não dispara aviso.
- Novos `matches` de content script: `/crm-chamado-por-tecnico` (com e sem `www`). O `/crm-atendimento*` já tem content scripts (`crm-automation.js`, `documentation-*.js`) e uma ponte no mundo MAIN (`crm-primefaces-bridge.js`), que pode ser reaproveitada para mexer em widgets PrimeFaces.
- **CRM em JSF/PrimeFaces**, observado em 06/11/2026 sem salvar nada:
  - Agendar e Finalizar são o rádio `frmAtendimento:tbvAtendimento:lblOnOf` (`:0` com valor `false` e `:1` com valor `true`; Agendar aparenta ser o `:0`, que vem marcado). **Confirmar.**
  - O calendário da Data do agendamento tem data e hora, com hora padrão 08:00, e permite datas além de 3 dias.
  - Existe na página um form `frmConfirmarAgendamento`, então é provável que haja um diálogo de confirmação ao agendar.
  - Na Chamado por Técnico, a tabela é `frmTabela:dtTPos`, e o Atender é um botão PrimeFaces sem link.
- Os retornos ficam em `chrome.storage.local`, numa chave nova.
- O texto da UI é em português.
- **Testes no CRM** (resposta do Felipe):
  - Não existe cliente ou chamado de teste.
  - **Agendar** pode ser testado à vontade, reagendando um atendimento já existente.
  - **Finalizar não pode ser testado à vontade.** Só dá para observar nas finalizações que o Felipe faria de qualquer jeito no trabalho normal.
  - Consequências:
    1. O plano começa com um passo de descoberta. Nele, se grava o que a página mostra (DOM, e a resposta AJAX se der) num Agendar de um atendimento existente e numa finalização real.
    2. A extensão precisa de um modo de diagnóstico desligado por padrão, que registre esses sinais sem mudar nada no CRM.
    3. Os testes em `tests/` rodam sobre esses registros, e não ao vivo.
    4. Se a detecção de Finalizar não tiver certeza, ela não remove o retorno. A sincronia com a tabela do Chamado por Técnico (seção 4.3) e o botão Remover cobrem esse caso.

## 8. Decisões tomadas

**Do Felipe:**
- O agendamento oficial no CRM continua sendo o caminho. A extensão só o torna fácil e lembra.
- O aviso na hora é só um lembrete, com fechar e adiar e sem abrir atendimento. Abrir o CRM é para finalizar ou reagendar.
- Escolher data e hora livres direto na linha do AtendeAI, além dos atalhos.
- Atalhos padrão Amanhã 08:00, Amanhã 14:00 e Segunda 08:00, personalizáveis.
- Opção de não guardar um agendamento específico (caixa "Me lembrar").
- Chave para desligar o recurso inteiro.
- Só para o setor Suporte.
- O aviso só no navegador (dois monitores), sem notificação do sistema.
- Deixar explícito que é do AtendeAI e autoexplicativo para técnicos novos.
- Enxugar a Agenda & Gestão (ele pediu a recomendação e não objetou).

**Minhas, que ele pode revisar:**
- A linha aparece só com Agendar selecionado.
- "Amanhã" na sexta ou no sábado vira segunda; "Segunda" é a próxima segunda.
- Agendar com a caixa desmarcada remove um retorno já existente.
- Só entram retornos agendados a partir desta versão.
- "Remover" na lista; "Abrir" em nova aba se não der para imitar o Atender.
- O retorno é identificado pelo protocolo; o id da URL é atualizado a cada visita.
- O retorno sai sozinho quando o protocolo some da tabela do Chamado por Técnico (fechado por outra pessoa, cancelado ou transferido).
- A faixa mostra só retornos do CRM; os lembretes manuais ficam só na aba.
- Migrar os eventos manuais em aberto: os de hoje em diante avisam, e os passados ficam recolhidos em "Da agenda antiga", sem aviso. Nenhuma chave antiga é apagada.
- O Pré-atendimento fica exatamente como está hoje. Quem é do Suporte e desliga o recurso vê só Notas.
- Adiar com as opções 15 min, 1 h e amanhã às 08:00.
- Para o Suporte, o aviso ao abrir o chat substitui o atual de `notifications.js`.

## 9. Deixado para quem constrói

- Como detectar que o salvamento no CRM foi bem-sucedido, e se ele foi com Agendar ou Finalizar (AJAX do PrimeFaces, possível diálogo de confirmação).
- Como escrever no calendário PrimeFaces para que o CRM aceite a data e a hora.
- O formato de armazenamento e o nome da chave dos retornos.
- O mecanismo de tempo do aviso (timers nas abas, `alarms` no service worker, etc.), respeitando a seção 4.2.
- A posição exata da faixa e do aviso, respeitando os anti-objetivos.
- A heurística de correspondência entre o chat do SZ e o retorno, respeitando "na dúvida, não mostra".
- Como agrupar vários retornos vencidos ao mesmo tempo num aviso.
- Testes, no padrão de `tests/`.
