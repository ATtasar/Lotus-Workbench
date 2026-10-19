\getenv app_password APP_DB_PASSWORD
SELECT format('CREATE ROLE creator_app LOGIN PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='creator_app')
\gexec
SELECT 'CREATE DATABASE creator_studio OWNER creator_app'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname='creator_studio')
\gexec
