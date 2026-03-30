interface SystemBannerProps {
  title: string;
  description: string;
}

export function SystemBanner({ title, description }: SystemBannerProps) {
  return (
    <aside className="banner">
      <strong>{title}</strong>
      <p>{description}</p>
    </aside>
  );
}
