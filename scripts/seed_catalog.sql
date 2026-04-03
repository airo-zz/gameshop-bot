-- scripts/seed_catalog.sql
-- Начальные данные каталога для демонстрации

-- Игры
INSERT INTO games (id, name, slug, description, is_active, is_featured, sort_order, tags, meta, image_url)
VALUES
  (gen_random_uuid(), 'Brawl Stars', 'brawl-stars', 'Донат для Brawl Stars — гемы, скины, боевой пропуск', true, true, 1, ARRAY['mobile','supercell'], '{}', NULL),
  (gen_random_uuid(), 'PUBG Mobile', 'pubg-mobile', 'UC и Royal Pass для PUBG Mobile', true, true, 2, ARRAY['mobile','shooter'], '{}', NULL),
  (gen_random_uuid(), 'Genshin Impact', 'genshin-impact', 'Кристаллы генезиса и Blessing of the Welkin Moon', true, true, 3, ARRAY['mobile','pc','rpg'], '{}', NULL),
  (gen_random_uuid(), 'Fortnite', 'fortnite', 'V-Bucks и боевой пропуск Fortnite', true, false, 4, ARRAY['pc','console','shooter'], '{}', NULL),
  (gen_random_uuid(), 'Roblox', 'roblox', 'Robux для Roblox', true, false, 5, ARRAY['pc','mobile'], '{}', NULL),
  (gen_random_uuid(), 'Standoff 2', 'standoff-2', 'Голда и кейсы Standoff 2', true, false, 6, ARRAY['mobile','shooter'], '{}', NULL)
ON CONFLICT DO NOTHING;

-- Категории (привязываем к играм по slug)
INSERT INTO categories (id, game_id, name, slug, is_active, sort_order)
SELECT gen_random_uuid(), g.id, 'Гемы', 'gems', true, 1
FROM games g WHERE g.slug = 'brawl-stars'
ON CONFLICT DO NOTHING;

INSERT INTO categories (id, game_id, name, slug, is_active, sort_order)
SELECT gen_random_uuid(), g.id, 'Боевой пропуск', 'brawl-pass', true, 2
FROM games g WHERE g.slug = 'brawl-stars'
ON CONFLICT DO NOTHING;

INSERT INTO categories (id, game_id, name, slug, is_active, sort_order)
SELECT gen_random_uuid(), g.id, 'UC', 'uc', true, 1
FROM games g WHERE g.slug = 'pubg-mobile'
ON CONFLICT DO NOTHING;

INSERT INTO categories (id, game_id, name, slug, is_active, sort_order)
SELECT gen_random_uuid(), g.id, 'Royal Pass', 'royal-pass', true, 2
FROM games g WHERE g.slug = 'pubg-mobile'
ON CONFLICT DO NOTHING;

INSERT INTO categories (id, game_id, name, slug, is_active, sort_order)
SELECT gen_random_uuid(), g.id, 'Кристаллы генезиса', 'genesis-crystals', true, 1
FROM games g WHERE g.slug = 'genshin-impact'
ON CONFLICT DO NOTHING;

INSERT INTO categories (id, game_id, name, slug, is_active, sort_order)
SELECT gen_random_uuid(), g.id, 'V-Bucks', 'vbucks', true, 1
FROM games g WHERE g.slug = 'fortnite'
ON CONFLICT DO NOTHING;

INSERT INTO categories (id, game_id, name, slug, is_active, sort_order)
SELECT gen_random_uuid(), g.id, 'Robux', 'robux', true, 1
FROM games g WHERE g.slug = 'roblox'
ON CONFLICT DO NOTHING;

INSERT INTO categories (id, game_id, name, slug, is_active, sort_order)
SELECT gen_random_uuid(), g.id, 'Голда', 'gold', true, 1
FROM games g WHERE g.slug = 'standoff-2'
ON CONFLICT DO NOTHING;

-- Товары для Brawl Stars → Гемы
INSERT INTO products (id, category_id, name, description, short_description, price, currency, delivery_type, is_active, is_featured, sort_order, input_fields, images, tags, meta)
SELECT gen_random_uuid(), c.id, '80 гемов', 'Пополнение 80 гемов на ваш аккаунт Brawl Stars', '80 гемов Brawl Stars', 99.00, 'RUB', 'manual', true, false, 1, '[{"key":"player_tag","label":"Тег игрока","type":"text","placeholder":"#XXXXXXXX","required":true}]'::jsonb, ARRAY[]::varchar[], ARRAY['gems'], '{}'::jsonb
FROM categories c JOIN games g ON c.game_id = g.id WHERE g.slug = 'brawl-stars' AND c.slug = 'gems'
ON CONFLICT DO NOTHING;

INSERT INTO products (id, category_id, name, description, short_description, price, currency, delivery_type, is_active, is_featured, sort_order, input_fields, images, tags, meta)
SELECT gen_random_uuid(), c.id, '170 гемов', 'Пополнение 170 гемов на ваш аккаунт Brawl Stars', '170 гемов Brawl Stars', 199.00, 'RUB', 'manual', true, true, 2, '[{"key":"player_tag","label":"Тег игрока","type":"text","placeholder":"#XXXXXXXX","required":true}]'::jsonb, ARRAY[]::varchar[], ARRAY['gems','popular'], '{}'::jsonb
FROM categories c JOIN games g ON c.game_id = g.id WHERE g.slug = 'brawl-stars' AND c.slug = 'gems'
ON CONFLICT DO NOTHING;

INSERT INTO products (id, category_id, name, description, short_description, price, currency, delivery_type, is_active, is_featured, sort_order, input_fields, images, tags, meta)
SELECT gen_random_uuid(), c.id, '360 гемов', 'Пополнение 360 гемов на ваш аккаунт Brawl Stars', '360 гемов Brawl Stars', 399.00, 'RUB', 'manual', true, true, 3, '[{"key":"player_tag","label":"Тег игрока","type":"text","placeholder":"#XXXXXXXX","required":true}]'::jsonb, ARRAY[]::varchar[], ARRAY['gems','best_value'], '{}'::jsonb
FROM categories c JOIN games g ON c.game_id = g.id WHERE g.slug = 'brawl-stars' AND c.slug = 'gems'
ON CONFLICT DO NOTHING;

-- Товары для PUBG Mobile → UC
INSERT INTO products (id, category_id, name, description, short_description, price, currency, delivery_type, is_active, is_featured, sort_order, input_fields, images, tags, meta)
SELECT gen_random_uuid(), c.id, '60 UC', 'Пополнение 60 UC на ваш аккаунт PUBG Mobile', '60 UC PUBG Mobile', 99.00, 'RUB', 'manual', true, false, 1, '[{"key":"pubg_id","label":"ID игрока","type":"text","placeholder":"5XXXXXXXXX","required":true}]'::jsonb, ARRAY[]::varchar[], ARRAY['uc'], '{}'::jsonb
FROM categories c JOIN games g ON c.game_id = g.id WHERE g.slug = 'pubg-mobile' AND c.slug = 'uc'
ON CONFLICT DO NOTHING;

INSERT INTO products (id, category_id, name, description, short_description, price, currency, delivery_type, is_active, is_featured, sort_order, input_fields, images, tags, meta)
SELECT gen_random_uuid(), c.id, '325 UC', 'Пополнение 325 UC на ваш аккаунт PUBG Mobile', '325 UC PUBG Mobile', 449.00, 'RUB', 'manual', true, true, 2, '[{"key":"pubg_id","label":"ID игрока","type":"text","placeholder":"5XXXXXXXXX","required":true}]'::jsonb, ARRAY[]::varchar[], ARRAY['uc','popular'], '{}'::jsonb
FROM categories c JOIN games g ON c.game_id = g.id WHERE g.slug = 'pubg-mobile' AND c.slug = 'uc'
ON CONFLICT DO NOTHING;

INSERT INTO products (id, category_id, name, description, short_description, price, currency, delivery_type, is_active, is_featured, sort_order, input_fields, images, tags, meta)
SELECT gen_random_uuid(), c.id, '660 UC', 'Пополнение 660 UC на ваш аккаунт PUBG Mobile', '660 UC PUBG Mobile', 849.00, 'RUB', 'manual', true, false, 3, '[{"key":"pubg_id","label":"ID игрока","type":"text","placeholder":"5XXXXXXXXX","required":true}]'::jsonb, ARRAY[]::varchar[], ARRAY['uc'], '{}'::jsonb
FROM categories c JOIN games g ON c.game_id = g.id WHERE g.slug = 'pubg-mobile' AND c.slug = 'uc'
ON CONFLICT DO NOTHING;

-- Товары для Genshin Impact → Кристаллы
INSERT INTO products (id, category_id, name, description, short_description, price, currency, delivery_type, is_active, is_featured, sort_order, input_fields, images, tags, meta)
SELECT gen_random_uuid(), c.id, '300 кристаллов', 'Пополнение 300 кристаллов генезиса', '300 кристаллов Genshin', 379.00, 'RUB', 'manual', true, true, 1, '[{"key":"uid","label":"UID","type":"text","placeholder":"8XXXXXXXX","required":true},{"key":"server","label":"Сервер","type":"select","options":["Europe","America","Asia","TW/HK/MO"],"required":true}]'::jsonb, ARRAY[]::varchar[], ARRAY['crystals'], '{}'::jsonb
FROM categories c JOIN games g ON c.game_id = g.id WHERE g.slug = 'genshin-impact' AND c.slug = 'genesis-crystals'
ON CONFLICT DO NOTHING;

INSERT INTO products (id, category_id, name, description, short_description, price, currency, delivery_type, is_active, is_featured, sort_order, input_fields, images, tags, meta)
SELECT gen_random_uuid(), c.id, 'Welkin Moon', 'Благословение полой луны — 30 дней х 90 примогемов', 'Welkin Moon Genshin', 449.00, 'RUB', 'manual', true, true, 2, '[{"key":"uid","label":"UID","type":"text","placeholder":"8XXXXXXXX","required":true},{"key":"server","label":"Сервер","type":"select","options":["Europe","America","Asia","TW/HK/MO"],"required":true}]'::jsonb, ARRAY[]::varchar[], ARRAY['welkin','popular'], '{}'::jsonb
FROM categories c JOIN games g ON c.game_id = g.id WHERE g.slug = 'genshin-impact' AND c.slug = 'genesis-crystals'
ON CONFLICT DO NOTHING;
