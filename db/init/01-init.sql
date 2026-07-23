INSERT INTO admins (username, password_hash)
VALUES ('admin', crypt('changeme123', gen_salt('bf')))
ON CONFLICT (username) DO NOTHING;
