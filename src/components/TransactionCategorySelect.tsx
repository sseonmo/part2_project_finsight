"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/Badge";
import { CATEGORIES, CATEGORY_TOKENS, type Category } from "@/lib/categories";

type TransactionCategorySelectProps = {
  category: Category;
  disabled: boolean;
  merchantNormalized: string;
};

export function TransactionCategorySelect({
  category,
  disabled,
  merchantNormalized,
}: TransactionCategorySelectProps) {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState(category);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setSelectedCategory(category);
  }, [category]);

  function saveCategory(nextCategory: Category) {
    setSelectedCategory(nextCategory);
    setSaved(false);
    setErrorMessage(null);

    startTransition(async () => {
      const response = await fetch("/api/transactions/category", {
        body: JSON.stringify({
          merchantNormalized,
          category: nextCategory,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        setSelectedCategory(category);
        setErrorMessage("저장하지 못했습니다.");
        return;
      }

      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="transaction-category-control">
      <span
        aria-hidden
        className="transaction-category-control__dot"
        style={{ background: `var(${CATEGORY_TOKENS[selectedCategory]})` }}
      />
      <select
        aria-label={`${merchantNormalized} 카테고리`}
        className="transaction-category-control__select"
        disabled={disabled || isPending}
        onChange={(event) => saveCategory(event.target.value as Category)}
        value={selectedCategory}
      >
        {CATEGORIES.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
      {saved ? <Badge variant="success">저장 완료</Badge> : null}
      {errorMessage ? (
        <span className="transaction-category-control__error">
          {errorMessage}
        </span>
      ) : null}
    </div>
  );
}
