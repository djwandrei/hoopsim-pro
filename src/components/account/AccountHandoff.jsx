import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import { DJHC_ACCOUNT_URL } from '@/lib/AuthContext';

export default function AccountHandoff({ icon, title, subtitle, message, actionLabel = 'Open DJHC account' }) {
  return (
    <AuthLayout
      icon={icon}
      title={title}
      subtitle={subtitle}
      footer={<Link to="/" className="font-medium text-primary hover:underline">Back to SwishIQ Studio</Link>}
    >
      <div className="space-y-5 text-center">
        <p className="text-sm leading-relaxed text-muted-foreground">{message}</p>
        <a
          href={DJHC_ACCOUNT_URL}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          {actionLabel}
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </a>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Studio tools remain available in guest mode. Studio saves and preferences stay in this browser.
        </p>
      </div>
    </AuthLayout>
  );
}
