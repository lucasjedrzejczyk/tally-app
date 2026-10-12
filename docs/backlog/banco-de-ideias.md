# Banco de ideias

Ideias que o dono quer guardar para depois. Não estão na fila; cada uma vira spec quando entrar.

## Busca por sentido (embeddings), anotada em 2026-10-07

Origem: EmbeddingGemma 2 do Google (https://blog.google/innovation-and-ai/technology/developers-tools/embeddinggemma-2/).
Modelo gratuito (Apache 2.0) que transforma texto em vetores de sentido; 270M parâmetros só texto,
8K de contexto, 768 dimensões que podem ser cortadas para 256/128 (Matryoshka). Roda local
(transformers.js, Ollama, llama.cpp).

Usos na Mercy, do mais forte ao mais fraco:
1. **Busca por tema na Bíblia**: "perdão entre irmãos" acha Mt 18, Ef 4:32, Cl 3:13 sem a palavra exata.
2. **Sermões e notas antigas pelo assunto**: "já preguei sobre ansiedade?".
3. **Referências cruzadas sugeridas**: versículos parecidos com o aberto.

Decisão pendente: onde roda a pergunta na hora da busca (tem que ser o mesmo modelo dos versículos).
- No navegador: ~190 MB no primeiro uso. Pesado demais para o público.
- Servidor próprio: custo mensal e mais uma peça.
- Embedding pago do Gemini no lugar deste: centavos/mês, sem servidor. Provável padrão.

Custo de banco: ~31 mil versículos em 256 dimensões com pgvector ≈ 30-40 MB (banco em 330/500 MB).
Gerar os vetores dos versículos é de graça, uma vez, no PC (mesmo esquema do alinhamento do AT).

Próximo passo quando voltar: escolher o recurso (sugestão: busca por tema na Bíblia) e escrever a spec.

## Paletas e ícone da congregação, anotada em 2026-10-07

Pedido do dono: cada igreja deixa a Mercy com a cara dela.
1. **Galeria de ~50 paletas** prontas, cobrindo uma faixa larga de identidades (sóbrias, quentes, frias, terrosas, vibrantes, pastéis), cada uma com versão clara e escura já testada em contraste. A igreja escolhe uma em Ajustes e o app inteiro troca de cor (hoje já é tudo token em `globals.css`, então é trocar os valores de `--blue`, `--blue-deep`, neutros por paleta).
2. **Ícone da congregação** no lugar do selo do cordeiro (menu lateral, aba do navegador, e-mails). Só a partir de um plano pago, a definir ("plano X").

A decidir quando entrar: paleta é por igreja (todos os membros veem) ou por pessoa; quem pode trocar (cargo com permissão de Ajustes); se a palavra "mercy" continua junto do ícone da igreja.
Liga com: catálogo de planos em código (`tally-planos-fase1`), trava de recurso por plano.

Acrescentado em 2026-10-09 (módulo de personalização de Ministérios, junto com o da UI): os
documentos impressos da igreja também ganham a cara dela. Primeiro caso: o **certificado de
batismo** (hoje sóbrio, só texto e assinaturas, em `/people/[id]/batismo`) com moldura e logo da
igreja; depois ficha cadastral impressa e recibos. Mesma fonte da verdade da paleta/ícone.

## Arrastar da borda para fechar a nota no celular, anotada em 2026-10-07 (FEITA no mesmo dia: e2e/notes-swipe.spec.ts)

Na revisão de movimento (skill emil-design-eng) da tarefa 9: a nota aberta no celular entra pela direita mas só fecha pelo botão "Notas". O gesto esperado no iPhone é arrastar da borda esquerda: a tela segue o dedo 1:1, fecha se passar da metade ou se o movimento for rápido (velocidade > ~0,11 px/ms), senão volta com mola. Precisa testar em aparelho de verdade. Arquivo: `src/features/study/components/NotesLibrary.tsx`.

## Tutorial guiado e página de tutorial, anotada em 2026-10-08

Pedido do dono ao testar Finanças: ele demorou a achar onde escolher o banco pela logo (fica em
Finanças > Movimentações > "Gerenciar contas"). Duas peças, ambas importantes:
1. **Tutorial guiado (primeiro uso)**: passeio curto que destaca os pontos-chave na própria tela
   (ex.: "Cadastre a conta do banco aqui", "Importe o extrato aqui"), pulável e que não volta a
   aparecer depois de visto. Um por módulo (Estudo, Finanças...), disparado no primeiro acesso.
2. **Página fixa de tutorial** ("Como usar a Mercy"), sempre acessível pelo menu/Ajustes, com
   passo a passo por tarefa (cadastrar conta, importar extrato, classificar, registrar dízimo,
   fechar o mês, emitir recibo) e prints/vídeos curtos.

A decidir quando entrar: biblioteca de tour ou componente próprio; texto em PT e EN; onde guardar
"já viu o tutorial" (por pessoa).

## Varredura de vulnerabilidades da Anthropic (OSS Scanner), anotada em 2026-10-09

Origem: https://www.anthropic.com/research/launching-opt-in-vuln-finding-service-for-open-source
Serviço gratuito e opcional da Anthropic que usa os modelos mais fortes dela para achar falhas de
segurança em código aberto. Os relatórios são gerados pelo modelo sem revisão humana prévia, então
podem ter erro. Entrada por pull request em github.com/anthropics/oss-scanner, seguindo o modelo do repo.

Ressalva: é para mantenedores de projetos open source de impacto crítico (critério parecido com o
OSS-Fuzz), avaliado caso a caso. A Mercy hoje é repositório privado, então não se encaixa como está.

Quando voltar: ver se algum pedaço da Mercy vira open source (ex.: dados/alinhamento bíblico em PT)
e se teria peso para entrar; senão, usar a mesma ideia internamente (revisão de segurança com o
Claude antes de abrir dados de membros, LGPD).

## Network com pastores, anotada em 2026-10-12

Pedido do dono, ainda em aberto: criar uma rede (network) de pastores em volta da Mercy. A definir
quando entrar: se é comunidade fora do app (grupo, encontros, lista de contatos para divulgação e
indicação) ou um espaço dentro da Mercy onde pastores de igrejas diferentes conversam e trocam
material (esboços, séries). Liga com a divulgação abaixo e com o crescimento por indicação.

## Stories da Mercy com CTA para a liderança, anotada em 2026-10-12

Ideia de divulgação nos stories (Instagram). CTA no estilo: "Se você faz parte da equipe pastoral
ou da liderança de algum ministério, clique neste botão". O botão (figurinha de link) leva para
joinmercy.com.
A decidir quando entrar: sequência de stories (problema, demo curta do app, CTA), se o link leva
para a página inicial ou para uma página própria da campanha (ex.: /pt com o texto para liderança),
e como medir quem veio pelos stories (parâmetro utm no link).
