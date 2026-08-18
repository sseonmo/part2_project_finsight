import Link from "next/link";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { Badge } from "@/components/Badge";
import { TransactionCategorySelect } from "@/components/TransactionCategorySelect";
import { CATEGORIES, CATEGORY_TOKENS, type Category } from "@/lib/categories";
import { getSessionContext } from "@/lib/session";
import {
  fetchTransactionsPage,
  fetchTransactionsSummary,
  type TransactionListRow,
  type TransactionListSummary,
} from "@/lib/transactions/queries";
import { createServerClient } from "@/services/supabase";
import type { Database } from "@/types/database";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
const CATEGORY_SET = new Set<string>(CATEGORIES);

type TransactionsPageProps = {
  searchParams?: Promise<{
    category?: string | string[];
    month?: string | string[];
    page?: string | string[];
    q?: string | string[];
  }>;
};

type TransactionMonthOption = {
  period: string;
  transactionCount: number;
  yearMonth: string;
};

type SearchState = {
  categories: Category[];
  month: string | null;
  page: number;
  query: string | null;
};

const TYPE_LABELS: Record<TransactionListRow["transactionType"], string> = {
  expense: "지출",
  refund: "환불",
  deposit: "입금",
};

const TYPE_BADGE_VARIANTS: Record<
  TransactionListRow["transactionType"],
  "neutral" | "teal" | "yellow"
> = {
  expense: "neutral",
  refund: "yellow",
  deposit: "teal",
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function allParams(value: string | string[] | undefined): string[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function toYearMonth(period: string): string {
  return period.slice(0, 7);
}

function toPeriod(yearMonth: string): string {
  return `${yearMonth}-01`;
}

function normalizeYearMonth(value: string | string[] | undefined): string | null {
  const month = firstParam(value);

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return null;
  }

  const monthNumber = Number(month.slice(5, 7));

  return monthNumber >= 1 && monthNumber <= 12 ? month : null;
}

function normalizeSearch(value: string | string[] | undefined): string | null {
  const query = firstParam(value)?.trim();

  return query ? query : null;
}

function normalizePage(value: string | string[] | undefined): number {
  const page = Number(firstParam(value));

  return Number.isInteger(page) && page > 0 ? page : 1;
}

function normalizeCategories(value: string | string[] | undefined): Category[] {
  const selected = new Set<Category>();

  for (const category of allParams(value)) {
    if (CATEGORY_SET.has(category)) {
      selected.add(category as Category);
    }
  }

  return CATEGORIES.filter((category) => selected.has(category));
}

function formatCurrency(value: number): string {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function formatDate(value: string): string {
  return value.replaceAll("-", ".");
}

function createTransactionsHref(
  state: SearchState,
  overrides: Partial<SearchState>,
): string {
  const next = { ...state, ...overrides };
  const params = new URLSearchParams();

  if (next.month) {
    params.set("month", next.month);
  }

  if (next.query) {
    params.set("q", next.query);
  }

  for (const category of next.categories) {
    params.append("category", category);
  }

  if (next.page > 1) {
    params.set("page", String(next.page));
  }

  const queryString = params.toString();

  return `/dashboard/transactions${queryString ? `?${queryString}` : ""}`;
}

async function getTransactionMonths(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<TransactionMonthOption[]> {
  const { data } = await supabase.rpc("get_transaction_months", {
    p_user_id: userId,
  });

  return (data ?? []).map((row) => ({
    period: row.period,
    transactionCount: Number(row.transaction_count),
    yearMonth: toYearMonth(row.period),
  }));
}

async function getAvailableCategories(input: {
  period: string;
  query: string | null;
  selectedCategories: Category[];
  supabase: SupabaseClient<Database>;
  userId: string;
}): Promise<Category[]> {
  const selected = new Set(input.selectedCategories);
  const summaries = await Promise.all(
    CATEGORIES.map(async (category) => ({
      category,
      summary: await fetchTransactionsSummary(input.supabase, {
        userId: input.userId,
        period: input.period,
        search: input.query,
        categories: [category],
      }),
    })),
  );

  return summaries
    .filter(
      (item) =>
        item.summary.transactionCount > 0 || selected.has(item.category),
    )
    .map((item) => item.category);
}

function SummaryStrip({ summary }: { summary: TransactionListSummary }) {
  return (
    <section className="transactions-summary" aria-label="거래 요약">
      <div className="transactions-summary__item">
        <span className="transactions-summary__label">거래</span>
        <span className="transactions-summary__value tabular-nums">
          {summary.transactionCount.toLocaleString("ko-KR")}건
        </span>
      </div>
      <div className="transactions-summary__item">
        <span className="transactions-summary__label">지출</span>
        <span className="transactions-summary__value tabular-nums">
          {formatCurrency(summary.expenseTotal)}
        </span>
      </div>
      <div className="transactions-summary__item">
        <span className="transactions-summary__label">환불</span>
        <span className="transactions-summary__value tabular-nums">
          {formatCurrency(summary.refundTotal)}
        </span>
      </div>
      <div className="transactions-summary__item">
        <span className="transactions-summary__label">입금</span>
        <span className="transactions-summary__value tabular-nums">
          {formatCurrency(summary.depositTotal)}
        </span>
      </div>
    </section>
  );
}

function MonthTabs({
  months,
  state,
}: {
  months: TransactionMonthOption[];
  state: SearchState;
}) {
  return (
    <nav aria-label="거래 월 선택" className="transactions-month-tabs">
      {months.map((month) => {
        const isCurrent = state.month === month.yearMonth;

        return (
          <Link
            aria-current={isCurrent ? "page" : undefined}
            className={[
              "transactions-month-tabs__item",
              isCurrent ? "transactions-month-tabs__item--active" : null,
            ]
              .filter(Boolean)
              .join(" ")}
            href={createTransactionsHref(state, {
              month: month.yearMonth,
              page: 1,
            })}
            key={month.period}
            title={`${month.transactionCount.toLocaleString("ko-KR")}건`}
          >
            {month.yearMonth}
          </Link>
        );
      })}
    </nav>
  );
}

function SearchForm({ state }: { state: SearchState }) {
  return (
    <form action="/dashboard/transactions" className="transactions-search">
      {state.month ? <input name="month" type="hidden" value={state.month} /> : null}
      {state.categories.map((category) => (
        <input key={category} name="category" type="hidden" value={category} />
      ))}
      <input
        className="transactions-search__input"
        defaultValue={state.query ?? ""}
        name="q"
        placeholder="가맹점 검색"
        type="search"
      />
      <button
        className="finsight-button finsight-button--secondary finsight-button--md"
        type="submit"
      >
        검색
      </button>
      {state.query ? (
        <Link
          className="finsight-button finsight-button--ghost finsight-button--md"
          href={createTransactionsHref(state, { page: 1, query: null })}
        >
          초기화
        </Link>
      ) : null}
    </form>
  );
}

function CategoryFilters({
  availableCategories,
  state,
}: {
  availableCategories: Category[];
  state: SearchState;
}) {
  if (availableCategories.length === 0) {
    return null;
  }

  const selected = new Set(state.categories);

  return (
    <nav aria-label="카테고리 필터" className="transactions-category-filters">
      {availableCategories.map((category) => {
        const isSelected = selected.has(category);
        const nextCategories = isSelected
          ? state.categories.filter((item) => item !== category)
          : [...state.categories, category];

        return (
          <Link
            aria-current={isSelected ? "true" : undefined}
            className={[
              "transactions-category-chip",
              isSelected ? "transactions-category-chip--active" : null,
            ]
              .filter(Boolean)
              .join(" ")}
            href={createTransactionsHref(state, {
              categories: nextCategories,
              page: 1,
            })}
            key={category}
          >
            <span
              aria-hidden
              className="transactions-category-chip__dot"
              style={{ background: `var(${CATEGORY_TOKENS[category]})` }}
            />
            <span>{category}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function TransactionsTable({
  canWrite,
  rows,
}: {
  canWrite: boolean;
  rows: TransactionListRow[];
}) {
  if (rows.length === 0) {
    return (
      <p className="transactions-empty">
        조건에 맞는 거래가 없습니다.
      </p>
    );
  }

  return (
    <div className="transactions-table-wrap">
      <table className="transactions-table">
        <thead>
          <tr>
            <th className="transactions-table__date">날짜</th>
            <th>가맹점</th>
            <th>카테고리</th>
            <th className="transactions-table__amount">금액</th>
            <th>상태</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="transactions-table__date tabular-nums">
                {formatDate(row.transactedOn)}
              </td>
              <td>
                <div className="transactions-merchant">
                  <span className="transactions-merchant__raw">
                    {row.merchantRaw}
                  </span>
                  {row.merchantRaw !== row.merchantNormalized ? (
                    <span className="transactions-merchant__normalized">
                      {row.merchantNormalized}
                    </span>
                  ) : null}
                </div>
              </td>
              <td>
                <TransactionCategorySelect
                  category={row.category}
                  disabled={!canWrite}
                  merchantNormalized={row.merchantNormalized}
                />
              </td>
              <td className="transactions-table__amount tabular-nums">
                {formatCurrency(row.amount)}
              </td>
              <td>
                <Badge variant={TYPE_BADGE_VARIANTS[row.transactionType]}>
                  {TYPE_LABELS[row.transactionType]}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Pagination({
  currentPage,
  state,
  totalPages,
}: {
  currentPage: number;
  state: SearchState;
  totalPages: number;
}) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <nav aria-label="거래 페이지" className="transactions-pagination">
      <Link
        aria-disabled={currentPage <= 1 ? "true" : undefined}
        className="finsight-button finsight-button--secondary finsight-button--sm"
        href={
          currentPage <= 1
            ? createTransactionsHref(state, { page: 1 })
            : createTransactionsHref(state, { page: currentPage - 1 })
        }
      >
        이전
      </Link>
      <span className="transactions-pagination__count tabular-nums">
        {currentPage.toLocaleString("ko-KR")} /{" "}
        {totalPages.toLocaleString("ko-KR")}
      </span>
      <Link
        aria-disabled={currentPage >= totalPages ? "true" : undefined}
        className="finsight-button finsight-button--secondary finsight-button--sm"
        href={
          currentPage >= totalPages
            ? createTransactionsHref(state, { page: totalPages })
            : createTransactionsHref(state, { page: currentPage + 1 })
        }
      >
        다음
      </Link>
    </nav>
  );
}

export default async function TransactionsPage({
  searchParams,
}: TransactionsPageProps) {
  const session = await getSessionContext();

  if (!session) {
    redirect("/");
  }

  const supabase = await createServerClient();
  const resolvedSearchParams = await searchParams;
  const months = await getTransactionMonths(supabase, session.userId);
  const selectedYearMonth =
    normalizeYearMonth(resolvedSearchParams?.month) ??
    months[0]?.yearMonth ??
    null;

  if (!selectedYearMonth || months.length === 0) {
    return (
      <div className="transactions-page">
        <section className="dashboard-panel">
          <h2 className="dashboard-section-title">아직 거래가 없습니다</h2>
          <p className="dashboard-panel__subtitle">
            명세서를 올리면 이 화면에서 검색과 분류 수정을 할 수 있습니다.
          </p>
        </section>
      </div>
    );
  }

  const period = toPeriod(selectedYearMonth);
  const selectedCategories = normalizeCategories(resolvedSearchParams?.category);
  const query = normalizeSearch(resolvedSearchParams?.q);
  const requestedPage = normalizePage(resolvedSearchParams?.page);
  const summary = await fetchTransactionsSummary(supabase, {
    userId: session.userId,
    period,
    search: query,
    categories: selectedCategories,
  });
  const totalPages = Math.max(
    1,
    Math.ceil(summary.transactionCount / PAGE_SIZE),
  );
  const currentPage = Math.min(requestedPage, totalPages);
  const state: SearchState = {
    categories: selectedCategories,
    month: selectedYearMonth,
    page: currentPage,
    query,
  };
  const [rows, availableCategories] = await Promise.all([
    fetchTransactionsPage(supabase, {
      userId: session.userId,
      period,
      search: query,
      categories: selectedCategories,
      limit: PAGE_SIZE,
      offset: (currentPage - 1) * PAGE_SIZE,
    }),
    getAvailableCategories({
      period,
      query,
      selectedCategories,
      supabase,
      userId: session.userId,
    }),
  ]);

  return (
    <div className="transactions-page">
      <MonthTabs months={months} state={state} />
      <section className="transactions-panel">
        <div className="transactions-panel__header">
          <div>
            <h2 className="dashboard-section-title">거래 목록</h2>
            <p className="dashboard-panel__subtitle">
              분류를 고치면 대시보드가 다시 계산됩니다
            </p>
          </div>
          {!session.entitlement.canWrite ? (
            <Badge variant="yellow">읽기 전용</Badge>
          ) : null}
        </div>

        <SearchForm state={state} />
        <CategoryFilters
          availableCategories={availableCategories}
          state={state}
        />
        <SummaryStrip summary={summary} />
        <TransactionsTable
          canWrite={session.entitlement.canWrite}
          rows={rows}
        />
        <Pagination
          currentPage={currentPage}
          state={state}
          totalPages={totalPages}
        />
      </section>
    </div>
  );
}
