import { RiSubnav } from '@/components/ri/ri-subnav';

export default function RiLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fg-ri-layout">
      <RiSubnav />
      {children}
    </div>
  );
}
