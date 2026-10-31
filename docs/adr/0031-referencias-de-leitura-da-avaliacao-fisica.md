# ADR-0031: Referências de leitura das medidas da avaliação física

**Status:** Aceita (2026-10-31)

> Não altera a ADR-0016 (modelo e CRUD), a ADR-0024 (cálculo do Pollock 7) nem
> a ADR-0025/0029 (o Acompanhamento Mensal e o PDF continuam sem classificação
> — ver "Fora desta decisão").

## Contexto

Na tela de avaliações físicas, boa parte das medidas aparece como número frio:
"IMC 27,4", "RCQ 0,88", "PA 135/88". Para saber se aquilo é bom ou ruim, o
personal precisa lembrar das tabelas ou buscar na literatura. Pedido da equipe
(2026-10-31): mostrar, onde existir, o que o valor significa, do mesmo jeito que
um exame de sangue mostra o valor de referência.

## Decisão

1. **Classificação calculada na hora, nunca gravada.** É uma leitura do valor,
   não dado novo: nada no banco, nada no backend. Se uma tabela de referência
   mudar, todas as avaliações (inclusive as importadas do BodyMove) passam a
   ser lidas pela tabela nova. Módulo puro `frontend/src/utils/referenciasAvaliacaoFisica.js`,
   com teste.
2. **Só onde existe referência aceita**, com a fonte citada na tela:

   | Métrica | Referência | Depende de |
   |---|---|---|
   | IMC | OMS (adulto); Lipschitz 1994 / SISVAN para 60+ | idade |
   | % de gordura | Gallagher et al. 2000 (Am J Clin Nutr) | sexo + idade |
   | Cintura | OMS 2008 — 94/102 cm (H), 80/88 cm (M) | sexo |
   | RCQ | OMS 2008 — 0,90 (H), 0,85 (M) | sexo |
   | Cintura-estatura | Ashwell — 0,5 e 0,6 | — |
   | Pressão (PAS/PAD) | Diretriz Brasileira de Hipertensão 2020 (SBC) | — |
   | FC de repouso | AHA — 60–100 bpm | — |

   Menores de 18 anos ficam sem referência nas tabelas de adulto. Faltando sexo
   ou nascimento no cadastro, a métrica que depende deles mostra "sem
   referência — falta … no cadastro", no mesmo padrão do Pollock 7.
3. **Linguagem de referência, não de diagnóstico.** A pressão aparece como
   "Limítrofe" / "Elevada · faixa 1…3" (o nome da diretriz fica na explicação),
   e a categoria combinada segue a regra da diretriz (vale a maior entre
   sistólica e diastólica). A partir da faixa 1, aviso de encaminhamento
   médico; na faixa 3, orientar avaliação médica antes de treino intenso. No
   IMC, aviso fixo de que ele não separa músculo de gordura.
4. **Toda métrica tem um "o que é".** As que não têm faixa (peso, perímetros,
   dobras, massas, densidade, TMB…) mostram a explicação, a direção favorável
   do catálogo (`direcao_favoravel`) e a variação para a avaliação anterior —
   só entre o mesmo método, como na ADR-0025.
5. **Apresentação em camadas:** selo colorido ao lado do valor (com um "i"
   indicando que expande) → toque na linha abre o painel com a explicação, a
   régua de faixas com marcador, as faixas em texto e a fonte. No card fechado,
   selo no IMC e na % de gordura; no formulário, selo ao vivo enquanto digita;
   no Comparar, bolinha por célula. Tooltip (`title`) só como atalho de
   desktop — no celular não existe hover.

## Alternativas consideradas

- **Tabela do ACSM (percentis) para a % de gordura** — foi a primeira proposta.
  Trocada por Gallagher 2000: é uma classificação de saúde (baixa / adequada /
  elevada / muito elevada, equivalente às faixas do IMC), por sexo e idade,
  publicada e usada pelas balanças de bioimpedância; os percentis do ACSM medem
  posição na população, não risco, e exigiriam transcrever uma tabela extensa
  por faixa etária.
- **VO₂máx e FC de repouso por sexo/idade (ACSM/Cooper/YMCA)** — ficaram de fora
  nesta versão pelo mesmo motivo; o VO₂ mostra só a explicação. A FC usa a
  faixa adulta da AHA.
- **Gravar a classificação junto da medida** — descartado: congelaria a
  referência do dia da avaliação e criaria um dado que ninguém digitou.
- **Tabelas editáveis pela tela** — descartado: referência clínica é commit,
  com teste e fonte, não configuração por equipe.
- **Só tooltip** — descartado: não funciona no celular e não comporta a régua.

## Consequências

- O personal lê a avaliação sem consultar tabela; a fonte fica visível.
- Mudar uma faixa é mudar o módulo e o teste correspondente.
- **Fora desta decisão (próxima fase, decisão própria):** levar a classificação
  ao prompt do Acompanhamento Mensal (hoje o bloco da ADR-0025 manda só
  números) e mostrá-la no PDF do aluno (ADR-0029) — exige cuidado com rótulos
  como "Obesidade I" num documento entregue ao aluno.
