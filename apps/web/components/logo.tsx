import Image from 'next/image';
import Link from 'next/link';

export function TalentralLogo({ dark = false, height = 28, href = '/' }: { dark?: boolean; height?: number; href?: string | null }) {
  const img = (
    <Image src={dark ? '/brand/talentral-logo-horizontal-dark.svg' : '/brand/talentral-logo-horizontal.svg'}
      alt="Talentral" width={Math.round(height * 3.9)} height={height} priority unoptimized />
  );
  return href ? <Link href={href} aria-label="Talentral home">{img}</Link> : img;
}
