# QA manual — Sugerir resposta no tom do técnico

Ambiente: extensão descompactada (esta branch) no Chrome + API local (`./mvnw spring-boot:run`, porta 8080) no SZ real.
Nada foi enviado por push nem publicado; o deploy da API fica com você.

## Verificação automática (15/10/2026)

- API: `./mvnw test` → `Tests run: 113, Failures: 0, Errors: 0, Skipped: 0` · `node --test eval/smart-reply/` → 53 pass, 0 fail.
- Extensão: `node --test tests/` → 275 pass, 0 fail.

## Revisão visual (preview estático do card, tokens reais, claro e escuro, 85/100/115%)

- Contraste (texto, aviso, erro, selo, botões, placeholder) ≥ 4,5:1 nos dois temas; foco visível por `--ai-focus`; alvos ≥ 28 px; sem truncar rótulos a 85% e 115%.
- Achado e correção: com o dock muito curto (altura 140) o botão **Inserir** ficava cortado. O card agora rola por dentro e a barra de ações fica fixada embaixo (`position: sticky`), então as ações continuam alcançáveis sem o card crescer.
- Limite conhecido: a 140 px de altura sobra pouco espaço para o texto (rola); o dock só fica assim com poucos botões ativos. Confirme no QA 2.
- Capturas: `side-session-notes/<sessão>/smart-reply-screenshots/` (antes/depois a 100%, 85%, 115%).

## Checklist (você no SZ real)

1. Digite e envie 3 mensagens à mão em 3 atendimentos diferentes → nas Opções, "Limpar amostras de estilo (3)" (recarregue as Opções).
2. Sugerir resposta: o card abre **dentro do dock** e o dock não cresce; repita com o dock em 85% e 115%.
3. A resposta não tem abertura/fecho de frase pronta e o tom acompanha o registro do cliente.
4. Direcionar "peça o XML e diga que vou verificar" + Enter → nova resposta segue o objetivo.
5. Chega mensagem nova do cliente com o card aberto → Inserir desabilita, aparece "Mensagem nova"; ↻ Outra funciona.
6. Troque de atendimento durante a geração → resposta descartada e ações travadas.
7. Inserir com rascunho no composer → Substituir / Acrescentar / Cancelar.
8. Enviar uma sugestão inserida sem editar **não** aumenta a contagem de amostras.
9. Uma semana depois: `node eval/smart-reply/monthly-cost.mjs --usage <gemini_usage.jsonl> --days 7 --extra-monthly-usd 0` e confirmar projeção < R$ 20/mês.

## Pontos a observar no uso real

- Detecção de envio no SZ (tempo entre limpar o composer e a mensagem aparecer; janela de 10 s).
- Com selfName ainda desconhecido (antes do 1º envio confirmado) as falas do técnico saem como "Técnico:" e não há amostras.
