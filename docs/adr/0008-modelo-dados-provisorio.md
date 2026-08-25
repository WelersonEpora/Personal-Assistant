# ADR-0008: Modelo de dados provisório do MVP

**Status:** Aceita (2026-08-25)

## Contexto

O pedido é explícito (seção 7): o aplicativo legado que o personal trainer
usa hoje ainda não foi analisado, e este MVP não deve tentar antecipar um
sistema completo de gestão de Personal Trainer. Nenhuma entidade ou
funcionalidade não mencionada no pedido deve ser inventada agora — a
prioridade é sustentar o fluxo captura → sincronização → IA → revisão →
confirmação, com o cadastro de aluno o mais simples possível.

## Decisão

Modelo de dados restrito a **exatamente** as entidades necessárias para o
fluxo, listadas na seção 7 do pedido:

| Entidade | Tabela | Observação |
|---|---|---|
| Usuário (personal) | `usuario` | autenticação simples, escopo de acesso |
| Aluno | `aluno` | cadastro mínimo: nome + observação livre opcional |
| Registro | `registro` | ver ADR-0002 |
| Entrada do Registro | `registro_entrada` | tipo áudio/texto, ordem |
| Arquivo de áudio | `arquivo_audio` | referência ao entrada de áudio |
| Transcrição | `transcricao` | resultado do passo 1 do pipeline de IA |
| Resultado da IA | `resultado_ia` | proposta bruta, nunca dado oficial |
| Validação | `validacao` | confirmação humana = dado oficial |

"Status de processamento" (também citado na seção 7) é implementado como o
campo `registro.status`, não como tabela própria — não há necessidade de
uma entidade separada só para guardar um enum.

**Nada além disso.** Em particular, não são criadas neste MVP: entidades de
treino/plano de treino, avaliação física estruturada, exercícios como
catálogo, séries/histórico de carga como tabelas dedicadas, ou qualquer
outra modelagem de domínio de Personal Trainer — esses dados, quando
existirem, vivem dentro de `resultado_ia.payload_json` /
`validacao.payload_confirmado_json` como JSON semiestruturado (itens
genéricos `label`/`valor`/`obs`/`confidence`, no mesmo formato já validado
no protótipo), não como schema relacional rígido.

## Alternativas consideradas

- **Modelar já um schema de treino** (exercícios, séries, cargas como
  colunas/tabelas próprias). Rejeitada — seria antecipar decisões que
  dependem de conhecer o sistema legado (seção 7 do pedido proíbe
  explicitamente isso); um `payload_json` genérico já sustenta a tela de
  revisão do protótipo sem exigir esse comprometimento prematuro.
- **Schema flexível também para `aluno`** (campos abertos tipo
  `metadata jsonb` desde já). Rejeitada por ora — o cadastro de aluno pedido
  é "extremamente simples" (nome, e talvez uma observação); adicionar
  `metadata` sem um caso de uso concreto hoje seria complexidade
  antecipada sem necessidade comprovada, mesma linha de raciocínio do
  AgroMind ("não generalizar antes de um caso real").

## Consequências

- Qualquer evolução do modelo de dados depois da análise do sistema legado
  é esperada e normal — este schema é deliberadamente provisório, não uma
  base "definitiva" a ser preservada a todo custo.
- A UI de revisão/histórico trabalha com itens genéricos
  (`label`/`valor`/`obs`), o que já é suficiente tanto para exercícios de
  treino quanto para medidas de avaliação física ou observações livres —
  sem precisar de telas/schemas diferentes por tipo de conteúdo.
- Migrations futuras que "recortem" campos específicos do `payload_json`
  para colunas próprias (quando um padrão de uso real justificar) são o
  caminho esperado de evolução, não uma reescrita do zero.
