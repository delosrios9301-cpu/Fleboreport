-- Solo cambia el límite de tamaño de la carpeta privada de Domicilios.
-- Supabase Free permite un máximo individual de 50 MB; la cuota global
-- del proyecto puede imponer un límite igual o inferior.
-- No modifica reglas RLS, bucket público ni los tipos MIME admitidos.
UPDATE storage.buckets
SET file_size_limit = 52428800
WHERE id = 'home-visit-documents'
  AND (file_size_limit IS NULL OR file_size_limit < 52428800);
