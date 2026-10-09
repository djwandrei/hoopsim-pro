import React from 'react';
import { Mail } from 'lucide-react';
import AccountHandoff from '@/components/account/AccountHandoff';

export default function ForgotPassword() {
  return (
    <AccountHandoff
      icon={Mail}
      title="Reset your DJHC password"
      subtitle="Password recovery runs through the store account"
      message="Open the DJHC customer account page and choose password recovery from its sign-in flow. Reset emails and recovery links are handled there."
      actionLabel="Open DJHC account"
    />
  );
}
