-- Monthly summary report
-- Variables: year, month

WITH monthly_stats AS (
    SELECT 
        COUNT(DISTINCT user_id) as total_users,
        COUNT(DISTINCT session_id) as total_sessions,
        COUNT(*) as total_events,
        AVG(session_duration_seconds) as avg_session_duration
    FROM 
        user_sessions
    WHERE 
        EXTRACT(YEAR FROM created_at) = ${year}
        AND EXTRACT(MONTH FROM created_at) = ${month}
)
SELECT 
    ${year} as year,
    ${month} as month,
    total_users,
    total_sessions,
    total_events,
    ROUND(avg_session_duration::numeric / 60, 2) as avg_session_minutes,
    ROUND(total_events::numeric / NULLIF(total_users, 0), 2) as events_per_user,
    ROUND(total_sessions::numeric / NULLIF(total_users, 0), 2) as sessions_per_user
FROM 
    monthly_stats;