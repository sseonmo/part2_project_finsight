// storage_key 는 upload_jobs 행에 들어 있는 사용자 입력이다. RLS 는 행의
// user_id 만 보고 컬럼 값을 가리지 않으므로, 로그인한 사용자가 PostgREST 로
// 남의 storage_key 를 담은 행을 직접 INSERT 할 수 있다. service role 은 Storage
// RLS 를 우회하니 그 값을 그대로 쓰면 남의 원본 CSV 를 읽거나 지우게 된다.
// 키를 만드는 곳은 /api/uploads/signed-url 하나뿐이고 형식은 `${userId}/...` 다.
export function isOwnedStorageKey(storageKey: string, userId: string): boolean {
  const [owner, ...rest] = storageKey.split("/");

  return rest.length > 0 && owner === userId;
}
