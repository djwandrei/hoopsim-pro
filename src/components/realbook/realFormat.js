// Dollar formatting helpers for the real-money book (cents in, dollars out).
export const dollars = cents => {
  const value = (Number(cents) || 0) / 100;
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const signedDollars = cents => `${Number(cents) >= 0 ? '+' : '−'}${dollars(Math.abs(Number(cents) || 0))}`;