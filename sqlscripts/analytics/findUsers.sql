SELECT *
FROM user_profile
WHERE deleted_time IS NULL
AND email ILIKE CONCAT('%', ${email}, '%')
;
