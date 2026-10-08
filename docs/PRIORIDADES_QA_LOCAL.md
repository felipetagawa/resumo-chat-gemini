# Central de Prioridades — implementação e QA local

Data: 08/10/2026. Branch: `wip/atendeai-20261008`.

Implementação local concluída; compatibilidade e QA na sessão autenticada do SZ ainda não comprovados. Nenhuma publicação, alteração de versão ou chamada de IA foi realizada.

## Composição implementada

A Central inicia recolhida, como um componente independente entre o cabeçalho e o contêiner de rolagem da fila. Não recria pesquisa, contagem, indicadores ou contatos. Expandida, ordena somente registros acompanhados e associados com segurança a cartões presentes na fila, por Agora, Próximo e Baixa. Dentro de cada prioridade, utiliza a data de edição e o identificador como desempate determinístico. Cada linha apresenta nome truncado, prioridade, até duas tags, próximo passo em até duas linhas e alerta local quando confirmado. A linha solicita a abertura pelo clique nativo do cartão; a extensão não intercepta os cliques da fila.

O botão `＋`, com nome acessível “Organizar atendimento”, abre um único editor para a conversa selecionada. Salvar, Cancelar, Limpar e, quando aplicável, Marcar revisado estão no mesmo painel. O próximo passo é opcional e limitado a 300 caracteres. Seleções usam `aria-pressed` e um sinal de confirmação além da cor. Escape fecha o editor e devolve o foco. A prévia aceita hover ou foco em cartões que já sejam focáveis no SZ, sem alterar seus atributos ou filhos.

Prioridade determina ordem de atenção. Tags descrevem situação: Bloqueante, Em teste, Aguardando cliente, Aguardando terceiro e NF-e. Não foi criado catálogo adicional. As tags não mudam prioridade nem geram alertas. O próximo passo é um lembrete privado de ação.

O editor flutuante e a prévia ficam integralmente na área horizontal da coluna esquerda. Sem espaço seguro, a prévia é suprimida; o editor usa a própria Central, com rolagem e limite de `min(260px, 30vh)`. A lista expandida usa `min(200px, 25vh)`. Não houve reprodução literal da imagem conceitual nem geração de novos conceitos: a direção já aprovada e a economia de espaço orientaram o uso dos tokens existentes.

## Inserção segura e compatibilidade pendente

O adaptador reconhece `.chats-list`, `.contacts-list` ou `.contact-list`, contendo `.sz_contact`. Exige um pai flex em coluna, lista com redução flexível e rolagem vertical nativa. Recusa contêineres com campos de entrada, mensagens, dimensões inadequadas ou posição incompatível com a coluna esquerda. Não modifica CSS nativo para forçar encaixe.

Esses seletores candidatos ainda precisam ser confirmados no SZ autenticado. Se o layout real não satisfizer o contrato, a Central não será inserida. Não se deve ampliar o adaptador por adivinhação ou posicionar o componente dentro de cartões como alternativa.

## Identidade, migração e persistência

RecoveryBufferModule foi inspecionado e sua implementação foi preservada. Seu fallback por plataforma + nome + início do atendimento continua disponível para recuperação de conversas. Para as novas prioridades, esse fallback não é aceito: nome e horário com resolução de minuto não garantem isolamento de atendimentos distintos.

Support Focus exige `data-chat-id` explícito, aceito pelo Recovery Buffer, não semelhante a telefone e único entre cartões presentes. Também exige exatamente um cartão ativo/selecionado/aberto. `data-contact-id`, `data-id`, nome e timestamp não autorizam associar prioridades. A estabilidade e o significado de `data-chat-id` ainda precisam ser comprovados no SZ real. Ausência, duplicidade ou identidade incerta desabilitam edição/associação.

O armazenamento permanece em `atendeai_support_focus_v1`, local, com retenção de 24 horas. A fila de transações e o Web Lock com o mesmo nome foram preservados. Os testes comprovam isolamento entre IDs diferentes com nomes iguais, reabertura, concorrência entre abas e rejeição de salvamento de editor antigo após troca de atendimento, inclusive durante leitura assíncrona.

Registros antigos permanecem intactos até uma edição explícita. Para um ID exato elegível: Minha vez é apresentado inicialmente como Agora; demais estados, como Próximo. Verificando é apresentado com Em teste; os estados de espera, com a tag correspondente. A edição preserva campos antigos, inclusive `status`, e adiciona prioridade/tags. Registros com identidade de fallback permanecem armazenados até a retenção original, mas não são migrados nem associados por nome. Não há mudança automática posterior de prioridade.

Nenhum campo de prioridade, tag, próximo passo ou alerta entra em Smart Reply, relatório ou outro payload de IA. O teste utiliza os construtores reais das solicitações de Smart Reply e relatório para verificar esse isolamento.

## Alertas locais: contrato conservador

“Cliente respondeu” só é persistido para um atendimento já acompanhado, observado na conversa aberta, após baseline local. São exigidos simultaneamente:

- ID de atendimento na mensagem correspondente ao ID ativo;
- `data-message-id` próprio e único;
- `data-message-sequence` inteiro positivo, estritamente crescente;
- classificação `.received`, ausência de `.sent` e de remetente automático, conteúdo textual;
- mensagens anteriores preservadas com os mesmos nós, IDs e sequências, seguidas de um anexo novo;
- mensagem ainda não vista na sessão e sequência acima do maior valor já observado;
- identidade atual ainda correspondente na transação de armazenamento.

Sem qualquer dessas evidências, não há alerta. Troca de prévia, timestamp, texto, remontagem, histórico antigo, mensagem sem direção conhecida, saída do técnico, automação e mensagem de outro atendimento não o produzem. O baseline é redefinido na troca de conversa. Não há detecção da fila inteira em segundo plano. Alertas não renovam o TTL nem mudam prioridade. Marcar revisado limpa o alerta; a reconstrução de mensagem já vista não o restaura.

**Limitação relevante:** os atributos de ID e sequência de mensagem não foram confirmados no DOM real. O recurso permanecerá inativo onde eles não existirem. Os testes demonstram o comportamento sob esse contrato, não comprovam a emissão de alertas no SZ atual. Não foi usado `msg_ref` como identidade de atendimento nem foi inventada uma evidência de mensagem nova a partir de alterações visuais.

## QA executado e evidências

Skills instaladas utilizadas: frontend-app-builder para composição, hierarquia, tokens e economia visual; frontend-testing-debugging para interação, console e capturas. A arquitetura JavaScript/CSS foi preservada, sem instalação de dependências.

O Browser integrado retornou `Browser is not available: iab`; a descoberta retornou lista vazia. Utilizou-se Playwright já instalado, com Chromium local. A URL real `URL do SZ fornecida pelo usu?rio` retornou `net::ERR_NETWORK_ACCESS_DENIED` antes da tela de login. Não foi utilizada sessão autenticada nem alterado proxy/certificado.

A fixture é uma aproximação estrutural, claramente simulada, baseada nos seletores já usados pela extensão. Carrega os módulos, tokens, CSS e inicializador de dock reais; contém 70 contatos, duas pessoas chamadas Lucia, 18 registros acompanhados e um próximo passo longo. Os cartões e a superfície SZ são simulados; os fluxos de IA não são acionados.

| Verificação | Resultado |
| --- | --- |
| Identidade da página local e conteúdo renderizado | Passou |
| Console da fixture | Zero erros/avisos nos 24 cenários |
| 960×900 e 1440×900, 80%, 100%, 125%, 150% | Passou em emulação de viewport/escala |
| Light, Dark, System | Passou, incluindo mudança dinâmica do esquema do sistema |
| Central recolhida/expandida, editor, salvar e Escape | Passou |
| Fila longa, nomes e próximo passo longos | Passou, sem scroll horizontal |
| Prévia, limites horizontais e fechamento ao rolar | Passou |
| Alerta local por anexo identificado | Passou na fixture |
| Alternância rápida, reconstrução da fila e preservação do scroll | Passou |
| Dock: arrastar, escala, minimizar/restaurar | Passou |
| 600×720 a 150%, editor interno e dock sob demanda | Passou |
| Preferências salvas após estreitar/ampliar a janela | Preservadas |
| SZ autenticado e zoom real do navegador | Pendente |

Os zooms foram representados por viewport em CSS equivalente e `deviceScaleFactor`; não foram executados via controle de zoom do navegador em uma sessão real. Não há aprovação visual do SZ autenticado.

Artefatos preservados fora do repositório em `%TEMP%/atendeai-priorities-qa/`:

- `before.png`: módulo anterior real no dock, sobre a mesma fixture.
- `collapsed.png`, `expanded.png`, `editor.png`: estados novos.
- `preview.png`, `alert.png`, `narrow-editor.png`: estados complementares.
- `qa.mjs`: runner visual, exporta `run(browser)`; foi executado com Playwright do ambiente, sem instalação.
- `results.json`: geometrias e console por cenário.
- `unit-results.txt`: resultado da suíte completa.
- `before-support-focus.js` e `before-support-focus.css`: cópias locais anteriores usadas na comparação.

As capturas antes/depois foram inspecionadas visualmente: pesquisa/cabeçalho/contagem e cartões continuam nativos; a Central ocupa sua própria faixa; o dock perde o editor grande; nome e próximo passo ficam limitados; editor e prévia ficam na coluna esquerda; o compositor mantém geometria. São evidências simuladas, não capturas do SZ real.

## Altura útil da fila

Na fixture de 1440×900 a 100%, a fila anterior tinha 795 px. Recolhida, passa a 753 px: custo de 42 px. Expandida, passa a 553 px: custo de 242 px, dos quais 200 px correspondem à lista interna. O compositor permanece na mesma posição/tamanho. O dock anterior media aproximadamente 490 px de altura; sem o resumo/editor Focus, aproximadamente 336 px, na escala normal e com as mesmas ações.

| Zoom emulado, altura física 900 | Altura da Central recolhida em CSS px | Altura expandida total em CSS px | Lista nativa expandida em CSS px |
| --- | --- | --- | --- |
| 80% | 42 | 242 | 778 |
| 100% | 42 | 242 | 553 |
| 125% | 42 | 222 | 393 |
| 150% | 42 | 192 | 303 |

As medidas se repetiram nas duas larguras principais. Não extrapolar esses números para o layout real sem medir a sua fila.

## Problemas identificados e correções

- Redução da fila podia invalidar o próprio detector de área segura: a medição passou a considerar também a altura já usada pela Central, evitando remoção/reinserção cíclica.
- Dock completo cobria o botão da Central em janela muito estreita com posição salva: compactação temporária alinhada à direita, ações expandíveis sob demanda, sem persistir esse estado ou mudar a posição preferida. Ampliar a janela restaura a preferência. Expansão voluntária em janela extrema pode ocupar conteúdo; o SZ real ainda precisa de QA nessa condição.
- Cancelar editor interno deixava a lista expandida ausente: fechamento restaura a lista e o foco no botão atual.
- Indicação “Salvo” em uma linha adicional deslocava a fila: confirmação visual usa o próprio botão; anúncio acessível não aumenta a altura.
- Direção de mensagem desconhecida podia ser tratada como entrada: passou a exigir `.received`, com regressão para mensagens sem direção.

Em larguras extremas, a própria fixture SZ fica estreita devido à largura mínima da coluna nativa. A extensão não altera essa estrutura. A compactação reduz interferência, mas não comprova usabilidade de um chat real em qualquer resolução arbitrária.

## Testes e Git

Baseline anterior: 289 testes passaram. Suíte final: `node --test tests/*.test.js`, **273 passaram, zero falhas**, inclusive Recovery Buffer, Smart Reply, payloads, CSS e tema. Testes dos antigos estados e da mudança automática Minha vez foram substituídos pelos testes das novas prioridades e alertas conservadores. O teste existente de resize do dock foi atualizado: ajuste visual não sobrescreve a posição escolhida, e ampliar a janela restaura essa posição. `git diff --check` passou.

Arquivos alterados da tarefa: `content.js`, `modules/support-focus.js`, `modules/theme.js`, `styles/support-focus.css`, `styles/tokens.css`, `tests/css-isolation.test.js`, `tests/mini-dom.js`, `tests/recovery-buffer.test.js`, `tests/support-focus.test.js`. Novos arquivos: `tests/dock.test.js` e este relatório. Arquivos locais anteriores `dist/` e `offline-smart-reply-investigation.mjs` foram preservados. Não houve commit, push, merge, deploy, alteração de versão, autenticação de Líder ou documentação CRM.

A API continua com exatamente a mesma lista de alterações locais observada inicialmente: modificados `eval/smart-reply/benchmark.mjs` e `eval/smart-reply/runner.mjs`; não rastreados `eval/smart-reply/preflight-diagnostics.mjs` e `eval/smart-reply/preflight-diagnostics.test.mjs`. Nenhum arquivo da API foi editado nem resultado de benchmark apagado. A verificação da API foi por leitura de configuração, implementação e testes existentes; não foi executada sua suíte Java nesta tarefa.

## Gemini 3.8 Flash Low e recomendação posterior

A implementação existente mantém `GEMINI_MODEL` como modelo global; `GEMINI_SMART_REPLY_MODEL` é específico do Smart Reply. `GEMINI_SMART_REPLY_PREMIUM_ENABLED` tem default false. `GeminiApiProperties.resolveSmartReplyModel()` impede ativação do 3.8 com premium desligado. `GeminiService` aplica `thinkingConfig.thinkingLevel=LOW` para `gemini-3.8-flash` no fluxo interativo, com limite de saída 512 e transporte/timeout específicos. Os testes existentes de `GeminiSmartReplyModelTest` cobrem separação do fluxo global, fallback desligado e limite de tentativas. Nada foi alterado ou ativado.

Recomendação para uma etapa posterior, explicitamente autorizada: validar no Cloud Run existente, em uma revisão de teste sem tráfego geral, a disponibilidade real do modelo/configuração e o caminho de autenticação. Utilizar amostra pequena de casos sintéticos, limite financeiro aprovado e comparação com o baseline. Medir p50/p95 de latência, timeouts, taxa de sucesso, tentativas, qualidade de resposta e tokens de entrada/saída/pensamento/cache; contabilizar tentativas e respostas descartadas. O limite deve respeitar o prazo de 15 segundos da extensão, sem ampliar timeout para esconder falhas.

Custos: a API já contém uma tabela estimativa em `GeminiUsage`, mas os preços atuais não foram validados nesta tarefa. Antes de chamadas pagas, conferir os preços oficiais e calcular `(entrada não cacheada × tarifa de entrada + cache × tarifa de cache + saída/pensamento × tarifa de saída) / 1.000.000` por tentativa. Utilizar telemetria de tokens reais para comparar custo por resposta útil com o baseline; não autorizar despesas apenas com uma estimativa por chamada.

Rollback posterior: desligar `GEMINI_SMART_REPLY_PREMIUM_ENABLED`, restaurar a configuração anterior específica do Smart Reply e, se necessário, retornar o tráfego à revisão anterior do Cloud Run. Manter `GEMINI_MODEL`, relatório, Docs e classificação CRM intactos. Não alterar a rede corporativa para fazer a validação local passar.

## Pendências para aceitar no SZ real

1. Disponibilizar um navegador com acesso de rede e sessão autenticada no SZ; não enviar credenciais em chat.
2. Confirmar seletor e layout do contêiner de rolagem, ausência de sobreposição e medidas reais antes/depois.
3. Comprovar que `data-chat-id` identifica o atendimento, persiste entre remontagens e não é reciclado entre atendimentos.
4. Inspecionar atributos reais das mensagens. Sem ID, direção recebida e sequência confiável, manter alertas inativos; não habilitar heurística por prévia/timestamp.
5. Repetir 80/100/125/150% com zoom real, janelas estreitas/amplas, temas, muitos clientes, troca rápida, fila virtualizada, outros painéis/modalidades e posição/escala personalizada do dock.
6. Conferir hover, teclado, leitor de tela, contraste na superfície real, clique/seleção/indicadores nativos e acesso ao campo de mensagem.
7. Recarregar a extensão local e as abas de teste para que uma instância antiga do Support Focus não continue executando a regra automática anterior. Isso não exige publicação.

O critério principal permanece a decisão rápida com espaço e navegação preservados. O QA local sustenta a implementação, mas não constitui aceite no SZ autenticado.
