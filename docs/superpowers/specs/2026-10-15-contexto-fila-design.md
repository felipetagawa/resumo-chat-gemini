# Contexto na Fila — Design

Data: 15/10/2026. Branch base: `wip/atendeai-20261008`.
Status: **aguardando revisão do Felipe**.

## 1. Problema

No pico, o técnico atende 2–3 clientes simultâneos, cada um com uma conexão AnyDesk aberta. Ao voltar de uma conexão para a fila do SZ.chat, faltam duas informações:

1. **Qual era o problema** de cada cliente, sem abrir o chat e rolar.
2. **Qual AnyDesk é de qual chat**: as janelas do AnyDesk se identificam pelo código numérico, que só aparece no meio da conversa.

A Central de Prioridades atual (Agora / Próximo / Baixa, tags, próximo passo) exige classificação manual, que não acontece justamente no pico. Ela não resolve nenhum dos dois pontos e será descartada.

Fora do escopo deste spec, cada um com spec próprio depois: Sugerir resposta, Sugestão de documentação, Transcrição de áudio. Gerar relatório permanece como está.

## 2. Critérios de sucesso

- Sem nenhum clique, cada chat já aberto ao menos uma vez mostra na fila o código AnyDesk e uma frase com o problema.
- Nenhum elemento nativo do SZ.chat é coberto, deslocado internamente ou alterado. Diante de qualquer dúvida de layout, a extensão não desenha nada.
- Custo adicional de IA abaixo de R$ 2/mês.

## 3. Experiência

Abaixo de cada card nativo da fila, como elemento **irmão** do card (nunca filho), aparece uma faixa:

```
┌──────────────────────────────────────┐
│ G  GISELE                     16:49  │  ← card nativo, intocado
│    pois não                     (1)  │
└──────────────────────────────────────┘
  🖥 123 456 789 · Certificado novo, não emite DANFE   ← faixa da extensão
```

- **Dimensões:** altura fixa de 16px, sem margens verticais, fonte de 11px (a mesma do "Squad D"), uma linha só, truncada com "…" e com o texto completo no `title`. O recuo fica alinhado ao nome do contato.
- **Código AnyDesk:** em fonte monoespaçada, agrupado de 3 em 3. Um clique copia os dígitos sem espaços e mostra "copiado ✓" por 1,5s. Sem código, esse trecho não aparece.
- **Linha do problema:** até 70 caracteres.
  - Origem heurística: cor secundária (mais clara).
  - Origem IA ou manual: cor normal.
  - Um duplo clique abre a edição ali mesmo (Enter salva, Esc cancela, limite de 70 caracteres). A edição manual nunca é sobrescrita pela IA.
- Sem código e sem linha, a faixa não é inserida.
- Cores vêm de `styles/tokens.css` e respeitam os temas claro e escuro. Não há cor de prioridade.
- Cliques fora dos dois controles da faixa não são interceptados, e os cliques do card nativo continuam 100% nativos.

## 4. Segurança de layout (requisito duro)

1. A faixa é inserida no **fluxo normal** da lista, depois do card. Nada de `position: absolute`/`fixed`, `transform` ou margem negativa.
2. CSS escopado ao prefixo exclusivo da extensão. Nenhuma regra mira seletores nativos (vale o padrão do `tests/css-isolation.test.js`).
3. **Lista virtualizada ou posicionada por coordenada:** se os cards tiverem `position: absolute` ou `transform` de posicionamento, ou se o contêiner da lista não for de fluxo normal, a funcionalidade inteira fica desligada naquela página.
4. **Checagem pós-render:** depois de inserir, compara o `getBoundingClientRect` da faixa com o do card anterior e do seguinte. Qualquer interseção remove a faixa e desliga a funcionalidade até o recarregamento, registrando um aviso no console.
5. **Re-render do SZ:** um `MutationObserver` (com debounce, sem laço) reconcilia as faixas pela **chave do chat** (`chatKey` existente), nunca pelo índice. O `ARQUITETURA.md` já registra que essa chave depende de metadados da página. Se não for possível derivar uma chave confiável para um card, ele fica sem faixa. Faixa órfã é removida. Faixa no lugar errado é movida.
6. Usa o adaptador de lista que já existe (`.chats-list` / `.contacts-list` / `.contact-list` contendo `.sz_contact`) e as validações já implementadas no módulo atual (pai flex em coluna, rolagem vertical nativa, ausência de inputs).

## 5. Captura de dados

A captura roda quando o chat está aberto, porque o SZ só tem o histórico no DOM nesse momento. A leitura usa `modules/chat-capture.js`, e cada mensagem é classificada como **cliente**, **atendente/bot** ou **sistema**.

### 5.1 Divisor de transferência

- Mensagens de sistema que indicam transferência: texto contendo `transferi` (cobre "transferiu", "transferido", "transferência"), junto do nome de um setor ou atendente.
- Se houver várias, vale **a última**.
- Sem transferência, o divisor é a primeira mensagem do técnico.
- **Calibração obrigatória:** antes de fechar a regra, coletar 2–3 exemplos reais do DOM e transformá-los em fixtures de teste.

### 5.2 Código AnyDesk

- Candidato: sequência de **9 ou 10 dígitos**, aceitando espaços, pontos ou hífens entre os grupos, em mensagem do **cliente**.
- **Regra principal:** o candidato está em uma das 3 mensagens do cliente seguintes a uma mensagem de atendente/bot que contenha `anydesk`, `any desk`, `desk` ou `acesso remoto` (sem diferenciar maiúsculas e minúsculas).
- **Reserva:** mensagem do cliente composta só pelo número.
- **Exclusão:** ignora candidatos em mensagens que contenham, como palavra inteira, `cnpj`, `cpf`, `tel`, `telefone`, `fone`, `celular`, `whats`, `whatsapp` ou `protocolo` (palavra inteira para não excluir "tela").
- Se houver vários válidos, vale o mais recente.

### 5.3 Linha do problema

1. **Entrada:** mensagens do cliente anteriores ao divisor, de todos os setores, concatenadas e cortadas a partir das **mais recentes** até 1.500 caracteres.
2. **Heurística (imediata):** a primeira mensagem do cliente na entrada que não seja só saudação ("bom dia", "boa tarde", "oi", "olá"...), só número ou só pontuação, truncada em 70 caracteres.
3. **IA (uma vez por chat):** chamada ao backend com a entrada. Resposta esperada: uma frase de até 70 caracteres, sem saudação, sem nome do cliente e sem ponto final.
   - Timeout de 10s.
   - Em caso de falha, fica a heurística, sem retry automático e sem mensagem de erro visível.
   - Sem entrada (o cliente não escreveu antes do divisor): não chama a IA.

## 6. Persistência

`chrome.storage.local`, uma entrada por `chatKey`:

```js
{
  anydesk: "123456789" | null,
  problem: { text: string, source: "heuristic" | "ai" | "manual" },
  aiRequested: boolean,
  updatedAt: number
}
```

- Prioridade de `source`: `manual` > `ai` > `heuristic`. Uma fonte de prioridade menor nunca sobrescreve uma de prioridade maior.
- `aiRequested` garante uma chamada por chat, mesmo se a anterior tiver falhado.
- Limpeza: entradas com `updatedAt` acima de 3 dias são removidas na inicialização.
- Nenhum dado vai para o servidor além do texto enviado na chamada da IA.

## 7. Backend (`resumo-chat-api`, repositório separado)

- Endpoint novo: `POST /api/gemini/linha-problema`, com corpo `{ mensagens: string }` e resposta `{ linha: string }`.
- Modelo: o Flash-Lite mais barato disponível (hoje, Gemini 3.5 Flash-Lite: US$ 0,30/1M de entrada e US$ 2,50/1M de saída). **Thinking desligado ou no mínimo**, porque os tokens de raciocínio são cobrados como saída.
- O backend corta a saída em 70 caracteres.
- Estimativa: 50 chats/dia × 22 dias ≈ 1.100 chamadas por mês, com ~600 tokens de entrada e ~30 de saída cada. Isso dá cerca de US$ 0,30/mês (≈ R$ 1,70).
- A extensão chama o backend pelo `background.js`, no mesmo padrão `apiFetchJson` dos endpoints existentes. Enquanto o endpoint não existir, a faixa funciona só com a heurística.

## 8. Remoção da Central de Prioridades

- Remover `modules/support-focus.js`, `styles/support-focus.css`, `tests/support-focus.test.js` e as referências em `manifest.json` e `content.js:911`.
- Remover os tokens e trechos de `theme.js`, `tokens.css`, `dock.test.js`, `mini-dom.js` e `recovery-buffer.test.js` adicionados só para a Central (commit `dfcb9a0`), conferindo se nada mais os usa.
- Remover ou marcar como obsoleto `docs/PRIORIDADES_QA_LOCAL.md`.
- Dados antigos da Central no `chrome.storage.local` são apagados uma única vez na inicialização.
- O novo módulo se chama `modules/queue-context.js` (com `styles/queue-context.css` e `tests/queue-context.test.js`).

## 9. Testes

Padrão do repositório: `tests/*.test.js` com `tests/mini-dom.js`.

- **AnyDesk:**
  - aceita: pedido seguido do número; número sozinho; número com espaços ou pontos;
  - rejeita: telefone de 10 dígitos com "tel" ou "whats"; CNPJ; CPF; protocolo; número antes do pedido sem ser mensagem isolada;
  - com vários códigos, escolhe o mais recente.
- **Divisor:** sem transferência, com uma e com várias. Inclui as fixtures reais coletadas.
- **Heurística:** pula saudações, números e "?", e trunca em 70 caracteres.
- **Persistência:** precedência de `source`, `aiRequested`, limpeza de 3 dias.
- **Layout:**
  - a faixa é irmã do card, nunca filha;
  - a funcionalidade desliga com lista absoluta ou com transform;
  - a faixa é removida diante de interseção;
  - a reconciliação usa a chave do chat, inclusive quando os cards são reordenados.
- **CSS:** isolamento sem seletores nativos.

## 10. QA manual (Felipe, no SZ real)

1. Coletar 2–3 exemplos de mensagens de transferência e de pedido de AnyDesk.
2. Conferir, nos temas claro e escuro, que nenhum badge, contador, "•••" ou ícone foi coberto ou deslocado.
3. Atender 2–3 chats simultâneos e conferir se cada faixa fica embaixo do chat certo depois de novas mensagens reordenarem a fila.
4. Avaliar a legibilidade em 11px. Se necessário, ajustar para 10px.

Nada é publicado, versionado na loja ou enviado para deploy sem autorização explícita.
