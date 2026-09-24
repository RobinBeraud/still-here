-- =====================================================================
-- Plans initiaux (hypothèses de prix à tester — docs/PRICING_EXPERIMENTS.md)
-- Prix, quotas et bundles sont des DONNÉES : modifiables sans changer le code.
-- provider_price_ids est rempli par `npm run stripe:setup`.
-- =====================================================================
insert into public.plans (code, name, tagline, sort_order, billing_model, display_price_cents, display_recurring_cents, included_years, entitlements, features) values
('discover', 'Discover', 'Begin telling your story.', 0, 'free', 0, null, null,
 '{"can_create_avatar": false, "can_use_live_avatar": false, "max_loved_ones": 0, "max_memories": 10, "avatar_minutes_included": 0, "storage_limit_bytes": 524288000, "future_messages_enabled": false, "legacy_mode_enabled": false, "advanced_backup_enabled": false, "memory_book_enabled": false}',
 '["A guided interview with your AI biographer", "Around 10 preserved memories", "Talk to your Still Here by text"]'),
('still_here', 'Still Here', 'Your stories, your voice, preserved.', 1, 'one_time_plus_annual', 29900, 7900, null,
 '{"can_create_avatar": true, "can_use_live_avatar": true, "max_loved_ones": 1, "max_memories": null, "avatar_minutes_included": 300, "storage_limit_bytes": 21474836480, "future_messages_enabled": false, "legacy_mode_enabled": false, "advanced_backup_enabled": true, "memory_book_enabled": false}',
 '["Unlimited memories and photos", "Your personal avatar and voice", "5 hours of video conversations per year", "Share with 1 loved one", "Encrypted off-site backups"]'),
('legacy', 'Legacy', 'For the family, for the long run.', 2, 'one_time', 69900, 9900, 5,
 '{"can_create_avatar": true, "can_use_live_avatar": true, "max_loved_ones": 10, "max_memories": null, "avatar_minutes_included": 600, "storage_limit_bytes": 107374182400, "future_messages_enabled": true, "legacy_mode_enabled": true, "advanced_backup_enabled": true, "memory_book_enabled": true}',
 '["Everything in Still Here", "5 years included, then about €99/year", "Share with up to 10 loved ones", "10 hours of video conversations per year", "Time capsules and legacy features as they launch"]'),
('forever', 'Forever', 'Long-term transmission, with care.', 3, 'contact', 149000, null, null,
 '{"can_create_avatar": true, "can_use_live_avatar": true, "max_loved_ones": 50, "max_memories": null, "avatar_minutes_included": 1200, "storage_limit_bytes": 536870912000, "future_messages_enabled": true, "legacy_mode_enabled": true, "advanced_backup_enabled": true, "memory_book_enabled": true}',
 '["Everything in Legacy", "Long-term preservation commitment", "Assisted interviews and photo digitisation", "Talk to us to tailor it"]')
on conflict (code) do nothing;
