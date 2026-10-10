export type TakePublicSubmissionSlotArgs = {
  p_scope: string;
  p_fingerprint: string;
  p_limit: number;
  p_window_seconds: number;
};

export type TakePublicSubmissionSlotRpc = (
  name: 'take_public_submission_slot',
  args: TakePublicSubmissionSlotArgs,
) => Promise<{
  error: {
    code?: string;
    message?: string;
  } | null;
}>;

export type SwishIqEdgeDatabase = {
  public: {
    Tables: {};
    Views: {};
    Functions: {
      take_public_submission_slot: {
        Args: TakePublicSubmissionSlotArgs;
        Returns: undefined;
      };
    };
    Enums: {};
    CompositeTypes: {};
  };
};
