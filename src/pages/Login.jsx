import React from 'react';
import { LogIn } from 'lucide-react';
import AccountHandoff from '@/components/account/AccountHandoff';

export default function Login() {
  return (
    <AccountHandoff
      icon={LogIn}
      title="Sign in to your DJHC account"
      subtitle="Customer sign-in is managed on the storefront"
      message="SwishIQ Studio is open in guest mode and does not keep a separate customer login. Continue to the existing DJHC account page to sign in or manage your profile."
      actionLabel="Continue to DJHC account"
    />
  );
}
