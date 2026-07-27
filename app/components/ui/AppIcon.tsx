export type AppIconName =
  | "aircraft"
  | "drone"
  | "rescue"
  | "weather"
  | "moon"
  | "operations"
  | "info"
  | "pulse";

const paths: Record<AppIconName, React.ReactNode> = {
  aircraft: <path d="M12 2.8c1 0 1.7.9 1.7 2.1v4.4l6.8 4c.6.4 1 .9 1 1.6v1.7l-7.8-2.1v3.3l2.7 1.7V21L12 19.9 7.6 21v-1.5l2.7-1.7v-3.3l-7.8 2.1v-1.7c0-.7.4-1.2 1-1.6l6.8-4V4.9c0-1.2.7-2.1 1.7-2.1Z" />,
  drone: <><path d="M8.2 8.2h7.6v7.6H8.2z" /><path d="m8.8 9-4-3m10.4 3 4-3M8.8 15l-4 3m10.4-3 4 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><circle cx="4" cy="5.3" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.5" /><circle cx="20" cy="5.3" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.5" /><circle cx="4" cy="18.7" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.5" /><circle cx="20" cy="18.7" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.5" /></>,
  rescue: <><path d="M4 13.5h10.2c2.9 0 4.7 1.5 5.8 4H10c-2.6 0-4.6-1.3-6-4Z" /><path d="M13.5 7.5h1.5v6h-1.5zM5 8.8h15v1.4H5z" /><circle cx="9" cy="19.2" r="1.3" /><circle cx="16" cy="19.2" r="1.3" /></>,
  weather: <><path d="M8.8 17.5h9.1a3.6 3.6 0 0 0 .2-7.2A5.5 5.5 0 0 0 7.7 8.9a4.3 4.3 0 0 0 1.1 8.6Z" /><path d="M12 1.8v2.1M4.8 4.8l1.5 1.5M19.2 4.8l-1.5 1.5M2 12h2.1" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></>,
  moon: <path d="M18.9 15.2A7.5 7.5 0 0 1 8.8 5.1 8.2 8.2 0 1 0 18.9 15.2Z" />,
  operations: <><circle cx="12" cy="12" r="3.2" /><path d="M12 2.4v3M12 18.6v3M2.4 12h3M18.6 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></>,
  info: <><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M12 10.5v6M12 7.2v.2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></>,
  pulse: <path d="M2.5 12h4l2-5 3.2 10 2.6-7 1.7 2h5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
};

export default function AppIcon({ name, size = 22, className }: { name: AppIconName; size?: number; className?: string }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{paths[name]}</svg>;
}
