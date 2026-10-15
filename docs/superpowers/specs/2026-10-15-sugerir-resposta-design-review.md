# Revisão do spec — Sugerir resposta no tom do técnico

Data: 2026-10-15. Autor da revisão: Codex.

Spec: [2026-10-15-sugerir-resposta-design.md](2026-10-15-sugerir-resposta-design.md), commit `292d8ca755d1908a2fa31bd35f4f278ea0b33f9c`.

Base conferida: extensão `6ada16b` + commit do spec; API `e6d53ad`.

## Resultado

**Há bloqueios para aprovar o design. O push condicionado à ausência de bloqueios não foi realizado.**

A revisão foi estática, somente leitura. Não houve alteração de código ou do spec, testes, QA visual no SZ, chamadas ao Gemini ou deploy. Este arquivo registra a revisão para outro agente; não implementa suas recomendações.

## Necessidades do usuário

As classificações avaliam o design proposto, não uma implementação concluída.

| Necessidade | Resultado | Evidência no spec e ressalva |
|---|---|---|
| 1. Respostas naturais, no tom do técnico, adaptadas à conversa | Parcial | §1: “O problema não é a formalidade, e sim as frases feitas”. §4.2: “formal com quem escreve formal, solto com quem escreve solto” e “Copie o jeito, nunca o conteúdo”. A intenção está correta; a garantia de nenhuma fórmula proibida contradiz o fallback que pode devolver uma resposta composta apenas por clichê. |
| 2. Aprendizado automático a partir das próprias mensagens, com armazenamento local e reconhecimento pelo nome | Parcial | §5.1 usa `chrome.storage.local`, sem banco, e aprende `selfName` em “3 ou mais atendimentos distintos”. A heurística não distingue o usuário de outro técnico recorrente no histórico. As amostras são enviadas nas requisições de sugestão, conforme o próprio spec; persistência local não significa ausência de transmissão. |
| 3. Um clique gera, um clique insere; Direcionar + Enter; sem perfis e seletor de contexto | Parcial | §2 define os cliques; §6 define Direcionar + Enter; §5.3 remove perfis e seletor. Falta remover explicitamente os perfis também de `options.html` e das dependências de `options.js`. |
| 4. Sugestão dentro do dock, sem sobrepor elementos nativos, com polish final | Parcial | §6 exige renderização “dentro do dock” e “rodada de crítica e polimento”. O dock continua flutuante; estar dentro dele não garante ausência de sobreposição. |
| 5. Custo de IA dentro de aproximadamente R$20/mês | Parcial | §2 afirma o teto e “cerca de 300 tokens de entrada por chamada”. Não apresenta projeção que considere volume, modelo efetivo, regenerações, retries e Cloud Run. |
| 6. Reaproveitamento apenas dos trechos autorizados do branch remoto divergente | Atendida | §§4.1 e 5.4 delimitam `replyInstruction`, `identityChanged` e descarte da resposta; exigem cópia seletiva sem cherry-pick e excluem support-focus/Central de Prioridades. Os trechos autorizados existem nos commits indicados. |
| 7. Preservar todas as regras factuais atuais | Parcial | §4.2 mantém proibição de inventar menus/telas/caminhos, de prometer prazo e reserva decisões fiscais/contábeis ao contador. A substituição integral do prompt omite outras salvaguardas explícitas atuais. |

## Problemas encontrados

### 1. Bloqueio: identificação insuficiente do técnico

Um colega presente em três atendimentos transferidos também satisfaz a regra de `selfName`. Não há desempate, tratamento de múltiplos candidatos ou recuperação de identidade aprendida incorretamente.

Antes do aprendizado, §5.2 rotula todos os enviados como `Você:`, permitindo usar o estilo de outros técnicos. A afirmação de que isso “só afeta o estilo, não os fatos” não está demonstrada: também atribui falas ao autor errado.

O design precisa definir uma evidência confiável de autoria própria, comportamento em caso de ambiguidade e recuperação de erro, preservando a ausência de configuração obrigatória.

### 2. Bloqueio: ausência de sobreposição não garantida

`content.js` cria `#containerBotoesGemini` com `position: fixed`. `clampPosition` limita sua posição à janela, sem verificar interseção com composer, botões ou outros elementos do SZ. `ResizeObserver` não acrescenta essa verificação.

O spec precisa definir como cumprir “nunca sobrepor”, inclusive quando o card cresce e em telas pequenas/zoom. Montar o card dentro do dock resolve a localização no DOM, mas não comprova esse requisito geométrico.

### 3. Bloqueio: perda de salvaguardas factuais explícitas

O prompt atual em `SmartReplyService.java` determina:

- Não presumir acontecimentos ausentes em contexto parcial ou trechos omitidos.
- Distinguir fatos conhecidos, hipóteses e informações ausentes; expressar incerteza.
- Não atribuir ações ao técnico sem evidência.
- Pedir confirmação quando conversa e adendo têm contradição relevante.
- Em regenerações, manter os mesmos fatos e limites, sem inventar novidades.

O prompt novo preserva restrições gerais, mas não mantém todas essas regras de forma explícita. Também transforma a regra atual de não repetir tentativas **sem justificativa baseada em nova evidência** numa proibição absoluta de repetição.

É necessário conferir a equivalência das regras antes de substituir integralmente a política e preservar cobertura de regressão factual.

### 4. Bloqueio de validação: teto financeiro sem demonstração

O payload permite até 3.200 caracteres de amostras, além de direcionamento e JSON. “Cerca de 300 tokens” não é um limite comprovado.

O rate limit atual é por minuto e por instância, não um orçamento mensal. Existe um calculador offline em `eval/smart-reply/monthly-cost.mjs`, mas o spec não apresenta projeção para o fluxo novo. Isso não prova que ultrapassará R$20; significa que o requisito permanece sem comprovação.

Faltam premissas e projeção que incluam o modelo efetivo, uso esperado, regenerações, tentativas e demais custos relevantes. Preços e câmbio atuais não foram consultados nesta revisão.

### 5. Remoção incompleta dos perfis

`options.html` ainda contém Direta/Empática/Didática, textos de configuração de perfil e uma entrada de script para `modules/smart-reply-profiles.js`. `options.js`, em torno da linha 1803 na base revisada, chama `SmartReplyProfilesModule`.

Excluir o módulo conforme §5.3 sem atualizar essas referências deixa dependências quebradas. A remoção deve incluir HTML, JavaScript, textos e migração pertinentes, além de acrescentar a limpeza das amostras.

### 6. Garantia anticlichê contraditória

§2 promete nenhuma fórmula proibida na resposta final; §§4.3/7 devolvem a original quando a remoção a esvaziaria. Além disso, `ReplyPolish` cobre apenas parte da lista proibida e remove no máximo uma frase em cada extremidade.

Falta definir o comportamento de uma resposta inteiramente inadequada e alinhar o critério de sucesso à validação prevista.

### 7. Ambiguidades e lacunas adicionais

- Direcionar deve ser seguido, mas depois é chamado de “DADOS, nunca instruções”. Distinguir objetivo permitido de tentativa de alterar as regras.
- Após mensagem nova, o aviso manda gerar novamente, mas não define se Enter/Outra recapturam o contexto ou se é necessário novo clique em Sugerir resposta.
- O polish está previsto, porém `impeccable` não estava entre as skills disponíveis nesta sessão. Definir alternativa ou explicitar a dependência.
- `scripts/smart-reply-bench` não existe na API atual. Se for uma entrega futura, indicá-lo como novo e delimitar sua criação/reaproveitamento dos avaliadores existentes.

## Conferência do código

Caminhos relativos aos respectivos repositórios na base revisada:

| Referência | Resultado |
|---|---|
| API: `src/main/java/com/soften/support/gemini_resumo/service/SmartReplyService.java` | Existe; contém política atual, perfis, adendo factual e chamada ao Gemini. |
| API: `GeminiService.generateInteractive` | Existe; usa `resolveSmartReplyModel`, 512 tokens de saída e remove temperatura para `gemini-3.8-flash`. Hoje não recebe `regenerate`; a temperatura base é 0,3. |
| Extensão: `modules/smart-reply.js`, `smart-reply-context.js`, `smart-reply-profiles.js`, `smart-reply-profiles-ui.js` | Existem. `smart-reply-samples.js` ainda não existe, corretamente descrito como novo. |
| Extensão: handler `gerarResposta` em `background.js` | Existe; hoje exige perfil e não envia os novos campos. |
| Extensão: `ChatCaptureModule.capturarContextoResposta` | Existe em `modules/chat-capture.js`; possui proteções de pertencimento e os três modos citados. Hoje retorna texto com nomes, sem os novos papéis. A captura interna também precisará expor a direção `sent` para a coleta. |
| Extensão: dock, `ResizeObserver`, `clampPosition` | Existem em `content.js`; não garantem evitar elementos nativos. |
| Extensão: painel atual | É anexado a `document.body` e usa `position: fixed` em `styles/smart-reply.css`, como o spec afirma. |
| Extensão: `options.html` | Existe e ainda configura perfis, com dependências em `options.js`. |
| Commits de reaproveitamento | `46ff6c4` da API contém `replyInstruction`; `110e94e` da extensão contém validação/transporte de `replyInstruction`, `identityChanged` e descarte após retorno. Não importar os demais trechos desses trabalhos. |

As explicações do spec para a origem do tom genérico são hipóteses de design plausíveis; esta inspeção estática não comprova causalidade ou qualidade das respostas de um modelo real.

## Estado da API e verificações Git

Repositórios locais:

- Extensão: `/Users/felipeokamoto/Documents/Repositorios/resumo-chat-gemini/resumo-chat-gemini`
- API: `/Users/felipeokamoto/Documents/Repositorios/resumo-chat-api`

Após `fetch origin` nos dois repositórios, executado via RTK:

### Extensão

- Branch local: `wip/atendeai-20261008`, com upstream divergente `origin/wip/atendeai-20261008`.
- `git merge-base --is-ancestor origin/feat/contexto-fila HEAD`: código de saída 0.
- `git log --oneline origin/feat/contexto-fila..HEAD`: apenas `292d8ca docs: spec for Smart Reply in the technician's own voice`.
- Árvore de trabalho estava limpa ao concluir a revisão original, antes da criação deste registro.
- **Push não realizado por causa dos bloqueios.** Não foi usado push sem argumentos, force, merge ou reset.

### API

- HEAD: `e6d53ad`.
- `git log origin/feat/contexto-fila..HEAD`: vazio.
- `git rev-list --left-right --count origin/feat/contexto-fila...HEAD`: `0 0`.
- Sem alterações locais, inclusive arquivos não rastreados, no momento da revisão.
- As mudanças de contexto da fila são `b744460` (endpoint da linha de problema) e `e6d53ad` (modelo separado Flash-Lite com thinking desabilitado para essa linha). Já estão em `origin/feat/contexto-fila`.
- O redesign de Sugerir resposta ainda não está implementado nesse HEAD: não há `styleSamples`, `ReplyPolish` ou `replyInstruction`; o DTO ainda exige perfil.
- Nada foi enviado na API. Nenhum deploy foi realizado.

## Orientação para continuidade

Este registro não autoriza implementação, alteração do spec, chamadas pagas, commit, push ou deploy. O pedido que originou a revisão era somente leitura, com push condicionado à ausência de bloqueios; o pedido seguinte autorizou salvar esta revisão localmente.

Para outro agente: leia o spec junto com este arquivo, revalide o estado atual dos repositórios e siga a autorização vigente do usuário. Não recupere a Central de Prioridades/support-focus. Não confunda o nome do branch local com seu conteúdo nem use seu upstream divergente como destino de publicação.
