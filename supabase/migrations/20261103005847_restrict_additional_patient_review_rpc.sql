REVOKE ALL ON FUNCTION public.review_home_visit_additional_patient(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_home_visit_additional_patient(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.review_home_visit_additional_patient(uuid, text, text) TO authenticated;