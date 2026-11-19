'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import type { ShellAccountContext } from '@/lib/auth/shell-account-context';

type AccountMenuProps = {
  account: ShellAccountContext | null;
};

function initialsFromEmail(email: string | null): string {
  if (!email) return '?';
  const local = email.split('@')[0] ?? '';
  return (local.slice(0, 2) || '?').toUpperCase();
}

export function AccountMenu({ account }: AccountMenuProps) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!account) {
    return (
      <Link href="/sign-in" className="fg-account-menu__sign-in">
        Sign in
      </Link>
    );
  }

  const label = account.email || 'Account';

  return (
    <div className="fg-account-menu" ref={rootRef}>
      <button
        type="button"
        className="fg-account-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="fg-account-menu__avatar" aria-hidden="true">
          {initialsFromEmail(account.email)}
        </span>
        <span className="fg-account-menu__trigger-label">Account</span>
      </button>
      {open ? (
        <div className="fg-account-menu__panel" id={menuId} role="menu">
          <div className="fg-account-menu__meta">
            <p className="fg-account-menu__email">{label}</p>
            {account.selectionRequired ? (
              <p className="fg-account-menu__warn">Select an active organisation to continue.</p>
            ) : account.organisationId ? (
              <>
                <p className="fg-account-menu__org">
                  <span className="fg-account-menu__k">Organisation</span>
                  <strong>{account.organisationName ?? account.organisationId}</strong>
                </p>
                <p className="fg-account-menu__mono">{account.organisationId}</p>
                {account.role ? (
                  <p className="fg-account-menu__role">
                    <span className="fg-account-menu__k">Role</span> {account.role}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="fg-account-menu__warn">No organisation membership provisioned yet.</p>
            )}
          </div>
          <div className="fg-account-menu__actions" role="none">
            <Link href="/" className="fg-account-menu__action" role="menuitem" onClick={() => setOpen(false)}>
              Platform home
            </Link>
            <Link href="/sign-out" className="fg-account-menu__action fg-account-menu__action--signout" role="menuitem">
              Sign out
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
