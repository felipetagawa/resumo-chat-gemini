# Montagem no DOM observado do SZ — retomada e QA local

09/10/2026. Branch: wip/atendeai-20261008. Referência: dfcb9a04ea038e5fa5b1da8057c3eade87986462.

## Estado recuperado

Antes da retomada havia alterações gravadas em modules/support-focus.js, styles/support-focus.css, tests/support-focus.test.js e tests/css-isolation.test.js. Elas acrescentavam .scroll-list, rejeição de candidatos ambíguos, orçamento de altura e testes estruturais. O último resultado anterior era 37 testes específicos aprovados. dist/ e offline-smart-reply-investigation.mjs já eram não rastreados e foram preservados.

## Revisão e correções adicionais

- centralBudget desconta padding, bordas por clientHeight, margens, gaps e irmãos nativos em fluxo. Reserva pelo menos 200 px para a lista nativa e considera seu min-height explícito. O limite de altura é aplicado apenas à Central.
- O flex da Central não comprime seu estado vazio; a lista interna pode reduzir e rolar dentro dos limites. A compressão anterior cortava uma linha do estado vazio na fixture realista.
- O observer recupera uma Central removida externamente. Antes, a filtragem de alterações próprias também ignorava essa remoção. O teste agora utiliza um registro childList com removedNodes realista.
- Recusa listas absolutas/fixas, inserção dentro de cartões, pais com campos/mensagens, candidatos múltiplos e área insuficiente.
- Preserva .chats-list, .contacts-list e .contact-list, sem transformar classes, eventos, atributos ou ordem dos cartões. A inserção ocorre imediatamente antes da lista, no mesmo pai flex em coluna.

A Central monta sem data-chat-id e inicia recolhida. Não foi criado ID artificial ou fallback por nome, telefone, horário, índice, posição ou ID genérico. Sem identidade elegível e seleção individual, não existe botão de edição nem associação de registros. O contrato anterior de identidade explícita foi preservado; a semântica dos IDs reais continua pendente. Um ancestral active compartilhado não autoriza edição.

## Testes e QA visual

Suíte: node --test tests/*.test.js. Resultado final: 285 aprovados, zero falhas. Específicos (Support Focus, CSS e diagnóstico): 44 aprovados. git diff --check sem erros.

Fixture versionada: tests/fixtures/sz-real-structure.html. Cinco cartões .sz_contact sem data-chat-id, wrappers .contact, ancestor active compartilhado, pai vertical flex relativo de 273 × 485, lista .scroll-list de 282 × 432 com overflow-y:auto antes da inserção. Os dados, IDs de framework e demais regiões são sintéticos. Posição absoluta da coluna e geometria do compositor são escolhas da fixture, não evidências autenticadas.

Playwright Core local 1.61.1 com Chromium 150.0.7871.24 já instalado no cache do Puppeteer. Sem instalação ou download. O terminal padrão falhou ao iniciar; comandos locais foram executados pelo runtime Node disponível. O Browser integrado falhou na conexão com process is not defined; a tarefa permite ferramenta equivalente. A importação comum de Playwright também estava incompleta; foi usado o Playwright Core existente na árvore .pnpm, com executablePath explícito.

URL interceptada localmente: http://127.0.0.1:4178/sz-structure. Uma navegação atendida pela fixture; demais requisições abortadas. Nenhuma chamada Gemini ou externa. Dados exclusivamente sintéticos. Sem sessão autenticada.

| Verificação | Resultado |
| --- | --- |
| 1045 × 632 e 1440 × 900, Dark/Light/System | 6 cenários aprovados |
| Página identificada, conteúdo significativo, sem overlay de erro | Aprovado |
| Console | Zero erros/avisos |
| Central recolhida → clique → estado vazio expandido legível | Aprovado |
| Sem botão de edição ou persistência de prioridades sem IDs | Aprovado |
| Nós/HTML dos cartões e style do pai nativo | Preservados |
| Scroll nativo em 100 px e compositor | Preservados após montagem/expansão |
| SPA substituindo pai e remoção externa da Central | Uma única Central remontada |
| Observer após estabilização | Leituras estáveis; sem loop |
| Conteúdo sintético longo inserido só na lista da extensão | Rolagem interna, limite de altura, fila nativa ≥ 200 px |
| System mudando light/dark | Atualização dinâmica aprovada |
| Dock: minimizar, restaurar, escala, arrastar e resize | Aprovado; resize não apaga preferências |
| Diagnóstico de IDs/seleção e interseções | Executado sobre fixture e testado sem exposição de valores |

O dock foi revisado, sem alterações de produção. Usa coordenadas em pixels de viewport, compensação por zoom, clamp com margem de 8 px e preferências preservadas. Sua regra anterior de janela estreita ainda consulta os seletores legados. Não foi ampliada ou usado reposicionamento sem evidência real. O diagnóstico na fixture detecta uma pequena interseção com compositor e botão nativo ao reproduzir o retângulo 849/237/188/339. O compositor é sintético: esse resultado não comprova conflito no SZ autenticado e não justifica mover o dock real.

## Medidas da coluna na fixture

| Estado | Central (largura × altura) | Altura da lista nativa |
| --- | --- | --- |
| Antes | ausente | 432 px |
| Recolhida | 273 × 42 px | 390 px |
| Expandida vazia | 273 × 90,38 px | 341,63 px |

Pai 273 × 485 e largura nativa da lista 282 px permaneceram iguais. A diferença original de 9 px entre lista e pai já existe antes da extensão e foi preservada. Em 1045 × 632, a lista interna tem limite CSS de 158 px (25vh), e o orçamento total da Central é 232 px. O conteúdo vazio usa 48,38 px internos. As mesmas alturas foram medidas na janela maior porque a fixture mantém a altura observada do pai. Esses números não são medidas autenticadas.

Artefatos em %TEMP%/atendeai-sz-dom-qa/: run.mjs, results.json, diagnostic-fixture.json, unit-results.txt; capturas 1045-dark-collapsed.png, 1045-dark-expanded.png, 1440-dark-collapsed.png e 1440-dark-expanded.png. O runner permanece fora do repositório. As duas capturas de 1045 × 632 foram inspecionadas visualmente.

## Diagnóstico autenticado necessário

O arquivo docs/sz-dom-diagnostic.js não é carregado pelo manifesto. Copie seu conteúdo integral no DevTools da aba SZ autenticada. Ele somente lê o DOM; não consulta mensagens, cookies, tokens, rede ou storage, nem modifica cartões/CSS. Mantém IDs brutos apenas em memória temporária dentro de um fechamento, nunca os retorna, imprime ou exporta. Não compartilhe objetos DOM, dumps de HTML ou capturas com dados de clientes.

1. Abra um atendimento conhecido e use Elements para selecionar seu cartão .sz_contact (ou um filho). Execute atendeaiSZDiagnostic.snapshot('A', $0). A letra é uma marcação humana temporária, não identidade persistente.
2. Abra um atendimento diferente, selecione seu cartão em Elements e execute atendeaiSZDiagnostic.snapshot('B', $0). Compartilhe somente o objeto numérico/booleano retornado. Mudanças individuais de classes/atributos são contabilizadas sem expor seus valores.
3. Volte ao mesmo atendimento A, selecione novamente seu cartão e repita snapshot('A', $0). Repita após uma atualização visual/remontagem da fila. A variável $0 pode estar apontando a um nó antigo: selecione novamente no Elements.
4. Quando possível, marque um terceiro atendimento distinto como C para detectar reutilização. A/B/C devem continuar significando os mesmos atendimentos durante esta sessão de diagnóstico. Não imprima nomes/telefones/IDs para compará-los.
5. Execute atendeaiSZDiagnostic.geometry() com dock e Central nos estados relevantes. O relatório contém apenas retângulos, contagens, área de interseção e teste de bloqueio do ponteiro no centro da interseção. Não altera preferências.
6. Execute atendeaiSZDiagnostic.clear() ao concluir. Recarregar a página também encerra essa memória temporária; comparações entre reloads completos não são suportadas pelo diagnóstico.

Identificador único e visualmente estável não prova semântica de atendimento. Verificar compartilhamento com outros cartões, mudanças entre seleção e atualização, reciclagem em atendimentos diferentes e qual elemento realmente muda para indicar seleção. IDs de framework e ancestrais compartilhados permanecem inelegíveis. Depois de coletar os relatórios, avaliar a necessidade de evidência adicional antes de habilitar qualquer nova fonte de identidade.

Pendências: recarregar a extensão local/aba de teste, confirmar inserção no pai real, fila/scroll/compositor preservados, temas e remontagem real; comprovar identidade e seleção; medir interseções reais do dock em posição/escala salvas. Não houve commit, push, merge, deploy, publicação, alteração de API Gemini, ativação de modelo, autenticação de Líder ou CRM. A implementação local está disponível para revisão; o aceite autenticado permanece pendente.
