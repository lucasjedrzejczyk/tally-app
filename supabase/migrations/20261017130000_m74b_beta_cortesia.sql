-- m74b — Spec 20: beta testers viram cortesia sem data (o dono encerra no /admin).
-- plan='pro' fica de propósito: sem plan_status='active' ele não libera nada no código novo,
-- e mantém o código antigo liberando enquanto o deploy não termina. Suspensas caem no grátis.
update public.organizations
  set pro_until = '2100-01-01', plan_status = 'none'
  where status = 'active';

update public.organizations
  set plan = 'free', plan_status = 'none', pro_until = null, grace_until = null
  where status <> 'active';
