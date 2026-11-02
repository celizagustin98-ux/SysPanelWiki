-- Instructivos: texto extraído del PDF para poder buscar dentro del documento (idempotente).
alter table wiki_docs add column if not exists texto_pdf text;
alter table wiki_docs add column if not exists texto_pdf_de uuid;
