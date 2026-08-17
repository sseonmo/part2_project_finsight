/* @ds-bundle: {"format":4,"namespace":"FinsightDesignSystem_1f7cfd","components":[{"name":"Button","sourcePath":"components/actions/Button.jsx"},{"name":"IconButton","sourcePath":"components/actions/IconButton.jsx"},{"name":"Badge","sourcePath":"components/feedback/Badge.jsx"},{"name":"PromoBanner","sourcePath":"components/feedback/PromoBanner.jsx"},{"name":"FilterDropdown","sourcePath":"components/forms/FilterDropdown.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"SearchPill","sourcePath":"components/forms/SearchPill.jsx"},{"name":"CtaBanner","sourcePath":"components/marketing/CtaBanner.jsx"},{"name":"FaqAccordion","sourcePath":"components/marketing/FaqAccordion.jsx"},{"name":"HeroBand","sourcePath":"components/marketing/HeroBand.jsx"},{"name":"LogoWall","sourcePath":"components/marketing/LogoWall.jsx"},{"name":"ReviewBadge","sourcePath":"components/marketing/ReviewBadge.jsx"},{"name":"StoreBadge","sourcePath":"components/marketing/StoreBadge.jsx"},{"name":"BillingToggle","sourcePath":"components/navigation/BillingToggle.jsx"},{"name":"Footer","sourcePath":"components/navigation/Footer.jsx"},{"name":"PillTabs","sourcePath":"components/navigation/PillTabs.jsx"},{"name":"TopNav","sourcePath":"components/navigation/TopNav.jsx"},{"name":"ComparisonTable","sourcePath":"components/pricing/ComparisonTable.jsx"},{"name":"PricingCard","sourcePath":"components/pricing/PricingCard.jsx"},{"name":"Card","sourcePath":"components/surfaces/Card.jsx"},{"name":"FeatureCard","sourcePath":"components/surfaces/FeatureCard.jsx"},{"name":"IndustryTile","sourcePath":"components/surfaces/IndustryTile.jsx"},{"name":"ProductMockup","sourcePath":"components/surfaces/ProductMockup.jsx"},{"name":"StatCard","sourcePath":"components/surfaces/StatCard.jsx"},{"name":"StoryCard","sourcePath":"components/surfaces/StoryCard.jsx"},{"name":"TemplateCard","sourcePath":"components/surfaces/TemplateCard.jsx"}],"sourceHashes":{"components/actions/Button.jsx":"6c4527e1ef90","components/actions/IconButton.jsx":"322aacba0f7c","components/feedback/Badge.jsx":"37931e8173f8","components/feedback/PromoBanner.jsx":"d21f678999b1","components/forms/FilterDropdown.jsx":"2439f1817dc9","components/forms/Input.jsx":"0d567676805b","components/forms/SearchPill.jsx":"1a5e160b6236","components/marketing/CtaBanner.jsx":"74664e622938","components/marketing/FaqAccordion.jsx":"17020a8ec3b2","components/marketing/HeroBand.jsx":"877d23636394","components/marketing/LogoWall.jsx":"d3af15c107b9","components/marketing/ReviewBadge.jsx":"b95f59c79f23","components/marketing/StoreBadge.jsx":"9de70f32aa4c","components/navigation/BillingToggle.jsx":"0fefc9627af3","components/navigation/Footer.jsx":"be89fc77f952","components/navigation/PillTabs.jsx":"a0a00ea79e14","components/navigation/TopNav.jsx":"d4473ea3119e","components/pricing/ComparisonTable.jsx":"5f2961cd93c9","components/pricing/PricingCard.jsx":"e8a2315a6c4b","components/surfaces/Card.jsx":"46b33c955726","components/surfaces/FeatureCard.jsx":"6dde08464ff0","components/surfaces/IndustryTile.jsx":"f20c7228fe3d","components/surfaces/ProductMockup.jsx":"dd30af525d79","components/surfaces/StatCard.jsx":"aff601be64ee","components/surfaces/StoryCard.jsx":"b9ed3ecd24b8","components/surfaces/TemplateCard.jsx":"0b9acaef971d","ui_kits/marketing/Customers.jsx":"97a65780a932","ui_kits/marketing/Home.jsx":"bb9ecdb6cdbd","ui_kits/marketing/Pricing.jsx":"432024008c6d","ui_kits/marketing/Product.jsx":"a1f358ab3937","ui_kits/marketing/mocks.jsx":"887c359a41dc"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.FinsightDesignSystem_1f7cfd = window.FinsightDesignSystem_1f7cfd || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/actions/Button.jsx
try { (() => {
const VARIANTS = {
  primary: {
    background: 'var(--primary)',
    color: 'var(--on-primary)',
    border: '1px solid transparent'
  },
  yellow: {
    background: 'var(--brand-yellow)',
    color: 'var(--primary)',
    border: '1px solid transparent'
  },
  blue: {
    background: 'var(--brand-blue)',
    color: 'var(--on-primary)',
    border: '1px solid transparent'
  },
  secondary: {
    background: 'transparent',
    color: 'var(--ink)',
    border: '1px solid var(--hairline-strong)'
  },
  onDark: {
    background: 'var(--on-dark)',
    color: 'var(--primary)',
    border: '1px solid transparent'
  },
  ghost: {
    background: 'transparent',
    color: 'var(--ink)',
    border: '1px solid transparent',
    borderRadius: 'var(--radius-md)'
  },
  link: {
    background: 'transparent',
    color: 'var(--brand-blue)',
    border: '1px solid transparent',
    padding: 0
  }
};
const PADS = {
  sm: '8px 16px',
  md: '12px 24px',
  lg: '16px 28px'
};
function Button({
  variant = 'primary',
  size = 'md',
  disabled = false,
  fullWidth = false,
  iconLeft = null,
  iconRight = null,
  as = 'button',
  href,
  children,
  style,
  ...rest
}) {
  const v = VARIANTS[variant] || VARIANTS.primary;
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-xs)',
    font: 'var(--weight-medium) var(--fs-button)/var(--lh-button) var(--font-core)',
    padding: variant === 'link' ? 0 : variant === 'ghost' ? '8px 12px' : PADS[size],
    borderRadius: variant === 'ghost' ? 'var(--radius-md)' : 'var(--radius-full)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    width: fullWidth ? '100%' : 'auto',
    transition: 'background var(--motion-fast) var(--ease-standard),opacity var(--motion-fast) var(--ease-standard)',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    ...v,
    ...(disabled ? {
      background: 'var(--hairline)',
      color: 'var(--muted)',
      border: '1px solid transparent'
    } : null),
    ...style
  };
  const Tag = href ? 'a' : as;
  return React.createElement(Tag, {
    href,
    disabled: Tag === 'button' ? disabled : undefined,
    style: base,
    ...rest
  }, iconLeft, children, iconRight);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/actions/Button.jsx", error: String((e && e.message) || e) }); }

// components/actions/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function IconButton({
  children,
  size = 36,
  tone = 'default',
  'aria-label': label,
  style,
  ...rest
}) {
  const tones = {
    default: {
      background: 'var(--canvas)',
      color: 'var(--ink)',
      border: '1px solid var(--hairline)'
    },
    dark: {
      background: 'var(--primary)',
      color: 'var(--on-primary)',
      border: '1px solid transparent'
    },
    quiet: {
      background: 'transparent',
      color: 'var(--steel)',
      border: '1px solid transparent'
    }
  };
  return /*#__PURE__*/React.createElement("button", _extends({
    "aria-label": label,
    style: {
      width: size,
      height: size,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 'var(--radius-full)',
      cursor: 'pointer',
      padding: 0,
      ...tones[tone],
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/actions/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const TONES = {
  promo: {
    background: 'var(--brand-yellow)',
    color: 'var(--primary)'
  },
  yellow: {
    background: 'var(--surface-yellow)',
    color: 'var(--yellow-dark)'
  },
  purple: {
    background: 'var(--surface-pricing-featured)',
    color: 'var(--brand-blue)'
  },
  coral: {
    background: 'var(--coral-light)',
    color: 'var(--coral-dark)'
  },
  teal: {
    background: 'var(--teal-light)',
    color: 'var(--moss-dark)'
  },
  success: {
    background: 'var(--success-accent)',
    color: 'var(--on-primary)'
  },
  neutral: {
    background: 'var(--surface)',
    color: 'var(--slate)'
  },
  discount: {
    background: 'var(--brand-yellow)',
    color: 'var(--primary)'
  }
};
function Badge({
  tone = 'promo',
  shape,
  children,
  style,
  ...rest
}) {
  const t = TONES[tone] || TONES.promo;
  const isDiscount = shape === 'rect' || tone === 'discount';
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 'var(--space-xxs)',
      font: 'var(--weight-semibold) var(--fs-caption)/var(--lh-caption) var(--font-core)',
      borderRadius: isDiscount ? 'var(--radius-sm)' : 'var(--radius-full)',
      padding: isDiscount ? '2px 6px' : '4px 10px',
      ...t,
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Badge.jsx", error: String((e && e.message) || e) }); }

// components/feedback/PromoBanner.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function PromoBanner({
  children,
  pillLabel = 'GET YOUR SPOT',
  onPill,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      background: 'var(--primary)',
      color: 'var(--on-dark)',
      padding: 'var(--space-sm) var(--space-md)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 'var(--space-sm)',
      font: 'var(--weight-medium) var(--fs-body-sm)/1.4 var(--font-core)',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", null, children), pillLabel ? /*#__PURE__*/React.createElement("button", {
    onClick: onPill,
    style: {
      background: 'var(--brand-yellow)',
      color: 'var(--primary)',
      border: 'none',
      borderRadius: 'var(--radius-full)',
      padding: '4px 10px',
      font: 'var(--weight-semibold) var(--fs-caption)/var(--lh-caption) var(--font-core)',
      cursor: 'pointer'
    }
  }, pillLabel) : null);
}
Object.assign(__ds_scope, { PromoBanner });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/PromoBanner.jsx", error: String((e && e.message) || e) }); }

// components/forms/FilterDropdown.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function FilterDropdown({
  label,
  value,
  options = [],
  onSelect,
  chevron = null,
  style,
  ...rest
}) {
  const [open, setOpen] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      position: 'relative',
      display: 'inline-block',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("button", {
    onClick: () => setOpen(!open),
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 'var(--space-xs)',
      minHeight: 36,
      padding: 'var(--space-xs) var(--space-md)',
      background: 'var(--canvas)',
      color: 'var(--ink)',
      border: '1px solid var(--hairline-strong)',
      borderRadius: 'var(--radius-full)',
      font: 'var(--weight-medium) var(--fs-body-sm)/var(--lh-body) var(--font-core)',
      cursor: 'pointer'
    }
  }, value || label, chevron), open && options.length ? /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 'calc(100% + 8px)',
      left: 0,
      minWidth: 200,
      background: 'var(--canvas)',
      border: '1px solid var(--hairline)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-4)',
      padding: 'var(--space-xs)',
      zIndex: 20
    }
  }, options.map(o => /*#__PURE__*/React.createElement("button", {
    key: o,
    onClick: () => {
      onSelect && onSelect(o);
      setOpen(false);
    },
    style: {
      display: 'block',
      width: '100%',
      textAlign: 'left',
      padding: 'var(--space-xs) var(--space-sm)',
      border: 'none',
      background: 'transparent',
      borderRadius: 'var(--radius-md)',
      color: 'var(--charcoal)',
      font: 'var(--weight-regular) var(--fs-body-sm)/var(--lh-body) var(--font-core)',
      cursor: 'pointer'
    }
  }, o))) : null);
}
Object.assign(__ds_scope, { FilterDropdown });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/FilterDropdown.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Input({
  label,
  hint,
  error,
  focused = false,
  style,
  ...rest
}) {
  const [isFocus, setFocus] = React.useState(false);
  const active = focused || isFocus;
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-xxs)',
      ...style
    }
  }, label ? /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--weight-medium) var(--fs-body-sm)/var(--lh-body) var(--font-core)',
      color: 'var(--ink)'
    }
  }, label) : null, /*#__PURE__*/React.createElement("input", _extends({
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      height: 44,
      padding: 'var(--space-sm) var(--space-md)',
      borderRadius: 'var(--radius-md)',
      background: 'var(--canvas)',
      color: 'var(--ink)',
      font: 'var(--weight-regular) var(--fs-body-md)/var(--lh-body) var(--font-core)',
      outline: 'none',
      border: error ? '2px solid var(--brand-red-dark)' : active ? '2px solid var(--brand-blue)' : '1px solid var(--hairline-strong)'
    }
  }, rest)), error ? /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--weight-regular) var(--fs-caption)/var(--lh-caption) var(--font-core)',
      color: 'var(--brand-red-dark)'
    }
  }, error) : hint ? /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--weight-regular) var(--fs-caption)/var(--lh-caption) var(--font-core)',
      color: 'var(--stone)'
    }
  }, hint) : null);
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/SearchPill.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function SearchPill({
  placeholder = 'Search',
  icon = null,
  value,
  onChange,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      height: 40,
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-xs)',
      padding: '0 var(--space-md)',
      background: 'var(--surface)',
      border: '1px solid var(--hairline)',
      borderRadius: 'var(--radius-md)',
      ...style
    }
  }, rest), icon ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      color: 'var(--stone)'
    }
  }, icon) : null, /*#__PURE__*/React.createElement("input", {
    placeholder: placeholder,
    value: value,
    onChange: onChange,
    style: {
      flex: 1,
      border: 'none',
      background: 'transparent',
      outline: 'none',
      color: 'var(--ink)',
      font: 'var(--weight-regular) var(--fs-body-sm)/var(--lh-body) var(--font-core)'
    }
  }));
}
Object.assign(__ds_scope, { SearchPill });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/SearchPill.jsx", error: String((e && e.message) || e) }); }

// components/marketing/CtaBanner.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function CtaBanner({
  headline,
  subtitle,
  actions = null,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("section", _extends({
    style: {
      background: 'var(--primary)',
      color: 'var(--on-primary)',
      borderRadius: 'var(--radius-feature)',
      padding: 'var(--space-section)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
      gap: 'var(--space-md)',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("h2", {
    style: {
      font: 'var(--weight-medium) var(--fs-h1)/var(--lh-h1) var(--font-display)',
      letterSpacing: 'var(--ls-h1)',
      color: 'var(--on-primary)',
      maxWidth: '22ch',
      textWrap: 'balance'
    }
  }, headline), subtitle ? /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--weight-regular) var(--fs-subtitle)/var(--lh-subtitle) var(--font-core)',
      color: 'var(--on-dark-muted)',
      maxWidth: '48ch',
      textWrap: 'pretty'
    }
  }, subtitle) : null, actions ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-sm)',
      marginTop: 'var(--space-xs)'
    }
  }, actions) : null);
}
Object.assign(__ds_scope, { CtaBanner });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/marketing/CtaBanner.jsx", error: String((e && e.message) || e) }); }

// components/marketing/FaqAccordion.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function FaqAccordion({
  items = [],
  defaultOpen = 0,
  style,
  ...rest
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'flex',
      flexDirection: 'column',
      ...style
    }
  }, rest), items.map((it, i) => /*#__PURE__*/React.createElement("div", {
    key: it.q,
    style: {
      background: 'var(--canvas)',
      borderRadius: 'var(--radius-md)',
      padding: 'var(--space-xl)',
      borderBottom: '1px solid var(--hairline)'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setOpen(open === i ? -1 : i),
    style: {
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 'var(--space-md)',
      background: 'transparent',
      border: 'none',
      padding: 0,
      cursor: 'pointer',
      textAlign: 'left',
      font: 'var(--weight-medium) var(--fs-h5)/var(--lh-h5) var(--font-display)',
      color: 'var(--ink)'
    }
  }, it.q, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      color: 'var(--steel)',
      font: 'var(--weight-regular) 20px/1 var(--font-core)'
    }
  }, open === i ? '−' : '+')), open === i ? /*#__PURE__*/React.createElement("p", {
    style: {
      marginTop: 'var(--space-sm)',
      font: 'var(--weight-regular) var(--fs-body-md)/var(--lh-body) var(--font-core)',
      color: 'var(--slate)',
      maxWidth: '70ch',
      textWrap: 'pretty'
    }
  }, it.a) : null)));
}
Object.assign(__ds_scope, { FaqAccordion });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/marketing/FaqAccordion.jsx", error: String((e && e.message) || e) }); }

// components/marketing/HeroBand.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function HeroBand({
  eyebrow = null,
  headline,
  subtitle,
  actions = null,
  media = null,
  align = 'center',
  style,
  ...rest
}) {
  const centered = align === 'center';
  return /*#__PURE__*/React.createElement("section", _extends({
    style: {
      background: 'var(--canvas)',
      padding: 'var(--space-hero) var(--container-gutter)',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--container-max)',
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
      alignItems: centered ? 'center' : 'flex-start',
      textAlign: centered ? 'center' : 'left',
      gap: 'var(--space-xl)'
    }
  }, eyebrow, /*#__PURE__*/React.createElement("h1", {
    style: {
      font: 'var(--weight-medium) var(--fs-hero)/var(--lh-hero) var(--font-display)',
      letterSpacing: 'var(--ls-hero)',
      color: 'var(--ink)',
      maxWidth: '14ch',
      textWrap: 'balance'
    }
  }, headline), subtitle ? /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--weight-regular) var(--fs-subtitle)/var(--lh-subtitle) var(--font-core)',
      color: 'var(--slate)',
      maxWidth: '52ch',
      textWrap: 'pretty'
    }
  }, subtitle) : null, actions ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-sm)',
      flexWrap: 'wrap',
      justifyContent: centered ? 'center' : 'flex-start'
    }
  }, actions) : null, media ? /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      marginTop: 'var(--space-xxl)'
    }
  }, media) : null));
}
Object.assign(__ds_scope, { HeroBand });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/marketing/HeroBand.jsx", error: String((e && e.message) || e) }); }

// components/marketing/LogoWall.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function LogoWall({
  items = [],
  caption,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 'var(--space-xl)',
      ...style
    }
  }, rest), caption ? /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--weight-medium) var(--fs-body-sm)/var(--lh-body) var(--font-core)',
      color: 'var(--stone)'
    }
  }, caption) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 'var(--space-xxl)'
    }
  }, items.map(it => /*#__PURE__*/React.createElement("span", {
    key: typeof it === 'string' ? it : it.name,
    style: {
      padding: 'var(--space-lg)',
      font: 'var(--weight-medium) var(--fs-body-md)/var(--lh-body) var(--font-core)',
      color: 'var(--steel)'
    }
  }, typeof it === 'string' ? it : it.name))));
}
Object.assign(__ds_scope, { LogoWall });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/marketing/LogoWall.jsx", error: String((e && e.message) || e) }); }

// components/marketing/ReviewBadge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function ReviewBadge({
  source = 'G2',
  rating = '4.8/5',
  note = '2,400+ reviews',
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 'var(--space-xs)',
      background: 'var(--canvas)',
      color: 'var(--ink)',
      border: '1px solid var(--hairline)',
      borderRadius: 'var(--radius-md)',
      padding: 'var(--space-sm) var(--space-md)',
      font: 'var(--weight-regular) var(--fs-caption)/var(--lh-caption) var(--font-core)',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("strong", {
    style: {
      font: 'var(--weight-semibold) var(--fs-caption)/var(--lh-caption) var(--font-core)'
    }
  }, source), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--brand-yellow-deep)'
    },
    "aria-hidden": "true"
  }, "\u2605"), /*#__PURE__*/React.createElement("span", null, rating), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--stone)'
    }
  }, note));
}
Object.assign(__ds_scope, { ReviewBadge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/marketing/ReviewBadge.jsx", error: String((e && e.message) || e) }); }

// components/marketing/StoreBadge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function StoreBadge({
  store = 'App Store',
  icon = null,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("a", _extends({
    href: "#",
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 'var(--space-xs)',
      background: 'var(--canvas)',
      color: 'var(--primary)',
      borderRadius: 'var(--radius-md)',
      padding: 'var(--space-sm) var(--space-md)',
      font: 'var(--weight-semibold) var(--fs-caption)/var(--lh-caption) var(--font-core)',
      textDecoration: 'none',
      ...style
    }
  }, rest), icon, store);
}
Object.assign(__ds_scope, { StoreBadge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/marketing/StoreBadge.jsx", error: String((e && e.message) || e) }); }

// components/navigation/BillingToggle.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function BillingToggle({
  value = 'monthly',
  onChange,
  discountLabel = 'Save 15%',
  style,
  ...rest
}) {
  const opts = [{
    id: 'monthly',
    label: 'Monthly'
  }, {
    id: 'annual',
    label: 'Annual'
  }];
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 'var(--space-sm)',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      background: 'var(--surface)',
      borderRadius: 'var(--radius-full)',
      padding: 4
    }
  }, opts.map(o => {
    const on = o.id === value;
    return /*#__PURE__*/React.createElement("button", {
      key: o.id,
      onClick: () => onChange && onChange(o.id),
      style: {
        padding: '8px 18px',
        borderRadius: 'var(--radius-full)',
        border: 'none',
        cursor: 'pointer',
        font: 'var(--weight-medium) var(--fs-body-sm)/var(--lh-body) var(--font-core)',
        background: on ? 'var(--canvas)' : 'transparent',
        color: on ? 'var(--ink)' : 'var(--steel)',
        boxShadow: on ? 'var(--shadow-1)' : 'none'
      }
    }, o.label);
  })), discountLabel ? /*#__PURE__*/React.createElement("span", {
    style: {
      background: 'var(--brand-yellow)',
      color: 'var(--primary)',
      font: 'var(--weight-semibold) var(--fs-caption)/var(--lh-caption) var(--font-core)',
      borderRadius: 'var(--radius-sm)',
      padding: '2px 6px'
    }
  }, discountLabel) : null);
}
Object.assign(__ds_scope, { BillingToggle });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/BillingToggle.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Footer.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const DEFAULT_COLUMNS = [{
  heading: 'Product',
  links: ['Dashboards', 'Reporting', 'Forecasting', 'Integrations', 'Security']
}, {
  heading: 'Solutions',
  links: ['Finance teams', 'Founders', 'Accounting firms', 'Investors']
}, {
  heading: 'Tools',
  links: ['Runway calculator', 'Cap table', 'Benchmarks', 'Templates']
}, {
  heading: 'Resources',
  links: ['Guides', 'Help center', 'API docs', 'Community', 'Webinars']
}, {
  heading: 'Company',
  links: ['About', 'Careers', 'Newsroom', 'Trust center', 'Contact']
}, {
  heading: 'Plans & pricing',
  links: ['Free', 'Starter', 'Business', 'Enterprise']
}];
function Footer({
  columns = DEFAULT_COLUMNS,
  badges = null,
  legal = '© 2026 Finsight, Inc.',
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("footer", _extends({
    style: {
      background: 'var(--footer-bg)',
      color: 'var(--on-dark)',
      padding: 'var(--space-section) var(--space-xxl)',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--container-max)',
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-section-sm)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(6,minmax(0,1fr))',
      gap: 'var(--space-xxl)'
    }
  }, columns.map(c => /*#__PURE__*/React.createElement("div", {
    key: c.heading,
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-sm)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--weight-medium) var(--fs-body-md)/var(--lh-body) var(--font-core)',
      color: 'var(--on-dark)'
    }
  }, c.heading), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-xxs)'
    }
  }, c.links.map(l => /*#__PURE__*/React.createElement("a", {
    key: l,
    href: "#",
    style: {
      font: 'var(--weight-regular) var(--fs-body-sm)/var(--lh-body) var(--font-core)',
      color: 'var(--on-dark-muted)',
      textDecoration: 'none',
      padding: 'var(--space-xxs) 0'
    }
  }, l)))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 'var(--space-xl)',
      borderTop: '1px solid rgba(255,255,255,0.14)',
      paddingTop: 'var(--space-xl)',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--weight-medium) var(--fs-micro)/1.4 var(--font-core)',
      color: 'var(--on-dark-muted)'
    }
  }, legal), badges ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-sm)',
      alignItems: 'center'
    }
  }, badges) : null)));
}
Object.assign(__ds_scope, { Footer });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Footer.jsx", error: String((e && e.message) || e) }); }

// components/navigation/PillTabs.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function PillTabs({
  items = [],
  value,
  onChange,
  style,
  ...rest
}) {
  const active = value != null ? value : items[0] && (items[0].id || items[0]);
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'flex',
      gap: 'var(--space-xs)',
      flexWrap: 'wrap',
      ...style
    }
  }, rest), items.map(it => {
    const id = it.id || it;
    const label = it.label || it;
    const on = id === active;
    return /*#__PURE__*/React.createElement("button", {
      key: id,
      onClick: () => onChange && onChange(id),
      style: {
        padding: 'var(--space-xs) var(--space-md)',
        minHeight: 36,
        borderRadius: 'var(--radius-full)',
        cursor: 'pointer',
        font: 'var(--weight-medium) var(--fs-body-sm)/var(--lh-body) var(--font-core)',
        background: on ? 'var(--primary)' : 'var(--canvas)',
        color: on ? 'var(--on-primary)' : 'var(--steel)',
        border: on ? '1px solid var(--primary)' : '1px solid var(--hairline)'
      }
    }, label);
  }));
}
Object.assign(__ds_scope, { PillTabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/PillTabs.jsx", error: String((e && e.message) || e) }); }

// components/navigation/TopNav.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function TopNav({
  links = ['Product', 'Solutions', 'Resources'],
  utility = ['Login', 'Pricing', 'Contact sales'],
  ctaLabel = 'Get started free',
  onCta,
  onNavigate,
  active,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("header", _extends({
    style: {
      height: 64,
      background: 'var(--canvas)',
      borderBottom: '1px solid var(--hairline-soft)',
      display: 'flex',
      alignItems: 'center',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      maxWidth: 'var(--container-max)',
      margin: '0 auto',
      padding: '0 var(--container-gutter)',
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-xxl)'
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => {
      e.preventDefault();
      onNavigate && onNavigate('home');
    },
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 'var(--space-xs)',
      textDecoration: 'none'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 28,
      height: 28,
      borderRadius: 'var(--radius-md)',
      background: 'var(--brand-yellow)',
      display: 'inline-block'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--weight-medium) 20px/1 var(--font-display)',
      letterSpacing: '-0.5px',
      color: 'var(--ink)'
    }
  }, "finsight")), /*#__PURE__*/React.createElement("nav", {
    style: {
      display: 'flex',
      gap: 'var(--space-lg)',
      flex: 1
    }
  }, links.map(l => /*#__PURE__*/React.createElement("a", {
    key: l,
    href: "#",
    onClick: e => {
      e.preventDefault();
      onNavigate && onNavigate(l);
    },
    style: {
      font: 'var(--weight-medium) var(--fs-body-sm)/1.4 var(--font-core)',
      color: active === l ? 'var(--ink)' : 'var(--charcoal)',
      textDecoration: 'none'
    }
  }, l))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-lg)'
    }
  }, utility.map(l => /*#__PURE__*/React.createElement("a", {
    key: l,
    href: "#",
    onClick: e => {
      e.preventDefault();
      onNavigate && onNavigate(l);
    },
    style: {
      font: 'var(--weight-regular) var(--fs-body-sm)/1.4 var(--font-core)',
      color: 'var(--slate)',
      textDecoration: 'none'
    }
  }, l)), /*#__PURE__*/React.createElement(__ds_scope.Button, {
    size: "sm",
    onClick: onCta
  }, ctaLabel))));
}
Object.assign(__ds_scope, { TopNav });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/TopNav.jsx", error: String((e && e.message) || e) }); }

// components/pricing/ComparisonTable.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function ComparisonTable({
  tiers = [],
  sections = [],
  style,
  ...rest
}) {
  const cell = {
    padding: 'var(--space-md) var(--space-lg)',
    font: 'var(--weight-regular) var(--fs-body-sm)/var(--lh-body) var(--font-core)',
    color: 'var(--ink)',
    borderBottom: '1px solid var(--hairline-soft)',
    textAlign: 'center'
  };
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      background: 'var(--canvas)',
      border: '1px solid var(--hairline)',
      borderRadius: 'var(--radius-md)',
      overflow: 'hidden',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse'
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    style: {
      ...cell,
      textAlign: 'left',
      font: 'var(--weight-medium) var(--fs-body-sm)/var(--lh-body) var(--font-core)'
    }
  }, "Features"), tiers.map(t => /*#__PURE__*/React.createElement("th", {
    key: t,
    style: {
      ...cell,
      font: 'var(--weight-medium) var(--fs-body-sm)/var(--lh-body) var(--font-core)'
    }
  }, t)))), /*#__PURE__*/React.createElement("tbody", null, sections.map(sec => /*#__PURE__*/React.createElement(React.Fragment, {
    key: sec.title
  }, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    colSpan: tiers.length + 1,
    style: {
      padding: 'var(--space-sm) var(--space-lg)',
      background: 'var(--surface-soft)',
      borderBottom: '1px solid var(--hairline-soft)',
      font: 'var(--weight-semibold) var(--fs-micro-uppercase)/var(--lh-caption) var(--font-core)',
      letterSpacing: 'var(--ls-micro-uppercase)',
      textTransform: 'uppercase',
      color: 'var(--steel)'
    }
  }, sec.title)), sec.rows.map(r => /*#__PURE__*/React.createElement("tr", {
    key: r.label
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      ...cell,
      textAlign: 'left',
      color: 'var(--charcoal)'
    }
  }, r.label), r.values.map((v, i) => /*#__PURE__*/React.createElement("td", {
    key: i,
    style: cell
  }, v === true ? '✓' : v === false ? /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--muted)'
    }
  }, "\u2014") : v)))))))));
}
Object.assign(__ds_scope, { ComparisonTable });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/pricing/ComparisonTable.jsx", error: String((e && e.message) || e) }); }

// components/pricing/PricingCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function PricingCard({
  variant = 'standard',
  name,
  price,
  priceSuffix = 'per member / month',
  blurb,
  features = [],
  ctaLabel = 'Get started',
  onCta,
  badge = null,
  style,
  ...rest
}) {
  const skins = {
    standard: {
      background: 'var(--canvas)',
      border: '1px solid var(--hairline)',
      color: 'var(--ink)'
    },
    featured: {
      background: 'var(--surface-pricing-featured)',
      border: '2px solid var(--brand-blue)',
      color: 'var(--ink-deep)'
    },
    enterprise: {
      background: 'var(--primary)',
      border: '2px solid var(--primary)',
      color: 'var(--on-primary)'
    }
  };
  const s = skins[variant] || skins.standard;
  const dark = variant === 'enterprise';
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      borderRadius: 'var(--radius-xl)',
      padding: 'var(--space-xxl)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-md)',
      ...s,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 'var(--space-xs)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--weight-medium) var(--fs-h5)/var(--lh-h5) var(--font-display)',
      color: 'inherit'
    }
  }, name), badge), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-xxs)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--weight-medium) var(--fs-h2)/var(--lh-h2) var(--font-display)',
      letterSpacing: 'var(--ls-h2)',
      color: 'inherit'
    }
  }, price), priceSuffix ? /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--weight-regular) var(--fs-caption)/var(--lh-caption) var(--font-core)',
      color: dark ? 'var(--on-dark-muted)' : 'var(--stone)'
    }
  }, priceSuffix) : null), blurb ? /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--weight-regular) var(--fs-body-sm)/var(--lh-body) var(--font-core)',
      color: dark ? 'var(--on-dark-muted)' : 'var(--slate)',
      textWrap: 'pretty'
    }
  }, blurb) : null, /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: dark ? 'onDark' : variant === 'featured' ? 'primary' : 'secondary',
    fullWidth: true,
    onClick: onCta
  }, ctaLabel), /*#__PURE__*/React.createElement("ul", {
    style: {
      listStyle: 'none',
      margin: 0,
      padding: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-xs)'
    }
  }, features.map(f => /*#__PURE__*/React.createElement("li", {
    key: f,
    style: {
      display: 'flex',
      gap: 'var(--space-xs)',
      font: 'var(--weight-regular) var(--fs-body-sm)/var(--lh-body) var(--font-core)',
      color: dark ? 'var(--on-dark-muted)' : 'var(--charcoal)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      color: dark ? 'var(--brand-yellow)' : 'var(--success-accent)'
    }
  }, "\u2713"), f))));
}
Object.assign(__ds_scope, { PricingCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/pricing/PricingCard.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Card({
  variant = 'base',
  padding,
  children,
  style,
  ...rest
}) {
  const map = {
    base: {
      borderRadius: 'var(--radius-xl)',
      padding: 'var(--space-xl)'
    },
    feature: {
      borderRadius: 'var(--radius-xxxl)',
      padding: 'var(--space-xxl)'
    },
    flush: {
      borderRadius: 'var(--radius-xxxl)',
      padding: 0,
      overflow: 'hidden'
    }
  };
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      background: 'var(--canvas)',
      border: '1px solid var(--hairline-soft)',
      color: 'var(--ink)',
      ...map[variant],
      ...(padding ? {
        padding
      } : null),
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/Card.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/FeatureCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const TONES = {
  white: {
    background: 'var(--canvas)',
    color: 'var(--ink)',
    border: '1px solid var(--hairline-soft)'
  },
  yellow: {
    background: 'var(--brand-yellow)',
    color: 'var(--primary)'
  },
  coral: {
    background: 'var(--coral-light)',
    color: 'var(--ink-deep)'
  },
  teal: {
    background: 'var(--teal-light)',
    color: 'var(--moss-dark)'
  },
  rose: {
    background: 'var(--rose-light)',
    color: 'var(--ink-deep)'
  },
  mint: {
    background: 'var(--brand-mint)',
    color: 'var(--moss-dark)'
  },
  orange: {
    background: 'var(--brand-orange-light)',
    color: 'var(--ink-deep)'
  },
  lavender: {
    background: 'var(--surface-pricing-featured)',
    color: 'var(--ink-deep)'
  }
};
function FeatureCard({
  tone = 'white',
  eyebrow,
  title,
  body,
  media = null,
  footer = null,
  children,
  style,
  ...rest
}) {
  const t = TONES[tone] || TONES.white;
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      borderRadius: 'var(--radius-xxxl)',
      padding: 'var(--space-xxl)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-md)',
      border: '1px solid transparent',
      ...t,
      ...style
    }
  }, rest), eyebrow ? /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--weight-semibold) var(--fs-caption)/var(--lh-caption) var(--font-core)',
      opacity: 0.7
    }
  }, eyebrow) : null, title ? /*#__PURE__*/React.createElement("h3", {
    style: {
      font: 'var(--weight-medium) var(--fs-h4)/var(--lh-h4) var(--font-display)',
      color: 'inherit'
    }
  }, title) : null, body ? /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--weight-regular) var(--fs-body-md)/var(--lh-body) var(--font-core)',
      opacity: 0.82,
      textWrap: 'pretty'
    }
  }, body) : null, children, media ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'var(--space-xs)',
      borderRadius: 'var(--radius-xl)',
      overflow: 'hidden'
    }
  }, media) : null, footer ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'auto',
      paddingTop: 'var(--space-md)'
    }
  }, footer) : null);
}
Object.assign(__ds_scope, { FeatureCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/FeatureCard.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/IndustryTile.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function IndustryTile({
  icon = null,
  title,
  body,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      background: 'var(--canvas)',
      border: '1px solid var(--hairline-soft)',
      borderRadius: 'var(--radius-xl)',
      padding: 'var(--space-xl)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-sm)',
      ...style
    }
  }, rest), icon ? /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--ink)',
      display: 'inline-flex'
    }
  }, icon) : null, /*#__PURE__*/React.createElement("h4", {
    style: {
      font: 'var(--weight-medium) var(--fs-h5)/var(--lh-h5) var(--font-display)'
    }
  }, title), body ? /*#__PURE__*/React.createElement("p", {
    style: {
      font: 'var(--weight-regular) var(--fs-body-sm)/var(--lh-body) var(--font-core)',
      color: 'var(--slate)',
      textWrap: 'pretty'
    }
  }, body) : null);
}
Object.assign(__ds_scope, { IndustryTile });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/IndustryTile.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/ProductMockup.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function ProductMockup({
  title = 'Finsight',
  chrome = true,
  elevation = 3,
  children,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      background: 'var(--canvas)',
      border: '1px solid var(--hairline-soft)',
      borderRadius: 'var(--radius-xl)',
      boxShadow: 'var(--shadow-' + elevation + ')',
      overflow: 'hidden',
      ...style
    }
  }, rest), chrome ? /*#__PURE__*/React.createElement("div", {
    style: {
      height: 44,
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-sm)',
      padding: '0 var(--space-md)',
      borderBottom: '1px solid var(--hairline-soft)',
      background: 'var(--surface-soft)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 10,
      height: 10,
      borderRadius: 'var(--radius-full)',
      background: 'var(--hairline-strong)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 10,
      height: 10,
      borderRadius: 'var(--radius-full)',
      background: 'var(--hairline-strong)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 10,
      height: 10,
      borderRadius: 'var(--radius-full)',
      background: 'var(--hairline-strong)'
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--weight-medium) var(--fs-micro)/1.4 var(--font-core)',
      color: 'var(--stone)'
    }
  }, title)) : null, /*#__PURE__*/React.createElement("div", null, children));
}
Object.assign(__ds_scope, { ProductMockup });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/ProductMockup.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/StatCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function StatCard({
  value,
  label,
  align = 'left',
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      padding: 'var(--space-lg)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-xs)',
      textAlign: align,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--weight-medium) var(--fs-stat)/var(--lh-stat) var(--font-display)',
      letterSpacing: 'var(--ls-stat)',
      color: 'var(--ink)'
    }
  }, value), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--weight-regular) var(--fs-body-sm)/var(--lh-body) var(--font-core)',
      color: 'var(--slate)'
    }
  }, label));
}
Object.assign(__ds_scope, { StatCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/StatCard.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/StoryCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function StoryCard({
  image,
  imageAlt = '',
  tone = 'canvas',
  logo,
  title,
  meta,
  tags = [],
  style,
  ...rest
}) {
  const bg = tone === 'canvas' ? 'var(--canvas)' : 'var(--' + tone + ')';
  return /*#__PURE__*/React.createElement("article", _extends({
    style: {
      background: bg,
      border: '1px solid var(--hairline-soft)',
      borderRadius: 'var(--radius-xxxl)',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      aspectRatio: '16 / 9',
      background: 'var(--surface)',
      position: 'relative',
      overflow: 'hidden'
    }
  }, image ? /*#__PURE__*/React.createElement("img", {
    src: image,
    alt: imageAlt,
    style: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      display: 'block'
    }
  }) : null, logo ? /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: 'var(--space-lg)',
      bottom: 'var(--space-lg)',
      color: 'var(--on-dark)',
      font: 'var(--weight-medium) var(--fs-body-md)/1.2 var(--font-display)'
    }
  }, logo) : null), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 'var(--space-xl)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-sm)'
    }
  }, tags.length ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-xs)',
      flexWrap: 'wrap'
    }
  }, tags.map((t, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    style: {
      font: 'var(--weight-semibold) var(--fs-caption)/var(--lh-caption) var(--font-core)',
      color: 'var(--steel)'
    }
  }, t))) : null, /*#__PURE__*/React.createElement("h3", {
    style: {
      font: 'var(--weight-medium) var(--fs-h5)/var(--lh-h5) var(--font-display)',
      color: 'var(--ink)',
      textWrap: 'pretty'
    }
  }, title), meta ? /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--weight-regular) var(--fs-body-sm)/var(--lh-body) var(--font-core)',
      color: 'var(--stone)'
    }
  }, meta) : null));
}
Object.assign(__ds_scope, { StoryCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/StoryCard.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/TemplateCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function TemplateCard({
  thumbnail,
  thumbAlt = '',
  tone = 'surface',
  title,
  meta,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      background: 'var(--canvas)',
      border: '1px solid var(--hairline)',
      borderRadius: 'var(--radius-xl)',
      padding: 'var(--space-md)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-sm)',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      aspectRatio: '4 / 3',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      background: 'var(--' + tone + ')'
    }
  }, thumbnail ? /*#__PURE__*/React.createElement("img", {
    src: thumbnail,
    alt: thumbAlt,
    style: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      display: 'block'
    }
  }) : null), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--weight-medium) var(--fs-body-sm)/var(--lh-body) var(--font-core)',
      color: 'var(--ink)'
    }
  }, title), meta ? /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--weight-regular) var(--fs-caption)/var(--lh-caption) var(--font-core)',
      color: 'var(--stone)'
    }
  }, meta) : null);
}
Object.assign(__ds_scope, { TemplateCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/TemplateCard.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing/Customers.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  TopNav,
  SearchPill,
  FilterDropdown,
  StoryCard,
  Badge,
  Button,
  CtaBanner,
  Footer,
  StatCard
} = window.FinsightDesignSystem_1f7cfd;
const STORIES = [{
  title: 'How Northwind cut close time by 60%',
  logo: 'Northwind',
  tags: ['Fintech', 'Close'],
  meta: 'Case study · 5 min',
  tone: 'teal-light'
}, {
  title: 'Lumen replaced four spreadsheets with one forecast',
  logo: 'Lumen',
  tags: ['SaaS', 'Forecasting'],
  meta: 'Case study · 4 min',
  tone: 'yellow-light'
}, {
  title: 'Kestrel gave every department its own burn view',
  logo: 'Kestrel',
  tags: ['Marketplace', 'Reporting'],
  meta: 'Case study · 6 min',
  tone: 'rose-light'
}, {
  title: 'Bellwether closes 9 entities in one week',
  logo: 'Bellwether',
  tags: ['Enterprise', 'Consolidation'],
  meta: 'Case study · 7 min',
  tone: 'coral-light'
}, {
  title: 'Orbit onboarded finance in an afternoon',
  logo: 'Orbit',
  tags: ['Seed', 'Onboarding'],
  meta: 'Story · 3 min',
  tone: 'canvas'
}, {
  title: 'Havenlink took its audit from 6 weeks to 12 days',
  logo: 'Havenlink',
  tags: ['Healthcare', 'Audit'],
  meta: 'Case study · 5 min',
  tone: 'canvas'
}];
function Customers({
  go
}) {
  const [q, setQ] = React.useState('');
  const [industry, setIndustry] = React.useState(null);
  const list = STORIES.filter(s => s.title.toLowerCase().includes(q.toLowerCase()) && (!industry || s.tags.includes(industry)));
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(TopNav, {
    active: "Resources",
    onNavigate: go,
    onCta: () => go('Pricing')
  }), /*#__PURE__*/React.createElement("section", {
    style: {
      padding: 'var(--space-section) var(--container-gutter)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--container-max)',
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-xxl)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-md)',
      maxWidth: 680
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: "yellow"
  }, "Customer stories"), /*#__PURE__*/React.createElement("h1", {
    className: "fs-h1"
  }, "Finance teams who stopped chasing numbers"), /*#__PURE__*/React.createElement("p", {
    className: "fs-subtitle",
    style: {
      color: 'var(--slate)'
    }
  }, "Real closes, real runway calls, in their words.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-sm)',
      alignItems: 'center',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(SearchPill, {
    placeholder: "Search stories",
    value: q,
    onChange: e => setQ(e.target.value),
    style: {
      width: 280
    }
  }), /*#__PURE__*/React.createElement(FilterDropdown, {
    label: "Industry",
    value: industry,
    options: ['Fintech', 'SaaS', 'Marketplace', 'Enterprise', 'Healthcare'],
    onSelect: setIndustry
  }), /*#__PURE__*/React.createElement(FilterDropdown, {
    label: "Use case",
    options: ['Close', 'Forecasting', 'Reporting', 'Audit']
  }), /*#__PURE__*/React.createElement(FilterDropdown, {
    label: "Company size",
    options: ['1–50', '50–200', '200–1,000', '1,000+']
  }), industry ? /*#__PURE__*/React.createElement(Button, {
    variant: "link",
    onClick: () => setIndustry(null)
  }, "Clear filter") : null), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 'var(--space-xxl)'
    }
  }, list.map(s => /*#__PURE__*/React.createElement(StoryCard, _extends({
    key: s.title
  }, s)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3,minmax(0,1fr))',
      gap: 'var(--space-lg)',
      borderTop: '1px solid var(--hairline)',
      paddingTop: 'var(--space-xxl)'
    }
  }, /*#__PURE__*/React.createElement(StatCard, {
    value: "6 days",
    label: "Median close time across customers"
  }), /*#__PURE__*/React.createElement(StatCard, {
    value: "\u221231%",
    label: "Average reduction in reporting hours"
  }), /*#__PURE__*/React.createElement(StatCard, {
    value: "98%",
    label: "Renewal rate on Business and above"
  })), /*#__PURE__*/React.createElement(CtaBanner, {
    headline: "Your close could be the next story",
    subtitle: "Start free, or let us walk your team through a live close.",
    actions: /*#__PURE__*/React.createElement(Button, {
      variant: "onDark",
      onClick: () => go('Pricing')
    }, "Get started free")
  }))), /*#__PURE__*/React.createElement(Footer, null));
}
Object.assign(window, {
  Customers
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing/Customers.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing/Home.jsx
try { (() => {
const {
  TopNav,
  PromoBanner,
  HeroBand,
  Button,
  Badge,
  ProductMockup,
  LogoWall,
  FeatureCard,
  StatCard,
  CtaBanner,
  Footer,
  StoreBadge,
  ReviewBadge,
  PillTabs
} = window.FinsightDesignSystem_1f7cfd;
function Section({
  children,
  tone = 'canvas',
  pad = 'var(--space-section-lg)'
}) {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      background: tone === 'canvas' ? 'var(--canvas)' : 'var(--surface-soft)',
      padding: pad + ' var(--container-gutter)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--container-max)',
      margin: '0 auto'
    }
  }, children));
}
function Home({
  go
}) {
  const [tab, setTab] = React.useState('Finance');
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(PromoBanner, {
    pillLabel: "GET YOUR SPOT"
  }, "Finsight Live \u2014 the AI close, Sept 24"), /*#__PURE__*/React.createElement(TopNav, {
    active: "Product",
    onNavigate: go,
    onCta: () => go('Pricing')
  }), /*#__PURE__*/React.createElement(HeroBand, {
    eyebrow: /*#__PURE__*/React.createElement(Badge, {
      tone: "yellow"
    }, "New \xB7 AI variance checks"),
    headline: "Every number, one source of truth",
    subtitle: "Finsight connects your banks, billing and ledger into one live picture \u2014 so the close takes days, not weeks.",
    actions: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      onClick: () => go('Pricing')
    }, "Get started free"), /*#__PURE__*/React.createElement(Button, {
      variant: "secondary"
    }, "Book a demo")),
    media: /*#__PURE__*/React.createElement(ProductMockup, {
      title: "Finsight \u2014 August close"
    }, /*#__PURE__*/React.createElement(DashboardMock, null))
  }), /*#__PURE__*/React.createElement(Section, {
    tone: "soft",
    pad: "var(--space-section)"
  }, /*#__PURE__*/React.createElement(LogoWall, {
    caption: "Trusted by 4,000+ finance teams",
    items: ['Northwind', 'Lumen', 'Kestrel', 'Bellwether', 'Orbit', 'Havenlink']
  })), /*#__PURE__*/React.createElement(Section, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-xxxl)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-md)',
      maxWidth: 640
    }
  }, /*#__PURE__*/React.createElement("h2", {
    className: "fs-h1"
  }, "Built for the whole finance stack"), /*#__PURE__*/React.createElement("p", {
    className: "fs-subtitle",
    style: {
      color: 'var(--slate)'
    }
  }, "Pick a workflow and see how teams run it on Finsight."), /*#__PURE__*/React.createElement(PillTabs, {
    items: ['Finance', 'Operations', 'Founders', 'Accountants'],
    value: tab,
    onChange: setTab
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3,minmax(0,1fr))',
      gap: 'var(--space-lg)'
    }
  }, /*#__PURE__*/React.createElement(FeatureCard, {
    tone: "yellow",
    title: "Live cash, every account",
    body: "Balances and payouts from 200+ banks, refreshed hourly with full audit trail."
  }), /*#__PURE__*/React.createElement(FeatureCard, {
    tone: "teal",
    title: "Close in days, not weeks",
    body: "Automated reconciliation flags the four things that actually moved."
  }), /*#__PURE__*/React.createElement(FeatureCard, {
    tone: "coral",
    title: "Board-ready reporting",
    body: "Monthly packs that build themselves and stay tied to source data."
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1.2fr 1fr',
      gap: 'var(--space-lg)',
      alignItems: 'stretch'
    }
  }, /*#__PURE__*/React.createElement(ProductMockup, {
    title: "Finsight \u2014 Forecast",
    elevation: 2
  }, /*#__PURE__*/React.createElement(ForecastMock, null)), /*#__PURE__*/React.createElement(FeatureCard, {
    tone: "rose",
    eyebrow: "Forecasting",
    title: "Scenarios your board can argue with",
    body: "Model hiring, pricing and churn side by side. Every assumption is traceable back to a transaction.",
    footer: /*#__PURE__*/React.createElement(Button, {
      variant: "secondary"
    }, "See forecasting")
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4,minmax(0,1fr))',
      gap: 'var(--space-lg)',
      borderTop: '1px solid var(--hairline)',
      paddingTop: 'var(--space-xxxl)'
    }
  }, /*#__PURE__*/React.createElement(StatCard, {
    value: "$18B+",
    label: "Cash monitored on Finsight"
  }), /*#__PURE__*/React.createElement(StatCard, {
    value: "4,000",
    label: "Finance teams"
  }), /*#__PURE__*/React.createElement(StatCard, {
    value: "6 days",
    label: "Median close time"
  }), /*#__PURE__*/React.createElement(StatCard, {
    value: "200+",
    label: "Bank and ledger connections"
  })))), /*#__PURE__*/React.createElement(Section, {
    pad: "var(--space-section)"
  }, /*#__PURE__*/React.createElement(CtaBanner, {
    headline: "Start closing faster",
    subtitle: "Free for up to three teammates. No card, no implementation project.",
    actions: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "onDark",
      onClick: () => go('Pricing')
    }, "Get started free"), /*#__PURE__*/React.createElement(Button, {
      variant: "link",
      style: {
        color: 'var(--brand-yellow)'
      }
    }, "Contact sales"))
  })), /*#__PURE__*/React.createElement(Footer, {
    badges: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(ReviewBadge, null), /*#__PURE__*/React.createElement(StoreBadge, {
      store: "App Store"
    }), /*#__PURE__*/React.createElement(StoreBadge, {
      store: "Google Play"
    }))
  }));
}
Object.assign(window, {
  Home,
  Section
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing/Home.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing/Pricing.jsx
try { (() => {
const {
  TopNav,
  Button,
  Badge,
  BillingToggle,
  PricingCard,
  ComparisonTable,
  FaqAccordion,
  Footer,
  ReviewBadge
} = window.FinsightDesignSystem_1f7cfd;
const TIER_PRICES = {
  monthly: ['$0', '$16', '$32', 'Custom'],
  annual: ['$0', '$14', '$27', 'Custom']
};
function Pricing({
  go
}) {
  const [cycle, setCycle] = React.useState('annual');
  const p = TIER_PRICES[cycle];
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(TopNav, {
    active: "Pricing",
    onNavigate: go,
    onCta: () => go('home')
  }), /*#__PURE__*/React.createElement("section", {
    style: {
      padding: 'var(--space-section) var(--container-gutter)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--container-max)',
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-xxl)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 'var(--space-md)',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("h1", {
    className: "fs-h1"
  }, "Plans that scale with the close"), /*#__PURE__*/React.createElement("p", {
    className: "fs-subtitle",
    style: {
      color: 'var(--slate)',
      maxWidth: '48ch'
    }
  }, "Start free. Add scenarios, controls and SSO when your team needs them."), /*#__PURE__*/React.createElement(BillingToggle, {
    value: cycle,
    onChange: setCycle
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4,minmax(0,1fr))',
      gap: 'var(--space-lg)',
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement(PricingCard, {
    name: "Free",
    price: p[0],
    priceSuffix: "up to 3 members",
    blurb: "For founders wiring up their first dashboard.",
    ctaLabel: "Start free",
    features: ['2 dashboards', '2 bank connections', '30-day history']
  }), /*#__PURE__*/React.createElement(PricingCard, {
    name: "Starter",
    price: p[1],
    blurb: "For small teams standardising the monthly close.",
    features: ['Unlimited dashboards', '10 connections', 'Scheduled reports', 'CSV + Sheets export']
  }), /*#__PURE__*/React.createElement(PricingCard, {
    variant: "featured",
    name: "Business",
    price: p[2],
    badge: /*#__PURE__*/React.createElement(Badge, {
      tone: "purple"
    }, "Most popular"),
    blurb: "For finance teams running forecast and controls.",
    features: ['Forecast scenarios', 'Approval workflows', 'SSO / SAML', 'Role-based access']
  }), /*#__PURE__*/React.createElement(PricingCard, {
    variant: "enterprise",
    name: "Enterprise",
    price: p[3],
    priceSuffix: "annual contract",
    ctaLabel: "Contact sales",
    blurb: "For multi-entity groups with audit obligations.",
    features: ['Multi-entity consolidation', 'Audit log + retention', 'Dedicated CSM', 'Custom DPA']
  })), /*#__PURE__*/React.createElement(ComparisonTable, {
    tiers: ['Free', 'Starter', 'Business', 'Enterprise'],
    sections: [{
      title: 'Reporting',
      rows: [{
        label: 'Dashboards',
        values: ['2', 'Unlimited', 'Unlimited', 'Unlimited']
      }, {
        label: 'Scheduled reports',
        values: [false, true, true, true]
      }, {
        label: 'Board pack templates',
        values: [false, '3', 'Unlimited', 'Unlimited']
      }, {
        label: 'History retention',
        values: ['30 days', '2 years', '7 years', 'Custom']
      }]
    }, {
      title: 'Forecasting',
      rows: [{
        label: 'Scenario models',
        values: [false, '1', 'Unlimited', 'Unlimited']
      }, {
        label: 'Driver-based planning',
        values: [false, false, true, true]
      }, {
        label: 'Variance alerts',
        values: [false, true, true, true]
      }]
    }, {
      title: 'Security & admin',
      rows: [{
        label: 'SSO / SAML',
        values: [false, false, true, true]
      }, {
        label: 'Role-based access',
        values: [false, false, true, true]
      }, {
        label: 'Audit log',
        values: [false, false, false, true]
      }, {
        label: 'Support',
        values: ['Community', 'Email', 'Priority', 'Dedicated CSM']
      }]
    }]
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1.4fr',
      gap: 'var(--space-xxxl)',
      paddingTop: 'var(--space-xl)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-md)'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    className: "fs-h2"
  }, "Questions, answered"), /*#__PURE__*/React.createElement(ReviewBadge, null)), /*#__PURE__*/React.createElement(FaqAccordion, {
    items: [{
      q: 'Can I switch plans later?',
      a: 'Any time. Upgrades apply immediately and are prorated to the day; downgrades take effect at the end of the cycle.'
    }, {
      q: 'How are members counted?',
      a: 'Anyone who can open a dashboard. Viewers on shared report links are free.'
    }, {
      q: 'Which systems do you connect to?',
      a: 'Over 200 banks, plus Stripe, NetSuite, QuickBooks, Xero and Snowflake.'
    }, {
      q: 'Do you offer nonprofit pricing?',
      a: 'Yes — registered nonprofits get Business at 50%. Contact sales with your registration number.'
    }]
  })))), /*#__PURE__*/React.createElement(Footer, null));
}
Object.assign(window, {
  Pricing
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing/Pricing.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing/Product.jsx
try { (() => {
const {
  TopNav,
  Button,
  Badge,
  ProductMockup,
  FeatureCard,
  IndustryTile,
  TemplateCard,
  Input,
  CtaBanner,
  Footer,
  Card
} = window.FinsightDesignSystem_1f7cfd;
function Product({
  go
}) {
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(TopNav, {
    active: "Product",
    onNavigate: go,
    onCta: () => go('Pricing')
  }), /*#__PURE__*/React.createElement("section", {
    style: {
      padding: 'var(--space-section-lg) var(--container-gutter)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--container-max)',
      margin: '0 auto',
      display: 'grid',
      gridTemplateColumns: '1fr 1.1fr',
      gap: 'var(--space-section)',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-lg)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-xs)'
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: "purple"
  }, "AI agent"), /*#__PURE__*/React.createElement(Badge, {
    tone: "yellow"
  }, "Automation")), /*#__PURE__*/React.createElement("h1", {
    className: "fs-display-lg"
  }, "The close, on autopilot"), /*#__PURE__*/React.createElement("p", {
    className: "fs-subtitle",
    style: {
      color: 'var(--slate)',
      maxWidth: '46ch'
    }
  }, "Finsight's agent reconciles accounts overnight, drafts the variance narrative, and leaves you the judgement calls."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-sm)'
    }
  }, /*#__PURE__*/React.createElement(Button, null, "Get started free"), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary"
  }, "Watch the 3-min tour"))), /*#__PURE__*/React.createElement(ProductMockup, {
    title: "Finsight \u2014 Agent run 04:12"
  }, /*#__PURE__*/React.createElement(DashboardMock, null)))), /*#__PURE__*/React.createElement("section", {
    style: {
      padding: '0 var(--container-gutter) var(--space-section-lg)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--container-max)',
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-xxxl)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3,minmax(0,1fr))',
      gap: 'var(--space-lg)'
    }
  }, /*#__PURE__*/React.createElement(FeatureCard, {
    tone: "lavender",
    eyebrow: "Step 1",
    title: "Connect",
    body: "Banks, billing, ledger and payroll \u2014 read-only, in minutes."
  }), /*#__PURE__*/React.createElement(FeatureCard, {
    tone: "mint",
    eyebrow: "Step 2",
    title: "Reconcile",
    body: "The agent matches transactions and escalates only true exceptions."
  }), /*#__PURE__*/React.createElement(FeatureCard, {
    tone: "orange",
    eyebrow: "Step 3",
    title: "Report",
    body: "Board pack and commentary drafted against live source data."
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4,minmax(0,1fr))',
      gap: 'var(--space-lg)'
    }
  }, /*#__PURE__*/React.createElement(IndustryTile, {
    title: "SaaS",
    body: "ARR, NRR and cohort retention out of the box."
  }), /*#__PURE__*/React.createElement(IndustryTile, {
    title: "Marketplaces",
    body: "GMV, take rate and payout reconciliation."
  }), /*#__PURE__*/React.createElement(IndustryTile, {
    title: "Healthcare",
    body: "Multi-entity consolidation with audit retention."
  }), /*#__PURE__*/React.createElement(IndustryTile, {
    title: "Professional services",
    body: "Utilisation and project-level margin."
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-lg)'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    className: "fs-h2"
  }, "Start from a template"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4,minmax(0,1fr))',
      gap: 'var(--space-lg)'
    }
  }, /*#__PURE__*/React.createElement(TemplateCard, {
    title: "13-week cash flow",
    meta: "Template",
    tone: "teal-light"
  }), /*#__PURE__*/React.createElement(TemplateCard, {
    title: "Monthly board pack",
    meta: "Template",
    tone: "yellow-light"
  }), /*#__PURE__*/React.createElement(TemplateCard, {
    title: "Headcount plan",
    meta: "Template",
    tone: "coral-light"
  }), /*#__PURE__*/React.createElement(TemplateCard, {
    title: "SaaS metrics starter",
    meta: "Template",
    tone: "surface"
  }))), /*#__PURE__*/React.createElement(Card, {
    variant: "feature",
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 'var(--space-xxl)',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-sm)'
    }
  }, /*#__PURE__*/React.createElement("h3", {
    className: "fs-h3"
  }, "Get the agent changelog"), /*#__PURE__*/React.createElement("p", {
    className: "fs-body",
    style: {
      color: 'var(--slate)'
    }
  }, "What shipped, what it automated, every second Tuesday.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-sm)',
      alignItems: 'flex-end'
    }
  }, /*#__PURE__*/React.createElement(Input, {
    label: "Work email",
    placeholder: "you@company.com",
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement(Button, {
    style: {
      height: 44
    }
  }, "Subscribe"))), /*#__PURE__*/React.createElement(CtaBanner, {
    headline: "Let the agent run your next close",
    subtitle: "Free for up to three teammates.",
    actions: /*#__PURE__*/React.createElement(Button, {
      variant: "onDark",
      onClick: () => go('Pricing')
    }, "Get started free")
  }))), /*#__PURE__*/React.createElement(Footer, null));
}
Object.assign(window, {
  Product
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing/Product.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing/mocks.jsx
try { (() => {
// Product-UI mocks used inside ProductMockup frames. Plain divs — no imagery.
const {
  Badge
} = window.FinsightDesignSystem_1f7cfd;
function Sparkline({
  points = [18, 26, 22, 34, 30, 44, 52, 48, 64, 72, 68, 86],
  color = 'var(--brand-blue)'
}) {
  const max = Math.max(...points);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-end',
      gap: 6,
      height: 120
    }
  }, points.map((p, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      flex: 1,
      height: p / max * 100 + '%',
      background: i >= points.length - 3 ? color : 'var(--surface-pricing-featured)',
      borderRadius: 4
    }
  })));
}
function KpiRow() {
  const kpis = [['Cash on hand', '$14.2M', '+3.1%'], ['Net burn', '$812K', '−12%'], ['Runway', '17.5 mo', '+2.1 mo'], ['Gross margin', '78%', '+40 bps']];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4,minmax(0,1fr))',
      gap: 12
    }
  }, kpis.map(([l, v, d]) => /*#__PURE__*/React.createElement("div", {
    key: l,
    style: {
      border: '1px solid var(--hairline-soft)',
      borderRadius: 'var(--radius-lg)',
      padding: 'var(--space-md)',
      display: 'flex',
      flexDirection: 'column',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: '400 12px/1.4 var(--font-core)',
      color: 'var(--stone)'
    }
  }, l), /*#__PURE__*/React.createElement("span", {
    style: {
      font: '500 24px/1.2 var(--font-display)',
      letterSpacing: '-0.5px',
      color: 'var(--ink)'
    }
  }, v), /*#__PURE__*/React.createElement("span", {
    style: {
      font: '500 12px/1.4 var(--font-core)',
      color: 'var(--success-accent)'
    }
  }, d))));
}
function DashboardMock() {
  const rows = [['Stripe payouts', 'Revenue', '$482,100', 'Reconciled'], ['Payroll — Aug', 'Opex', '$311,480', 'Reconciled'], ['AWS', 'Infrastructure', '$96,204', 'Review'], ['Contractors', 'Opex', '$41,900', 'Reconciled']];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      minHeight: 420
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 196,
      borderRight: '1px solid var(--hairline-soft)',
      padding: 'var(--space-md)',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      background: 'var(--surface-soft)'
    }
  }, ['Overview', 'Cash', 'Revenue', 'Spend', 'Forecast', 'Reports'].map((n, i) => /*#__PURE__*/React.createElement("span", {
    key: n,
    style: {
      padding: '8px 10px',
      borderRadius: 'var(--radius-md)',
      font: '500 13px/1.4 var(--font-core)',
      color: i === 0 ? 'var(--ink)' : 'var(--steel)',
      background: i === 0 ? 'var(--canvas)' : 'transparent',
      border: i === 0 ? '1px solid var(--hairline-soft)' : '1px solid transparent'
    }
  }, n))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      padding: 'var(--space-lg)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-lg)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: '500 20px/1.2 var(--font-display)',
      color: 'var(--ink)'
    }
  }, "August close"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: "purple"
  }, "AI variance check"), /*#__PURE__*/React.createElement(Badge, {
    tone: "success"
  }, "On track"))), /*#__PURE__*/React.createElement(KpiRow, null), /*#__PURE__*/React.createElement("div", {
    style: {
      border: '1px solid var(--hairline-soft)',
      borderRadius: 'var(--radius-lg)',
      padding: 'var(--space-md)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: '400 12px/1.4 var(--font-core)',
      color: 'var(--stone)'
    }
  }, "Net burn, trailing 12 months"), /*#__PURE__*/React.createElement(Sparkline, null)), /*#__PURE__*/React.createElement("div", {
    style: {
      border: '1px solid var(--hairline-soft)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden'
    }
  }, rows.map((r, i) => /*#__PURE__*/React.createElement("div", {
    key: r[0],
    style: {
      display: 'grid',
      gridTemplateColumns: '2fr 1fr 1fr 1fr',
      gap: 8,
      padding: '12px var(--space-md)',
      borderTop: i ? '1px solid var(--hairline-soft)' : 'none',
      font: '400 13px/1.4 var(--font-core)',
      color: 'var(--charcoal)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 500,
      color: 'var(--ink)'
    }
  }, r[0]), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--slate)'
    }
  }, r[1]), /*#__PURE__*/React.createElement("span", null, r[2]), /*#__PURE__*/React.createElement("span", {
    style: {
      color: r[3] === 'Review' ? 'var(--brand-red-dark)' : 'var(--success-accent)'
    }
  }, r[3]))))));
}
function ForecastMock() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 'var(--space-lg)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-md)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, ['Base', 'Hiring freeze', 'Aggressive'].map((s, i) => /*#__PURE__*/React.createElement("span", {
    key: s,
    style: {
      padding: '6px 12px',
      borderRadius: 'var(--radius-full)',
      font: '500 12px/1.3 var(--font-core)',
      background: i === 1 ? 'var(--primary)' : 'var(--canvas)',
      color: i === 1 ? 'var(--on-primary)' : 'var(--steel)',
      border: '1px solid ' + (i === 1 ? 'var(--primary)' : 'var(--hairline)')
    }
  }, s))), /*#__PURE__*/React.createElement(Sparkline, {
    points: [30, 32, 36, 40, 38, 46, 50, 58, 62, 70, 80, 92],
    color: "var(--brand-teal)"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3,minmax(0,1fr))',
      gap: 12
    }
  }, [['Runway', '21.4 mo'], ['Break-even', 'Q3 2027'], ['Hiring plan', '+14 FTE']].map(([l, v]) => /*#__PURE__*/React.createElement("div", {
    key: l,
    style: {
      border: '1px solid var(--hairline-soft)',
      borderRadius: 'var(--radius-lg)',
      padding: 'var(--space-md)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: '400 12px/1.4 var(--font-core)',
      color: 'var(--stone)'
    }
  }, l), /*#__PURE__*/React.createElement("div", {
    style: {
      font: '500 22px/1.2 var(--font-display)',
      color: 'var(--ink)'
    }
  }, v)))));
}
Object.assign(window, {
  Sparkline,
  KpiRow,
  DashboardMock,
  ForecastMock
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing/mocks.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.PromoBanner = __ds_scope.PromoBanner;

__ds_ns.FilterDropdown = __ds_scope.FilterDropdown;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.SearchPill = __ds_scope.SearchPill;

__ds_ns.CtaBanner = __ds_scope.CtaBanner;

__ds_ns.FaqAccordion = __ds_scope.FaqAccordion;

__ds_ns.HeroBand = __ds_scope.HeroBand;

__ds_ns.LogoWall = __ds_scope.LogoWall;

__ds_ns.ReviewBadge = __ds_scope.ReviewBadge;

__ds_ns.StoreBadge = __ds_scope.StoreBadge;

__ds_ns.BillingToggle = __ds_scope.BillingToggle;

__ds_ns.Footer = __ds_scope.Footer;

__ds_ns.PillTabs = __ds_scope.PillTabs;

__ds_ns.TopNav = __ds_scope.TopNav;

__ds_ns.ComparisonTable = __ds_scope.ComparisonTable;

__ds_ns.PricingCard = __ds_scope.PricingCard;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.FeatureCard = __ds_scope.FeatureCard;

__ds_ns.IndustryTile = __ds_scope.IndustryTile;

__ds_ns.ProductMockup = __ds_scope.ProductMockup;

__ds_ns.StatCard = __ds_scope.StatCard;

__ds_ns.StoryCard = __ds_scope.StoryCard;

__ds_ns.TemplateCard = __ds_scope.TemplateCard;

})();
