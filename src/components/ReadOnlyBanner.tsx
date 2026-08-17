import Link from "next/link";

import { Badge } from "@/components/Badge";

export function ReadOnlyBanner() {
  return (
    <div className="app-banner app-banner--readonly">
      <div className="app-banner__content">
        <Badge variant="yellow">읽기 전용</Badge>
        <p className="app-banner__text">
          체험 또는 결제 기간이 끝나 새 업로드와 수정은 잠겨 있습니다. 기존
          데이터는 계속 볼 수 있습니다.
        </p>
      </div>
      <Link className="app-banner__link" href="/dashboard/billing">
        요금제 보기
      </Link>
    </div>
  );
}
