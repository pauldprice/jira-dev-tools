WITH tops AS (
    SELECT 
        COUNT(*) AS ct, 
        funeral_home_id 
    FROM funeral_home_task AS fht
    WHERE fht.deleted_time IS NULL 
    GROUP BY fht.funeral_home_id 
    ORDER BY COUNT(*) DESC 
    LIMIT 10
)
SELECT 
    tops.*, 
    fh.name, 
    fh.onboarding_status
FROM tops
JOIN funeral_home AS fh ON fh.id = tops.funeral_home_id
ORDER BY tops.ct DESC;