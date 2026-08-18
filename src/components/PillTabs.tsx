type PillTabOption<Value extends string> = {
  label: string;
  value: Value;
};

type PillTabsProps<Value extends string> = {
  ariaLabel: string;
  onValueChange: (value: Value) => void;
  options: readonly PillTabOption<Value>[];
  value: Value;
};

export function PillTabs<Value extends string>({
  ariaLabel,
  onValueChange,
  options,
  value,
}: PillTabsProps<Value>) {
  return (
    <div aria-label={ariaLabel} className="pill-tabs" role="tablist">
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <button
            aria-selected={selected}
            className={[
              "pill-tabs__tab",
              selected ? "pill-tabs__tab--active" : null,
            ]
              .filter(Boolean)
              .join(" ")}
            key={option.value}
            onClick={() => onValueChange(option.value)}
            role="tab"
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
