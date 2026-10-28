import Image from "next/image";

type CollabryBrandProps = {
  inverse?: boolean;
  size?: "small" | "medium" | "large";
  className?: string;
};

const widths = {
  small: 130,
  medium: 156,
  large: 184,
} as const;

export function CollabryBrand({
  inverse = false,
  size = "medium",
  className,
}: CollabryBrandProps) {
  const width = widths[size];
  const logoAspectRatio = inverse ? 530 / 164 : 1245 / 377;
  const height = Math.round(width / logoAspectRatio);

  return (
    <Image
      src={inverse ? "/collabry-logo-light.svg" : "/collabry-logo.png"}
      alt="Collabry"
      width={width}
      height={height}
      className={`${inverse ? "collabry-brand-inverse" : "collabry-brand-light"}${className ? ` ${className}` : ""}`}
      unoptimized
    />
  );
}

export function CollabryMark({
  size = 36,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const width = Math.round((size * 328) / 377);

  return (
    <Image
      src="/collabry-symbol.png"
      alt=""
      aria-hidden="true"
      width={width}
      height={size}
      className={`collabry-brand-light${className ? ` ${className}` : ""}`}
      unoptimized
    />
  );
}
