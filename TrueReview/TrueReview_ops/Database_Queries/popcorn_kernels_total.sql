SELECT 
    (COUNT(*) + (COUNT(review) * 5)) AS total_score
FROM 
    watched_list
WHERE 
    user_id = 1;