import React from 'react';
import { UserRoundPlus } from 'lucide-react';
import AccountHandoff from '@/components/account/AccountHandoff';

export default function Register() {
  return (
    <AccountHandoff
      icon={UserRoundPlus}
      title="Create a DJHC customer account"
      subtitle="Account registration belongs to the storefront"
      message="Create your customer account through the existing DJHC store account page. SwishIQ Studio stays available without registration, and it does not create a second identity."
      actionLabel="Continue to DJHC account"
    />
  );
}
