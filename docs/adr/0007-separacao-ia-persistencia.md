# ADR-0007: Separação entre IA e persistência oficial

**Status:** Aceita (2026-08-25)

## Contexto

A seção 5 do pedido é enfática: "a IA nunca deve executar diretamente
INSERT/UPDATE de dados oficiais" — o resultado da IA é sempre uma proposta
de interpretação, e só vira dado oficial depois que o personal trainer
revisa e confirma explicitamente. Essa é uma garantia que precisa existir
na estrutura do sistema, não apenas como convenção de uso.

## Decisão

- **Duas tabelas, dois papéis, nunca confundidos:**
  - `resultado_ia` — saída bruta da interpretação do Gemini
    (`payload_json`), escrita **apenas** pelo serviço de IA
    (`services/ia/`), nunca por um endpoint que aceite input do usuário.
  - `validacao` — o que o personal efetivamente confirmou
    (`payload_confirmado_json`), escrita **apenas** pelo endpoint de
    confirmação (`POST /api/v1/registros/:id/confirmar`), a partir do corpo
    da requisição (o payload que o personal editou/aprovou no desktop), não
    copiado automaticamente de `resultado_ia`.
- **Dado oficial = `validacao`, nunca `resultado_ia`.** Qualquer tela ou
  endpoint que exiba "histórico do aluno" ou "dados confirmados" lê de
  `validacao` (via `registro.status = confirmado`), nunca diretamente de
  `resultado_ia`.
- `registro.status` só avança para `confirmado` dentro da mesma operação
  que cria o registro de `validacao` — as duas coisas acontecem juntas, no
  mesmo service (`registro-confirmacao.service.js`), dentro de uma
  transação.
- Nenhum job em background, worker de IA ou processo agendado tem permissão
  de escrita na tabela `validacao` — só o controller/service de confirmação,
  que exige um `usuario_id` autenticado (quem confirmou fica registrado).
- Um teste automatizado cobre exatamente essa garantia: não existe nenhum
  caminho de código, fora do endpoint de confirmação, que crie uma
  `validacao` (ver seção de testes do plano).

## Alternativas consideradas

- **Um "modo de confirmação automática" para relatos de alta confiança**
  (a própria IA confirmando sozinha quando a confiança é alta) — essa ideia
  aparece inclusive como toggle no protótipo (`Configurações` →
  "Confirmação automática de alta confiança"). Rejeitada **para este MVP**:
  contraria diretamente a seção 5 do pedido. O toggle do protótipo fica
  fora de escopo (não implementado) até uma decisão explícita futura de
  permitir esse modo.
- **Guardar só uma tabela (`resultado_ia`) com um campo `confirmado:
  boolean`**, em vez de duas tabelas. Rejeitada — misturar a proposta da IA
  com a decisão humana no mesmo registro tornaria trivial (por erro de
  código, não por má intenção) sobrescrever ou "confirmar" um resultado sem
  que ele realmente tenha passado por revisão explícita. Duas tabelas
  tornam esse erro estruturalmente mais difícil de cometer.

## Consequências

- Toda edição feita pelo personal na tela de revisão (seção 6 do pedido:
  editar, corrigir, remover) só tem efeito no momento da confirmação — não
  altera `resultado_ia`, que permanece como registro histórico do que a IA
  originalmente propôs (útil para auditoria e para eventualmente avaliar
  qualidade do modelo).
- Qualquer funcionalidade futura de "aprender com correções do personal"
  (mencionada como ideia na UI de revisão do protótipo) tem, desde já, os
  dois lados guardados separadamente (proposta da IA vs. correção humana)
  para comparar.
