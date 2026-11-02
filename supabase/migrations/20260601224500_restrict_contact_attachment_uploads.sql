begin;

drop policy if exists "public_upload_contact_attachments" on storage.objects;

create policy "public_upload_contact_attachments"
on storage.objects
for insert
to anon, authenticated
with check (
  bucket_id = 'contact-attachments'
  and name like 'contact-attachments/contact-%'
);

commit;
