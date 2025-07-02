-- Find recent and upcoming events at locations with zip code 44129 
SELECT 
    CONCAT('https://my.gather.app/remember/', gc.name) AS url,
    e.id AS event_id,
    e.name AS event_name,
    e.description AS event_description,
    TO_CHAR(e.start_time AT TIME ZONE COALESCE(a.timezone, fh_a.timezone, 'US/Mountain'), 'MM/DD/YYYY hh:mi AM') || ' ' || 
        SPLIT_PART(COALESCE(a.timezone, fh_a.timezone, 'US/Mountain'), '/', -1) AS start_time_local,
    TO_CHAR(e.end_time AT TIME ZONE COALESCE(a.timezone, fh_a.timezone, 'US/Mountain'), 'MM/DD/YYYY hh:mi AM') || ' ' || 
        SPLIT_PART(COALESCE(a.timezone, fh_a.timezone, 'US/Mountain'), '/', -1) AS end_time_local,
    e.event_type,
    l.name AS location_name,
    a.address1,
    a.city,
    a.state,
    a.postal_code,
    a.timezone,
    gc.id AS gather_case_id,
    fhc.case_number,
    fhc.case_number AS funeral_home_case_number
FROM public.event e
JOIN public.location l ON e.location_id = l.id
JOIN public.address a ON l.address_id = a.id
JOIN public.gather_case gc ON e.gather_case_id = gc.id
JOIN public.funeral_home fh ON gc.funeral_home_id = fh.id
JOIN public.address fh_a ON fh.address_id = fh_a.id
LEFT JOIN public.funeral_home_case fhc ON gc.id = fhc.gather_case_id
WHERE 
    a.postal_code = ${zipCode}
    AND e.start_time >= NOW() - INTERVAL '1 day' -- Events from 1 day ago to future
    AND e.deleted_time IS NULL -- Not deleted
    AND e.is_private = FALSE-- Public events
ORDER BY e.start_time ASC
LIMIT 100;
