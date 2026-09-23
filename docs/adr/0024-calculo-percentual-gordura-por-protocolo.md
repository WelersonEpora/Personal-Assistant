# ADR-0024: Cálculo da % de gordura por protocolo de dobras (Pollock 7)

**Status:** Aceita (2026-09-23)

> Revoga, só para o Pollock 7 dobras, o item "cálculo de protocolos
> (Pollock/VO₂) para avaliações novas" da lista de fora de escopo do MVP. Não
> altera a ADR-0007 (avaliação física continua fora de `validacao`) nem a
> ADR-0018 (a IA continua sem calcular nada — só extrai as medidas ditadas).

## Contexto

Na avaliação física (ADR-0016), massa gorda e massa magra são derivadas pelo
service a partir do peso e da **% de gordura acompanhada**. Até aqui a % era
sempre **digitada** — o sistema não calculava protocolo nenhum para avaliações
novas (decisão da ADR-0016; o histórico do BodyMove já vinha com a % pronta).

Na prática, o personal mede as **dobras cutâneas** com o plicômetro e espera
que o sistema faça a conta, como o BodyMove fazia. Caso real (2026-09-23): uma
avaliação nova com peso + 7 dobras terminou **sem % de gordura, sem massa gorda
e sem massa magra**, sem nenhum aviso — o personal não tinha como saber por quê.

Conferência com o legado: as 319 avaliações Pollock 7 do BodyMove guardam as 7
dobras, a idade, o sexo e a % calculada. Rodando as equações publicadas contra
elas, **100% batem com diferença < 0,01 ponto** usando:

- densidade: Jackson & Pollock (1978, homens) / Jackson, Pollock & Ward (1980,
  mulheres), 7 dobras (peitoral, axilar média, tricipital, subescapular,
  abdominal, supra-ilíaca, coxa);
- conversão densidade → %: constantes de **Lohman** por idade/sexo — homens
  17–19 `4,98/D − 4,53`, 20+ `4,95/D − 4,50` (Siri clássico); mulheres 17–19
  `5,05/D − 4,62`, 20+ `5,03/D − 4,59`.

O Siri puro (4,95/4,50 para todos) só batia com os homens; nas mulheres dava
~1,1–1,4 ponto a mais. Usar a mesma conta do BodyMove mantém as avaliações novas
comparáveis com o histórico de cada aluno (gráficos, tabela comparativa).

## Decisão

1. **O service calcula a % de gordura do Pollock 7** a partir das dobras da
   própria avaliação + `aluno.sexo` + idade na data da avaliação
   (`aluno.data_nascimento`). Função pura em
   `backend/src/services/avaliacao-fisica/protocolos-gordura.js`, testada contra
   casos reais do BodyMove.
2. **Pedido explícito, não inferência.** O cliente envia
   `{ metrica_codigo: 'percentual_gordura', metodo: 'pollock_7', calcular: true }`
   (sem `valor`). O resultado é gravado como `percentual_gordura` com
   `metodo = pollock_7` e `origem_valor = calculado`, e daí saem massa gorda e
   massa magra pela corrente de derivadas que já existia.
3. **Densidade corporal guardada** como métrica calculada nova
   (`densidade_corporal`, g/mL, 4 casas). Para isso `avaliacao_fisica_medida.valor`
   passa de `NUMERIC(8,3)` para `NUMERIC(10,4)` e a unidade `g/mL` entra no
   vocabulário do catálogo. Não aceita valor digitado (como IMC/RCQ).
4. **Faltou dado → salva sem a %.** Sem sexo, sem data de nascimento, com
   alguma das 7 dobras em branco ou abaixo de 17 anos, a avaliação é gravada
   normalmente, só sem a %/densidade/massas. **O formulário avisa antes, ao
   vivo, exatamente o que falta** (ex.: "no cadastro do aluno: sexo") — o
   silêncio foi o problema original.
5. **Pollock 7 como padrão, nunca obrigatório.** Avaliação sem nenhuma % de
   gordura abre com uma linha "Pollock 7 dobras (calculado)" já marcada — é o
   protocolo de todo o histórico do BodyMove. O personal pode trocar o método ou
   removê-lo; bioimpedância, DEXA, "informado" etc. continuam digitados e podem
   conviver com o Pollock calculado na mesma avaliação (o "acompanhado" escolhe
   qual alimenta massa gorda/magra).
6. **Valor calculado não é editável à mão.** Para mudar a % do Pollock, corrige-se
   a dobra (a conta refaz ao salvar) ou usa-se outro método ("informado").
   Assim uma % marcada "Pollock 7" sempre bate com as dobras ao lado. Valores
   Pollock **importados do BodyMove** (`origem_valor = importado`) ou ditados na
   captura continuam como valor digitado — nada do histórico é recalculado.
7. **A IA segue sem calcular.** O prompt da ADR-0018 continua proibindo a IA de
   calcular % de gordura/densidade; ela só extrai as dobras. O cálculo acontece
   no service, quando o personal confirma a revisão (o formulário de revisão é o
   mesmo, com a mesma linha Pollock padrão).

## Alternativas consideradas

- **Siri puro para todos.** Fórmula mais citada, mas diverge do BodyMove nas
  mulheres (~1,3 ponto) — quebraria a série histórica de cada aluna no gráfico.
- **Inferir o cálculo sempre que houver 7 dobras**, sem pedido explícito. Some
  com a escolha do personal (ele pode ter feito bioimpedância e medido dobras
  só por acompanhamento) e esconderia a regra.
- **Bloquear o salvamento sem sexo/nascimento.** Trava o personal no meio de uma
  avaliação por causa de um dado de cadastro; preferimos salvar e avisar.
- **Não guardar a densidade** (só mostrar). Mais simples, mas perde um dado
  que o laudo do BodyMove mostrava e que ajuda a conferir a conta.
- **Implementar todos os protocolos de uma vez** (Durnin, Petroski, Pollock 3,
  Slaughter…). Adiado: cada protocolo precisa de conferência própria; o
  Pollock 7 cobre 100% do uso real conhecido. A estrutura
  (`PROTOCOLOS` em `protocolos-gordura.js` + `PROTOCOLOS_CALCULADOS` no
  frontend) é o ponto de extensão.

## Consequências

- Avaliação com peso + 7 dobras + cadastro completo ganha, ao salvar, % de
  gordura, densidade, massa gorda e massa magra — criando pelo "Nova avaliação"
  ou confirmando uma captura por voz (mesmo caminho do service).
- Avaliações antigas sem % passam a calcular **quando editadas e salvas** (a
  linha Pollock padrão aparece no "Editar"). Não há backfill automático.
- Duas cópias da fórmula (backend grava, frontend só mostra o preview) — com
  teste dos mesmos casos de referência dos dois lados.
- Migration: `NUMERIC(10,4)` + unidade `g/mL`; seeder novo insere
  `densidade_corporal` no catálogo de bancos já existentes.
- VO₂ e os demais protocolos de dobras continuam fora de escopo.
