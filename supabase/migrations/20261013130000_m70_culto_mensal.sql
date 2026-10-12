-- m70 Culto mensal (spec 16): semana do mês em que o culto acontece. Nulo = toda semana; 1 a 4 = 1º a 4º; 5 = último.
alter table public.services add column if not exists month_week smallint check (month_week is null or month_week between 1 and 5);
