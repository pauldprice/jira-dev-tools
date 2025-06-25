-- Show table sizes in the current database
-- No variables needed

SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
    pg_total_relation_size(schemaname||'.'||tablename) AS size_bytes
FROM 
    pg_tables
WHERE 
    schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY 
    pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 20;