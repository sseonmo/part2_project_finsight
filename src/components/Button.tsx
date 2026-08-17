import type { ComponentPropsWithoutRef } from "react";

const VARIANT_CLASSES = {
  primary: "finsight-button--primary",
  secondary: "finsight-button--secondary",
  ghost: "finsight-button--ghost",
  yellow: "finsight-button--yellow",
  danger: "finsight-button--danger",
} as const;

const SIZE_CLASSES = {
  sm: "finsight-button--sm",
  md: "finsight-button--md",
  lg: "finsight-button--lg",
} as const;

export type ButtonVariant = keyof typeof VARIANT_CLASSES;
export type ButtonSize = keyof typeof SIZE_CLASSES;

type ButtonProps = ComponentPropsWithoutRef<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({
  className,
  size = "md",
  type = "button",
  variant = "primary",
  ...props
}: ButtonProps) {
  const classes = [
    "finsight-button",
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <button className={classes} type={type} {...props} />;
}
