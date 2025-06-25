-- Get a summary of the above orders grouped by week of month
SELECT
    TO_CHAR(DATE_TRUNC('week', fs.order_time), 'MONTH-DD') AS "Week of Month",
    COUNT(*) AS "Total Orders",
    CONCAT('$', TO_CHAR(SUM(fs.order_total / 100.0), 'FM999,999,990.00')) AS "Total Amount",
    CONCAT('$', TO_CHAR(SUM(fs.order_total / 100.0) * 0.20, 'FM999,999,990.00')) AS "Net Amount",
    COUNT(DISTINCT fs.gather_case_id) AS "Total Gather Cases"
FROM flower_sale fs
WHERE fs.vendor IN  ('floristone', 'teleflora')
    --AND fs.order_time > '2025-04-30 21:37:33.873571+00'
    AND fs.order_time > '2025-02-28 23:59:59.999999+00'
GROUP BY DATE_TRUNC('week', fs.order_time)
ORDER BY DATE_TRUNC('week', fs.order_time)
;

