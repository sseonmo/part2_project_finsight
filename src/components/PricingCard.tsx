import { Button } from "@/components/Button";

export type PricingCardVariant = "standard" | "featured";

type PricingCardProps = {
  amount: string;
  ctaDisabled?: boolean;
  ctaLabel: string;
  features: readonly string[];
  name: string;
  onCtaClick: () => void;
  period: string;
  selected?: boolean;
  variant: PricingCardVariant;
};

export function PricingCard({
  amount,
  ctaDisabled = false,
  ctaLabel,
  features,
  name,
  onCtaClick,
  period,
  selected = false,
  variant,
}: PricingCardProps) {
  return (
    <article
      aria-label={`${name} 요금제`}
      className={`pricing-card pricing-card--${variant}`}
      data-selected={selected ? "true" : "false"}
    >
      <div className="pricing-card__header">
        <div>
          <h2 className="pricing-card__name">{name}</h2>
          <p className="pricing-card__price">
            <span className="pricing-card__amount tabular-nums">{amount}</span>
            <span className="pricing-card__period">/ {period}</span>
          </p>
        </div>
        {variant === "featured" ? (
          <span className="pricing-card__marker">추천</span>
        ) : null}
      </div>

      <ul className="pricing-card__features">
        {features.map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>

      <Button
        className="pricing-card__cta"
        disabled={ctaDisabled}
        onClick={onCtaClick}
        size="lg"
        type="button"
        variant={variant === "featured" ? "primary" : "secondary"}
      >
        {ctaLabel}
      </Button>
    </article>
  );
}
