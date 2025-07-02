SELECT
  name AS "Subscriber Name",
  email AS "Subscriber Email",
  created_time AS "Subscriber Created Time"
FROM obit_subscription
WHERE website_id = ${websiteId:int}
  AND opt_in_time IS NOT NULL
  AND opt_out_time IS NULL
;
