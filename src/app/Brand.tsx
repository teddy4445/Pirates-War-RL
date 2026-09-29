export const brandAssets = {
  crest: `${import.meta.env.BASE_URL}assets/branding/pirates-war-crest-v1.png`,
  logo: `${import.meta.env.BASE_URL}assets/branding/pirates-war-logo-v1.png`,
} as const;

type BrandImageProps = {
  className?: string | undefined;
  decorative?: boolean;
};

export function BrandLogo({ className, decorative = false }: BrandImageProps) {
  return <img className={className} src={brandAssets.logo} alt={decorative ? "" : "Pirates War RL"} draggable={false} />;
}

export function BrandCrest({ className, decorative = false }: BrandImageProps) {
  return <img className={className} src={brandAssets.crest} alt={decorative ? "" : "Pirates War RL crest"} draggable={false} />;
}
