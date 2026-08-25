-- 서명 URL 발급 라우트(src/app/api/uploads/signed-url/route.ts)가 검사하는
-- size·contentType 은 클라이언트가 보낸 자기신고 값이다. 원본 파일은 Next 서버를
-- 거치지 않고 Storage 로 직행하므로(ARCHITECTURE 업로드 파이프라인 3단계),
-- 실제로 상한을 강제하는 곳은 버킷뿐이다.
--
-- 값은 라우트의 MAX_UPLOAD_BYTES(10MB)·ALLOWED_CONTENT_TYPES 와 일치시킨다.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'transaction-csv-uploads',
  'transaction-csv-uploads',
  false,
  10485760,
  array[
    'text/csv',
    'application/csv',
    'text/plain',
    'application/vnd.ms-excel'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
