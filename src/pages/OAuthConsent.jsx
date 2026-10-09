import React from 'react';
import { ShieldCheck } from 'lucide-react';
import AccountHandoff from '@/components/account/AccountHandoff';

export default function OAuthConsent() {
  return (
    <AccountHandoff
      icon={ShieldCheck}
      title="DJHC account access"
      subtitle="Customer accounts are handled on the storefront"
      message="SwishIQ Studio does not approve external account permissions. If you need your DJHC customer profile, sign-in, or order history, continue to the store account page."
      actionLabel="Open DJHC account"
    />
  );
}
