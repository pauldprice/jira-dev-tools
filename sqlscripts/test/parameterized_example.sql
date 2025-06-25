-- Example script demonstrating parameterized queries with typed variables
-- Variables: user_id:int, email:text, is_active:boolean, created_after:date

SELECT 
    id,
    email,
    created_at,
    is_active
FROM 
    users
WHERE 
    (${user_id:int} IS NULL OR id = ${user_id:int})
    AND (${email:text} IS NULL OR email = ${email:text})
    AND is_active = ${is_active:boolean}
    AND created_at >= ${created_after:date}
ORDER BY 
    created_at DESC
LIMIT 10;