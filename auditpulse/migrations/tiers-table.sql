-- Store tier definitions in the database for easy management and persistence
CREATE TABLE IF NOT EXISTS tiers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  slug VARCHAR(50) NOT NULL UNIQUE,
  price_cents INTEGER NOT NULL DEFAULT 0,
  billing_period VARCHAR(20) NOT NULL DEFAULT 'month',
  description TEXT,
  max_sites INTEGER DEFAULT 1,
  max_users INTEGER DEFAULT 1,
  checks_available INTEGER DEFAULT 18,
  scan_frequency_hours INTEGER DEFAULT 168, -- weekly = 168 hours
  features JSONB DEFAULT '[]'::jsonb,
  coming_soon BOOLEAN DEFAULT false,
  featured BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Store user tier subscriptions (links users to tiers)
CREATE TABLE IF NOT EXISTS user_tier_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier_id INTEGER NOT NULL REFERENCES tiers(id),
  stripe_subscription_id VARCHAR(255),
  status VARCHAR(50) DEFAULT 'active', -- active, paused, cancelled
  started_at TIMESTAMP DEFAULT now(),
  ended_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  UNIQUE(user_id, tier_id)
);

-- Insert the default tiers
INSERT INTO tiers (name, slug, price_cents, billing_period, description, max_sites, max_users, checks_available, scan_frequency_hours, features, featured, coming_soon)
VALUES
  (
    'Free',
    'free',
    0,
    'forever',
    'Everything you need to secure your own sites',
    10,
    1,
    18,
    168, -- weekly
    '[
      "18 core security checks",
      "Up to 10 websites",
      "Unlimited on-demand audits",
      "Automatic weekly re-audits",
      "Public trust badge & PDF certificate",
      "GitHub fix pull requests",
      "Email reports after every audit"
    ]'::jsonb,
    false,
    false
  ),
  (
    'Professional',
    'professional',
    2900,
    'month',
    'Advanced scanning for growing teams',
    50,
    3,
    30,
    24, -- daily
    '[
      "30 security checks (18 core + 12 advanced)",
      "Daily automatic re-audits",
      "Up to 50 websites",
      "Custom report branding",
      "Team collaboration (3 users)",
      "Slack & email integrations",
      "Read-only API access",
      "Priority support"
    ]'::jsonb,
    true,
    true
  ),
  (
    'Enterprise',
    'enterprise',
    19900,
    'month',
    'Complete security automation for enterprises',
    999999,
    999999,
    50,
    1, -- real-time
    '[
      "50 security checks (18 + 12 + 20 advanced)",
      "Real-time scanning on demand",
      "Unlimited websites",
      "Custom workflows & automation",
      "Team collaboration (unlimited)",
      "Priority support (2hr response)",
      "Advanced analytics & reporting",
      "Single sign-on (SAML)",
      "Compliance reporting"
    ]'::jsonb,
    false,
    true
  ),
  (
    'Elite Penetration Testing',
    'elite-penetration-testing',
    99900,
    'month',
    'World-class penetration testing & hack simulation',
    999999,
    999999,
    70,
    1, -- real-time
    '[
      "70+ security checks including active exploitation",
      "Real-time continuous monitoring",
      "Unlimited sites & subdomains",
      "Manual penetration testing by certified experts",
      "Zero-day vulnerability research",
      "Red team exercises & hack simulations",
      "24/7 dedicated security consultant",
      "Custom compliance reporting (SOC2, PCI-DSS, HIPAA)",
      "Incident response retainer"
    ]'::jsonb,
    false,
    true
  )
ON CONFLICT (slug) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_user_tier_subscriptions_user_id ON user_tier_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tier_subscriptions_tier_id ON user_tier_subscriptions(tier_id);
CREATE INDEX IF NOT EXISTS idx_tiers_slug ON tiers(slug);
