import React from 'react';
import { KeyRound } from 'lucide-react';
import AccountHandoff from '@/components/account/AccountHandoff';

export default function ResetPassword() {
  return (
    <AccountHandoff
      icon={KeyRound}
      title="Finish your DJHC password reset"
      subtitle="The storefront completes password changes"
      message="Password reset links issued by DJHC are processed on the store account page. Continue there to complete account recovery."
      actionLabel="Continue to DJHC account"
    />
  );
}
