-- Starting prices and allowances remain placeholders until Q1.
INSERT INTO plans (id, code, name, monthly_price_poisha, yearly_price_poisha, limits, position, trial_days)
VALUES
  ('019a8390-0000-7000-8000-000000000001', 'free', 'Free', 0, 0,
    '{"customers":500,"seats":1,"ai_conversation":0,"ai_content":20,"ai_ask":20}', 0, 0),
  ('019a8390-0000-7000-8000-000000000002', 'starter', 'Starter', 149000, 1490000,
    '{"customers":2000,"seats":2,"ai_conversation":300,"ai_content":100,"ai_ask":100}', 1, 14),
  ('019a8390-0000-7000-8000-000000000003', 'growth', 'Growth', 349000, 3490000,
    '{"customers":10000,"seats":5,"ai_conversation":1500,"ai_content":400,"ai_ask":400}', 2, 14),
  ('019a8390-0000-7000-8000-000000000004', 'pro', 'Pro', 799000, 7990000,
    '{"customers":50000,"seats":15,"ai_conversation":5000,"ai_content":1500,"ai_ask":1500}', 3, 14)
ON CONFLICT (code) DO UPDATE SET trial_days = EXCLUDED.trial_days
WHERE plans.trial_days = 0;
