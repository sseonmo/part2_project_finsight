import { NextResponse } from "next/server";

import { getSessionContext } from "@/lib/session";
import { createServerClient } from "@/services/supabase";
import { createServiceRoleClient } from "@/services/supabase-service-role";

const UPLOAD_BUCKET = "transaction-csv-uploads";
const LIST_PAGE_SIZE = 100;

// 화면에 그대로 노출되는 재확인 문구다. src/components/AccountSettings.tsx 와 같은 값을 쓴다.
const DELETE_CONFIRMATION_PHRASE = "계정 삭제";

type StorageEntry = { id: string | null; name: string };

type StorageBucket = {
  list: (
    prefix: string,
    options: { limit: number; offset: number },
  ) => Promise<{ data: StorageEntry[] | null; error: unknown }>;
};

class StorageListError extends Error {}

function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

async function parseJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function isConfirmed(body: unknown): boolean {
  return (
    Boolean(body) &&
    typeof body === "object" &&
    (body as { confirmation?: unknown }).confirmation ===
      DELETE_CONFIRMATION_PHRASE
  );
}

// {user_id}/ 아래를 전부 훑는다. DB row 없이 남은 고아 객체도 여기서 잡힌다.
async function listKeysUnder(
  bucket: StorageBucket,
  prefix: string,
): Promise<string[]> {
  const keys: string[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await bucket.list(prefix, {
      limit: LIST_PAGE_SIZE,
      offset,
    });

    if (error) {
      throw new StorageListError();
    }

    const entries = data ?? [];

    for (const entry of entries) {
      const path = `${prefix}/${entry.name}`;

      if (entry.id === null) {
        keys.push(...(await listKeysUnder(bucket, path)));
      } else {
        keys.push(path);
      }
    }

    if (entries.length < LIST_PAGE_SIZE) {
      return keys;
    }

    offset += LIST_PAGE_SIZE;
  }
}

export async function DELETE(request: Request) {
  // entitlement 게이트를 걸지 않는다. expired 사용자도 자기 계정을 지울 수 있어야 한다.
  const session = await getSessionContext();

  if (!session) {
    return jsonError("로그인이 필요합니다.", 401);
  }

  // 대상은 언제나 세션 사용자다. 요청 본문의 userId 는 읽지 않는다.
  const userId = session.userId;

  if (!isConfirmed(await parseJsonBody(request))) {
    return jsonError(
      `삭제하려면 "${DELETE_CONFIRMATION_PHRASE}" 를 정확히 입력해 주세요.`,
      400,
    );
  }

  const service = createServiceRoleClient();
  const bucket = service.storage.from(UPLOAD_BUCKET);

  const { data: jobs, error: jobsError } = await service
    .from("upload_jobs")
    .select("storage_key")
    .eq("user_id", userId);

  if (jobsError) {
    return jsonError("업로드 목록을 읽지 못했습니다.", 500);
  }

  let storageKeys: string[];

  try {
    storageKeys = [
      ...new Set([
        ...(jobs ?? []).map((job) => job.storage_key),
        ...(await listKeysUnder(bucket, userId)),
      ]),
    ];
  } catch (error) {
    if (error instanceof StorageListError) {
      return jsonError("원본 파일 목록을 읽지 못했습니다.", 500);
    }

    throw error;
  }

  // 원본 CSV 를 먼저 지운다. DB 를 먼저 지우면 storage_key 를 잃고 파일이 영구히 남는다 (ADR-009).
  if (storageKeys.length > 0) {
    const { error: removeError } = await bucket.remove(storageKeys);

    if (removeError) {
      return jsonError("원본 파일을 삭제하지 못했습니다.", 500);
    }
  }

  // 전 사용자 테이블이 auth.users(id) 에 on delete cascade 로 걸려 있다.
  // 테이블마다 delete 를 나열하면 새 테이블이 늘 때 빠뜨린다.
  const { error: deleteUserError } = await service.auth.admin.deleteUser(userId);

  if (deleteUserError) {
    return jsonError("계정을 삭제하지 못했습니다.", 500);
  }

  const supabase = await createServerClient();

  await supabase.auth.signOut();

  return NextResponse.json({ redirectTo: "/" });
}
