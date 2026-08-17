import type { ComponentPropsWithoutRef } from "react";

const VARIANT_CLASSES = {
  neutral: "finsight-badge--neutral",
  yellow: "finsight-badge--yellow",
  teal: "finsight-badge--teal",
  success: "finsight-badge--success",
} as const;

export type BadgeVariant = keyof typeof VARIANT_CLASSES;

type BadgeProps = ComponentPropsWithoutRef<"span"> & {
  variant?: BadgeVariant;
};

export function Badge({
  className,
  variant = "neutral",
  ...props
}: BadgeProps) {
  const classes = ["finsight-badge", VARIANT_CLASSES[variant], className]
    .filter(Boolean)
    .join(" ");

  return <span className={classes} {...props} />;
}
