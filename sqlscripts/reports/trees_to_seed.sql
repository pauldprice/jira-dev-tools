SELECT fs.vendor_product_code AS "Project Code",
    COUNT(DISTINCT fs.gather_case_id) AS "Total Orders Seeded",
    SUM(fs.quantity) AS "Total Trees Sold",
    MIN(fs.order_time) AS "First Order Date",
    MAX(fs.order_time) AS "Last Order Date"
FROM flower_sale AS fs
JOIN gather_case AS gc
    ON gc.id = fs.gather_case_id
JOIN funeral_home AS fh
    ON fh.id = gc.funeral_home_id
WHERE fs.sale_type = 'tree'
    AND fs.order_total = 0
    AND fs.order_response->>'bulkPurchaseTime' IS NULL
    AND fs.order_response ? 'bulkPurchaseTime'
    AND fs.order_response->>'arborDayOrderStatus' = 'success'
GROUP BY fs.vendor_product_code
;

