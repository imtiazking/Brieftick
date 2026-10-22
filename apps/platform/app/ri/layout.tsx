import { RiSubnav } from '@/components/ri/ri-subnav';

export default function RiLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fg-ri-layout ri-shell" data-ri-golden-master="production">
      <RiSubnav />
      <div className="ri-main">{children}</div>
    </div>
  );
}
