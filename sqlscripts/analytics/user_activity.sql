-- User activity report for a specific date range (Example - update table names for your schema)
-- Variables: start_date, end_date
-- Note: This is a template. Replace 'user_events' with your actual table name.

SELECT 
    DATE(created_at) as activity_date,
    COUNT(DISTINCT user_id) as unique_users,
    COUNT(*) as total_events,
    AVG(CASE WHEN event_type = 'page_view' THEN 1 ELSE 0 END) * 100 as page_view_pct,
    AVG(CASE WHEN event_type = 'action' THEN 1 ELSE 0 END) * 100 as action_pct
FROM 
    user_events  -- REPLACE WITH YOUR TABLE NAME
WHERE 
    created_at >= '${start_date}'::date
    AND created_at < '${end_date}'::date + INTERVAL '1 day'
GROUP BY 
    DATE(created_at)
ORDER BY 
    activity_date DESC;