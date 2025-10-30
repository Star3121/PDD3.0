-- 修复各表主键序列，以使后续插入不会发生主键冲突
-- 在导入数据后执行该迁移

DO $$
BEGIN
  -- categories
  PERFORM setval(
    pg_get_serial_sequence('public.categories', 'id'),
    COALESCE((SELECT MAX(id) FROM public.categories), 1)
  );

  -- templates
  PERFORM setval(
    pg_get_serial_sequence('public.templates', 'id'),
    COALESCE((SELECT MAX(id) FROM public.templates), 1)
  );

  -- orders
  PERFORM setval(
    pg_get_serial_sequence('public.orders', 'id'),
    COALESCE((SELECT MAX(id) FROM public.orders), 1)
  );

  -- designs
  PERFORM setval(
    pg_get_serial_sequence('public.designs', 'id'),
    COALESCE((SELECT MAX(id) FROM public.designs), 1)
  );
END $$;