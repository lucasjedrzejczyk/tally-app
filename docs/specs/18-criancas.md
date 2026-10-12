# Spec 18. Crianças (módulo 5 do roadmap)

Decisões do dono em 2026-10-12:

1. **Identidade própria "mercy kids"**, direção brincalhão suave: fundo creme, cores vivas sem berrar (sol, coral, céu, folha), fonte arredondada, cantos bem redondos, cordeirinho de mascote. Vale para **todo o módulo** (telas da equipe, totem, código de retirada). Entrar em Crianças muda o clima do app.
2. **Entrada pela equipe e por modo totem**: a recepção faz pelo celular; um tablet na porta vira totem onde o responsável digita o telefone, toca nos filhos e recebe o código.
3. **Retirada por código de 4 letras**, sem impressora: aparece na tela na entrada, vai pelo WhatsApp quando a equipe faz, e a tia da sala confere na saída. Etiqueta impressa fica fora.

Regras de sempre (specs 13 a 17): PT-BR sem travessão longo nem emoji; Lucide via `UiIcon`; sem `style={{}}` inline (só custom props); hover só em `@media (hover:hover) and (pointer:fine)`; nada nativo do Windows; `Avatar` compartilhado; rostos e toque, não planilha; ler separado de editar; app do membro continua fora (o totem roda num aparelho da igreja, logado pela equipe).

## Identidade "mercy kids"

- **Escopo**: tudo sob `/kids` fica dentro de `<div class="kids">`, que redefine os tokens (`--bg`, `--main`, `--surface*`, `--text*`, `--border`, `--blue`, `--action-soft`, raios) para a paleta kids. Os componentes compartilhados herdam sem mudar código. Menu lateral e tab bar continuam Mercy; o item Crianças ganha o ponto sol.
- **Paleta claro**: creme `#FFF8EC` (fundo), papel `#FFFDF7` (cartão), tinta `#2D2A3E` (texto), tinta-2 `#6E6880`, fio `#F0E6D2`; acentos sol `#FFC53D`, coral `#FF7A59`, céu `#4BA3E3`, folha `#46A758`. Ação principal = coral (texto branco 600 em 15px passa 3:1 como texto grande; botões têm 17px). **Escuro**: noite `#1B1F2E`, cartão `#242A3D`, texto `#F6F1E7`, mesmos acentos um tom mais claro.
- **Tipo**: Baloo 2 (700/800) para títulos, números e o código; Nunito (400/600/700) no resto. Só carregadas no layout de `/kids` (`next/font/google`).
- **Forma**: cantos 20px nos cartões, 999px nos botões; sombra macia `0 2px 0 var(--kids-fio), 0 8px 24px rgb(45 42 62 / .06)`; nada de fio cinza duro.
- **Salas com cor e bicho**: cada sala escolhe uma das 4 cores e um bicho Lucide (`Rabbit`, `Bird`, `Fish`, `Turtle`, `Squirrel`, `Snail`, `Cat`, `Dog`). A criança reconhece a sala pelo bicho; o pai pela cor.
- **Mascote**: `public/mercy-kids-cordeiro.svg`, versão arredondada do selo, usada no topo, no vazio e no obrigado do totem. Wordmark "mercy **kids**" em Baloo 800 minúsculo, "kids" em coral.
- **Movimento**: o código de retirada entra com escala .9 para 1 e leve sobe (spring 300ms); check-in feito faz o rosto da criança "pular" uma vez (translateY -6px, 220ms). Nada anima ao abrir telas. `prefers-reduced-motion` desliga tudo.

## Banco (m72, `supabase/migrations/20261014120000_m72_criancas.sql`)

- `kids_rooms`: id, org_id, name, color (`sol|coral|ceu|folha`), animal text, min_months int, max_months int, capacity int null, position int, active bool. Seed sugerido na primeira abertura (botão "Usar salas sugeridas"): Berçário 0 a 2 anos, Maternal 3 a 5, Kids 6 a 8, Juniores 9 a 11.
- `kids_profiles` (dados sensíveis, separados de `sticks`): stick_id pk → sticks cascade, org_id, allergies text, care_notes text, authorized_pickup text (nomes de outros que podem buscar), photo_ok bool default true. RLS: só `kids.view`.
- `kids_checkins`: id, org_id, stick_id, room_id, guardian_id → sticks (quem trouxe), date, service_id → services null (culto do dia, vindo de Encontros), code char(4), checked_in_at, checked_in_by, checked_out_at, checked_out_by, picked_up_by text, via (`staff|totem`). Índice único parcial: uma entrada aberta por criança (`where checked_out_at is null`). Código = 4 caracteres sem ambíguos (sem 0, O, 1, I, L), o mesmo para os irmãos que entram juntos, único entre as entradas abertas do dia.
- Permissões novas no grupo "Crianças": `kids.view` (ver salas, fazer entrada e saída: voluntário) e `kids.manage` (salas, fichas, relatórios). RLS: ler e gravar check-in = `kids.view`; salas e perfis gravar = `kids.manage`.
- RPC `kids_totem_lookup(p_org, p_phone)` security invoker: acha a família pelo telefone completo (só dígitos) de um responsável e devolve só nome e foto dos filhos com idade de sala. RPC `kids_checkin(p_children uuid[], p_guardian, p_service, p_via)` grava tudo e devolve o código.
- `service_dates.kids` passa a ser preenchido sozinho pela contagem de entradas do culto naquele dia (trigger), quando houver entradas; quem digitou à mão continua valendo se não houver nenhuma.
- Atualizar `database.types.ts` à mão.

## Fase A. Hoje (tela da equipe, `/kids`)

A1. **Menu e rotas.** "Crianças" (ícone `Baby`) em `STUDY_ITEMS` depois de Cuidado; `/kids` em `STUDY_ONLY_KEEPS`; plano: chave `kids` (Pro). `/kids/totem` e `/kids/salas` (config).
A2. **Lógica pura** `features/kids/domain.ts` com testes: `ageMonths(birth, today)`, `ageLabel` ("2 anos", "8 meses"), `roomFor(rooms, birth, today)`, `newCode(taken)`, `normalizePhone`, `currentService(services, now)` (culto de hoje mais próximo do horário atual, janela de 1h antes até 3h depois), `birthdayThisWeek`.
A3. **Topo**: wordmark mercy kids pequeno, o culto de agora ("Culto da Família · 19h", trocável) e dois botões grandes lado a lado: **Entrada** (coral) e **Saída** (céu). No celular ficam fixos no rodapé (material translúcido da spec 17).
A4. **Salas de hoje**: um cartão por sala na cor dela, bicho grande, nome, "7 crianças" e a pilha de rostos. Lotada (capacity) mostra "Cheia" em coral. Tocar abre a sala.
A5. **Sala aberta**: grade de rostos 64px com nome e idade; selos sobre o rosto: alergia (`TriangleAlert` coral), aniversário da semana (`Cake` sol), sem foto (`CameraOff`). Tocar no rosto: ficha curta com responsável, alergias e cuidados, autorizados, e ações **Chamar responsável** (WhatsApp pronto: "Oi, Ana! Pode vir até a sala Maternal? É sobre o Theo.") e **Saída**.

## Fase B. Entrada e saída

B1. **Entrada pela equipe**: busca por nome da criança ou do responsável, ou telefone. Mostra a família: rostos dos filhos já marcados conforme a sala sugerida pela idade (toque desmarca; sala trocável). "Fazer entrada" grava e mostra o **código grande** com "Mandar no WhatsApp" (link pronto para o telefone do responsável: "Código de retirada do Theo e da Bia: K7PX. Mostre na saída.") e "Pronto".
B2. **Criança nova** (visitante): nome, nascimento (`DateField`), responsável (busca em Pessoas ou nome e telefone novos), alergias. Cria a pessoa, a família e o perfil numa tacada e cai na entrada já marcada.
B3. **Saída**: teclado grande de 4 letras (só os caracteres possíveis). Achou: mostra os rostos daquele código com a sala; "Entregar" pede quem buscou (chips: responsável, autorizados, "Outra pessoa" com nome). Código errado: "Não achamos esse código. Confira com o responsável." Criança sem código em mãos: pela sala, Saída exige escolher quem buscou e grava com "sem código" na linha do tempo (só `kids.manage` pode).
B4. Fim do culto: botão "Encerrar o dia" (gestor) mostra quem ainda não saiu, em coral.

## Fase C. Totem (`/kids/totem`)

C1. Tela cheia, sem menu, fundo creme com o cordeiro. "Olá! Digite seu telefone" com teclado numérico grande (botões de 72px).
C2. Achou: "Quem vem hoje?" com os rostos dos filhos grandes (já marcados), a sala com cor e bicho embaixo de cada um. "Fazer entrada" grava (`via='totem'`) e mostra o código gigante com "Tire uma foto ou guarde este código" por 20 s, depois volta sozinho ao início.
C3. Não achou ou criança nova: "Fale com a recepção, vamos te ajudar." (não cadastra no totem).
C4. Sair do totem: segurar o cordeiro do canto por 3 s pede a confirmação da equipe (senha da conta não; só "Sair do totem" num diálogo). Totem nunca mostra alergias nem telefones.

## Fase D. Salas e fichas (`kids.manage`)

D1. `/kids/salas`: lista das salas com cor, bicho, faixa de idade e capacidade; editar inline num painel; arrastar não (setas sobe/desce, igual ordem do culto).
D2. Na ficha da pessoa (Pessoas), para quem tem papel "filho" na família e menos de 12 anos: bloco "Crianças" com sala, alergias, cuidados, autorizados, "Pode aparecer em fotos". Editar separado.
D3. Relatório simples no fim da tela Hoje (recolhido): presenças das últimas 8 semanas por sala em barras e "Crianças que não vêm há 4 semanas" (vira sugestão do Cuidado depois, fora desta spec).

## Revisão de design (2026-10-12)

| Antes | Depois | Por quê |
| --- | --- | --- |
| Botões coral e céu com texto branco | Botão usa o tom fundo: coral `#D9502F`, céu `#2B7FC0`, folha `#2A7E3B` (cor clara fica para fundos, selos e bicho) | Branco sobre `#FF7A59` dá 2,6:1 e sobre `#4BA3E3` 2,7:1; falha até como texto grande |
| Cartão de sala no escuro com fundo "soft" chapado (coral virou marrom) | No escuro o cartão é neutro (`--card`) e a cor fica só no quadrado do bicho | Qualquer tom de coral escurecido vira barro ou roxo sobre a noite azulada |
| Rosto "pula" a cada entrada na tela da equipe | Pulo só no totem; na equipe, o rosto ganha o selo de feito sem movimento | A recepção faz dezenas por culto; animação repetida atrasa |
| Código entra com spring 300ms em todo lugar | Totem: escala .9 para 1 + opacity, 300ms `--ease-spring`. Equipe: opacity 150ms | O pai vê uma vez (merece cuidado); a equipe vê 40 vezes |
| Código como texto solto | Quatro casas iguais (como código de verificação), Baloo 800, `tabular-nums`; a Saída usa as mesmas casas | Mesma forma na entrada e na saída: a tia reconhece o que o pai mostra |
| Saída com botão "Buscar" | Busca sozinha na 4ª letra; errado = casas tremem (translateX 4px, 3 vezes em 240ms), limpam e voltam ao início | Um toque a menos; o tremor diz "errado" sem ler |
| "Entregar" grava direto | "Entregue" + "Desfazer" por 5 s | Entregar a criança errada por toque escorregado precisa de volta |
| Totem volta ao início em 20 s sem aviso | Anel fino em volta de "Pronto" esvaziando (linear, 20 s); tocar em qualquer lugar pausa; "Pronto" volta na hora | O pai sabe que a tela vai sumir e quanto tempo tem para a foto |
| Totem esquecido no meio (pai saiu) | Sem toque por 45 s volta ao início | Próximo pai não pega a família de outro aberta |
| Segurar o cordeiro 3 s sem retorno | Preenchimento por `clip-path: inset(0 100% 0 0)` para `inset(0)` em 3 s linear ao segurar; soltar volta em 200ms ease-out | Quem segura vê que está funcionando; soltar responde rápido |
| Totem mostra o nome completo dos filhos de qualquer telefone digitado | Primeiro nome + inicial ("Theo S."), sem foto: no lugar dela, o bicho da sala com a inicial | Quem digita o número de outro não leva nome nem rosto da criança |
| Teclado do totem sem retorno ao toque | `:active` scale(.96) imediato (sem esperar transição) + vibração curta | Tecla de 72px em tablet precisa responder sob o dedo |
| Telefone digitado como sequência solta | Máscara `(47) 99999-9999` montando enquanto digita; busca sozinha no 11º dígito | Confere o número de olho, sem botão a mais |
| Cordeiro do selo em qualquer tamanho | Versão simplificada abaixo de 32px (sem as bochechas, contorno 1 traço mais grosso) | Os círculos da lã viram ruído pequeno |
| Troca do clima Mercy para kids ao entrar em /kids | Instantânea, sem fade | Navegação frequente; fade só atrasaria |
| Cartões de sala aparecendo em cascata | Aparecem juntos | Tela aberta muitas vezes por culto |

## Orientações Apple (2026-10-12)

1. **Quem não pode buscar** (responsabilidade): `kids_profiles` ganha `pickup_blocked text` (nome e motivo curto, ex.: guarda judicial). Na Saída, se quem busca bate com o bloqueio, a tela trava em coral fundo com "Não entregue. Chame a liderança." e não deixa seguir; na sala, selo `ShieldAlert` no rosto. Só `kids.manage` edita.
2. **Wi-Fi ruim da igreja** (resposta): entrada e saída otimistas. O código é sorteado no aparelho (evitando os do dia já carregados) e aparece na hora; o servidor confirma por trás e, no raro choque, troca e avisa "Código mudou: M3RT". Sem rede, a entrada fica na fila com o selo "Salvando" e sobe quando a rede voltar; o totem sem rede mostra "Fale com a recepção".
3. **Aviso antes, não depois** (feedback): sala cheia aparece na própria escolha da entrada ("Maternal 12 de 12") e a equipe escolhe outra ou entra assim mesmo; alergia aparece na tela do código ("Theo tem alergia: amendoim") para a recepção avisar a sala.
4. **Saída sempre no mesmo lugar** (wayfinding): no totem, "Voltar" fixo no canto de cima à esquerda em toda etapa, e o passo atual escrito em uma linha ("Telefone", "Quem vem hoje?", "Pronto"). Nada de beco sem volta.
5. **Vibração com causa** (harmonia): vibra no mesmo quadro em que o código aparece, em "Entregue" e no bloqueio da Saída (padrão longo). Tecla do totem: só o afundar visual, sem vibrar a cada número.
6. **Folha da sala no celular** segue o dedo ao arrastar para baixo e fecha pela velocidade do gesto, não só pela distância (reaproveita a folha de baixo da spec 17).
7. **Tamanho de texto do aparelho**: medidas do módulo em `rem`, para avó com letra grande no celular não quebrar a grade de rostos (ela vira 3 colunas em vez de 4).
8. **Totem em pé e deitado**: em pé o teclado fica embaixo (alcance do polegar e da criança não); deitado, teclado à direita e a mensagem à esquerda.
9. **Tipo**: títulos em Baloo com `letter-spacing: -0.02em`; o código mantém `+0.12em` (é para ler letra por letra); texto Nunito com `line-height` 1.5.

## Verificação e entrega

`npm run verify` sem servidor no ar. E2E `e2e/criancas.spec.ts`: entrada pela equipe gera código; saída com o código certo fecha a entrada, errado recusa; totem acha a família pelo telefone e não mostra alergia; contagem do culto em Encontros reflete as entradas; RLS de `kids_profiles` testada no banco com rollback. Prévias `docs/previews/18-*.png`: Hoje 1280 claro e escuro, sala 390, entrada com código 390, totem 1024 em pé. Publicar só depois do dono aprovar as prévias.
